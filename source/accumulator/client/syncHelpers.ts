import { CID } from "../../utils/CID"
import type { NormalizedLeafInsertEvent, newLeafSubscriber, PeakWithHeight, LeafRecord } from "../../types/types"
import { getAccumulatorData, getLeafInsertLogs, getLatestCID } from "../../ethereum/commonCalls"
import {
	getLeafIndexesWithMissingNewData,
	getLeafRecord,
	putLeafRecordInDB,
} from "./storageHelpers"
import { getAndResolveCID } from "./ipfsHelpers"
import { commitLeafToMMR } from "./mmrHelpers"
import { StorageAdapter } from "../../interfaces/StorageAdapter"
import { walkBackLeafInsertLogsOrThrow } from "../../utils/walkBackLogsOrThrow"
import { computePreviousRootCIDAndPeaksWithHeights, getRootCIDFromPeaks } from "../merkleMountainRange/mmrUtils"
import { IpfsAdapter } from "../../interfaces/IpfsAdapter"
import { getLeafRecordFromNormalizedLeafInsertEvent, uint8ArrayToHexString } from "../../utils/codec"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange"
// ================================================
// REAL-TIME EVENT MONITORING
// Logic for watching the blockchain for new events
// and keeping the accumulator node up-to-date.
// ================================================

/**
 * Syncs backwards from the latest leaf/block, fetching events and storing by leafIndex.
 * Uses on-chain metadata to determine where to start.
 */
export async function syncBackwardsFromLatest(
	ipfs: IpfsAdapter,
	storageAdapter: StorageAdapter,
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	setLastProcessedBlock: (block: number) => void,
	getAccumulatorDataCalldataOverride?: string,
	eventTopicOverride?: string,
	maxBlockRangePerRpcCall = 1000,
): Promise<void> {
	const { meta, peaks } = await getAccumulatorData({
		ethereumHttpRpcUrl,
		contractAddress,
		getAccumulatorDataCalldataOverride,
	})
	const currentLeafIndex = meta.leafCount - 1
	const currentBlock = meta.previousInsertBlockNumber
	const minBlock = meta.deployBlockNumber
	setLastProcessedBlock(meta.previousInsertBlockNumber)

	const highestLeafIndexInDB = await storageAdapter.getHighestContiguousLeafIndexWithData()

	console.log(
		`[Client] \u{1F501} Syncing backwards from block ${meta.previousInsertBlockNumber} to block ${meta.deployBlockNumber} (${meta.previousInsertBlockNumber - meta.deployBlockNumber} blocks), grabbing ${maxBlockRangePerRpcCall} blocks per RPC call.`,
	)
	console.log(`[Client] \u{1F50E} Simultaneously checking IPFS for older root CIDs as we discover them.`)

	// Compute the current root CID from the current peaks
	const currentRootCID = await getRootCIDFromPeaks(peaks.map((p) => p.cid))

	let oldestRootCid: CID<unknown, 113, 18, 1> = currentRootCID
	let oldestProcessedLeafIndex = currentLeafIndex + 1
	let currentPeaksWithHeights: PeakWithHeight[] = peaks

	const ipfsChecks: Array<
		ReturnType<typeof makeTrackedPromise<boolean>> & { controller: AbortController; cid: CID<unknown, 113, 18, 1> }
	> = []

	// --- Utility: tracked promise for polling ---
	function makeTrackedPromise<T>(promise: Promise<T>) {
		let isFulfilled = false
		let value: T | undefined
		const tracked = promise.then((v) => {
			isFulfilled = true
			value = v
			return v
		})
		return { promise: tracked, isFulfilled: () => isFulfilled, getValue: () => value }
	}

	// --- Batch event fetching ---
	for (let endBlock = currentBlock; endBlock >= minBlock; endBlock -= maxBlockRangePerRpcCall) {
		const startBlock = Math.max(minBlock, endBlock - maxBlockRangePerRpcCall + 1)
		console.log(`[Client] \u{1F4E6} Checking blocks ${startBlock} to ${endBlock} for LeafInsert events...`)
		// Get the LeafInsert event logs
		const logs: NormalizedLeafInsertEvent[] = await getLeafInsertLogs({
			ethereumHttpRpcUrl,
			contractAddress,
			fromBlock: startBlock,
			toBlock: endBlock,
			eventTopicOverride,
		})

		if (logs.length > 0) console.log(`[Client] \u{1F343} Found ${logs.length} LeafInsert events`)

		// Process the LeafInsert event logs
		for (const event of logs.sort((a, b) => b.leafIndex - a.leafIndex)) {
			if (event.leafIndex !== --oldestProcessedLeafIndex)
				throw new Error(
					`[Client] Expected leafIndex ${oldestProcessedLeafIndex} but got leafIndex ${event.leafIndex}`,
				)
			// Compute previous root CID and peaks
			const { previousRootCID, previousPeaksWithHeights } = await computePreviousRootCIDAndPeaksWithHeights(
				currentPeaksWithHeights,
				event.newData,
				event.leftInputs,
			)
			// Store the relevat data in the DB
			await putLeafRecordInDB(storageAdapter, event.leafIndex, {
				newData: event.newData,
				event,
				blockNumber: event.blockNumber,
				rootCid: previousRootCID,
				peaksWithHeights: previousPeaksWithHeights,
			})
			// Update for next iteration
			currentPeaksWithHeights = previousPeaksWithHeights
			oldestRootCid = previousRootCID
		}

		// After processing all events in this batch, fire off an IPFS check for the oldestRootCid
		const controller = new AbortController()
		const tracked = makeTrackedPromise(
			getAndResolveCID(ipfs, storageAdapter, oldestRootCid, { signal: controller.signal }).catch((err) => {
				if (err?.name === "AbortError") return false
				throw err
			}),
		)
		ipfsChecks.push({ ...tracked, controller, cid: oldestRootCid })
		// After each batch, poll for any truthy-resolved IPFS check
		const successfulIndex = ipfsChecks.findIndex((c) => c.isFulfilled() && c.getValue())
		if (successfulIndex !== -1) {
			// Abort all outstanding checks
			ipfsChecks.forEach((c) => c.controller.abort())
			const foundIpfsCid = ipfsChecks[successfulIndex].cid
			// Sanity check to make sure we didn't unexpectedly miss any datda
			const missing = await getLeafIndexesWithMissingNewData(storageAdapter, currentLeafIndex)
			if (missing.length !== 0) throw new Error("Unexpectedly missing newData for leaf indices: " + missing.join(", "))
			console.log(
				`[Client] \u{1F4E5} Downloaded all data for root CID ${foundIpfsCid?.toString() ?? "undefined"} from IPFS.`,
			)
			console.log(`[Client] \u{1F64C} Successfully resolved all remaining data from IPFS!`)
			console.log(`[Client] 🌲 Your accumulator client has acquired all data!`)
			await storageAdapter.persist()
			return
		}
		// We can also stop syncing backwards if we get back to a leaf that we laready have
		if (oldestProcessedLeafIndex <= highestLeafIndexInDB) break
	}
	// If we get here, we've fully synced backwards using only event data (no data found on IPFS)
	// Abort all outstanding IPFS checks
	ipfsChecks.forEach((c) => c.controller.abort())
	// Wait for all outstanding IPFS check promises to settle (resolve or reject)
	await Promise.allSettled(ipfsChecks.map((c) => c.promise))
	// Sanity check to make sure we didn't unexpectedly miss any datda
	const missing = await getLeafIndexesWithMissingNewData(storageAdapter, currentLeafIndex)
	if (missing.length !== 0) {
		throw new Error("[Client] Missing newData for leaf indices: " + missing.join(", "))
	}
	console.log(
		"[Client] \u{1F9BE} Fully synced backwards using only event data and local DB data (no data used from IPFS)",
	)
	console.log(`[Client] 🌲 Your accumulator client has acquired all data!`)
	await storageAdapter.persist()
}

/**
 * Listens for new events and keeps the node up-to-date in real time.
 * Automatically uses polling if subscriptions are not supported or no WS URL is provided.
 */
export async function startLiveSync(
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
	contractAddress: string,
	ethereumHttpRpcUrl: string,
	ethereumWsRpcUrl: string | undefined,
	ws: WebSocket | undefined,
	setWs: (newWs: WebSocket | undefined) => void,
	getLiveSyncRunning: () => boolean,
	setLiveSyncRunning: (isRUnning: boolean) => void,
	setLiveSyncInterval: (interval: ReturnType<typeof setTimeout> | undefined) => void,
	newLeafSubscribers: newLeafSubscriber[],
	getLastProcessedBlock: () => number,
	setLastProcessedBlock: (blockNumber: number) => void,
	getAccumulatorDataCalldataOverride?: string,
	getLatestCidCalldataOverride?: string,
	eventTopicOverride?: string,
	pollIntervalMs = 10_000,
): Promise<void> {
	if (getLiveSyncRunning()) return
	setLiveSyncRunning(true)

	let useSubscription = false
	if (ethereumWsRpcUrl) {
		console.log(`[Client] 🔗 Detected ETHEREUM_WS_RPC_URL: ${ethereumWsRpcUrl}`)
		useSubscription = await detectSubscriptionSupport(ethereumWsRpcUrl)
		if (!useSubscription) {
			console.log("[Client] \u{274C} WS endpoint does not support eth_subscribe, falling back to polling.")
		}
	} else {
		console.log("[Client] 👎 No ETHEREUM_WS_RPC_URL provided, will use polling.")
	}
	console.log(
		`[Client] \u{1F440} Using ${useSubscription ? "websocket subscription" : "HTTP polling"} to monitor the chain for new data insertions.`,
	)
	if (useSubscription) {
		startSubscriptionSync({
			mmr,
			storageAdapter,
			ethereumHttpRpcUrl,
			ethereumWsRpcUrl,
			ws,
			setWs,
			getLastProcessedBlock,
			setLastProcessedBlock,
			newLeafSubscribers,
			contractAddress,
			getAccumulatorDataCalldataOverride,
			eventTopicOverride,
		})
	} else {
		startPollingSync({
			mmr,
			storageAdapter,
			ethereumHttpRpcUrl,
			contractAddress,
			getLiveSyncRunning,
			setLiveSyncInterval,
			newLeafSubscribers,
			getLastProcessedBlock,
			setLastProcessedBlock,
			getAccumulatorDataCalldataOverride,
			getLatestCidCalldataOverride,
			eventTopicOverride,
			pollIntervalMs,
		})
	}
}

// Stops live synchronization and cleans up resources.
export function stopLiveSync(
	ws: WebSocket | undefined,
	setWs: (ws: WebSocket | undefined) => void,
	getLiveSyncInterval: () => ReturnType<typeof setTimeout> | undefined,
	setLiveSyncRunning: (isRunning: boolean) => void,
	setLiveSyncInterval: (interval: ReturnType<typeof setTimeout> | undefined) => void,
) {
	setLiveSyncRunning(false)
	if (getLiveSyncInterval()) {
		clearTimeout(getLiveSyncInterval())
		setLiveSyncInterval(undefined)
	}
	if (ws) {
		ws.close()
		setWs(undefined)
	}
}

/**
 * Attempts to detect if the given wsUrl supports Ethereum subscriptions (eth_subscribe).
 * Returns true if successful, false otherwise.
 */
export async function detectSubscriptionSupport(wsUrl: string): Promise<boolean> {
	if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
		console.log(`[Client] 👎 ETHEREUM_WS_RPC_URL is not a ws:// or wss:// URL: ${wsUrl}`)
		return false
	}
	console.log(`[Client] 🙏 Attempting to open WebSocket and send eth_subscribe to ${wsUrl}...`)
	return await new Promise<boolean>((resolve) => {
		let ws: WebSocket | null = null
		let finished = false
		const timeout = setTimeout(() => {
			if (!finished) {
				finished = true
				if (ws) ws.close()
				resolve(false)
			}
		}, 3000)

		try {
			ws = new WebSocket(wsUrl)
			ws.onopen = () => {
				// Send a test eth_subscribe request
				const msg = JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "eth_subscribe",
					params: ["newHeads"],
				})
				ws!.send(msg)
			}
			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data)
					if (data.id === 1 && (data.result || data.error)) {
						if (!finished) {
							finished = true
							clearTimeout(timeout)
							ws!.close()
							resolve(!data.error)
						}
					}
				} catch {
					/* ignore parse errors */
				}
			}
			ws.onerror = () => {
				if (!finished) {
					finished = true
					clearTimeout(timeout)
					ws!.close()
					resolve(false)
				}
			}
			ws.onclose = () => {
				if (!finished) {
					finished = true
					clearTimeout(timeout)
					resolve(false)
				}
			}
		} catch {
			if (!finished) {
				finished = true
				clearTimeout(timeout)
				if (ws) ws.close()
				resolve(false)
			}
		}
	})
}

export function startPollingSync(params: {
	mmr: MerkleMountainRange
	storageAdapter: StorageAdapter
	ethereumHttpRpcUrl: string
	contractAddress: string
	getLiveSyncRunning: () => boolean
	setLiveSyncInterval: (interval: ReturnType<typeof setTimeout> | undefined) => void
	newLeafSubscribers: newLeafSubscriber[]
	getLastProcessedBlock: () => number
	setLastProcessedBlock: (blockNumber: number) => void
	getAccumulatorDataCalldataOverride?: string
	getLatestCidCalldataOverride?: string
	eventTopicOverride?: string
	pollIntervalMs?: number
}) {
	const {
		mmr,
		storageAdapter,
		ethereumHttpRpcUrl,
		contractAddress,
		getLiveSyncRunning,
		setLiveSyncInterval,
		newLeafSubscribers,
		getLastProcessedBlock,
		setLastProcessedBlock,
		getAccumulatorDataCalldataOverride,
		getLatestCidCalldataOverride,
		eventTopicOverride,
		pollIntervalMs,
	} = params
	const poll = async () => {
		try {
			const result = await getAccumulatorData({
				ethereumHttpRpcUrl,
				contractAddress,
				getAccumulatorDataCalldataOverride,
			})
			const { meta } = result
			const youngestBlockToCheck = meta.previousInsertBlockNumber
			if (youngestBlockToCheck > getLastProcessedBlock()) {
				const newEvents = await getLeafInsertLogs({
          ethereumHttpRpcUrl,
          contractAddress,
          fromBlock: getLastProcessedBlock() + 1,
          toBlock: youngestBlockToCheck,
          eventTopicOverride,
        })
				for (const event of newEvents) {
					await processNewLeafEvent({
						mmr,
						storageAdapter,
						ethereumHttpRpcUrl,
						contractAddress,
						event,
						newLeafSubscribers,
						getAccumulatorDataCalldataOverride,
						getLatestCidCalldataOverride,
						eventTopicOverride,
					})
				}
				setLastProcessedBlock(youngestBlockToCheck)
			}
		} catch (err) {
			console.error("[LiveSync] Error during polling:", err)
		}
		if (getLiveSyncRunning()) {
			setLiveSyncInterval(setTimeout(poll, pollIntervalMs ?? 10_000))
		}
	}
	poll()
}

export function startSubscriptionSync( params: {
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
	ethereumHttpRpcUrl: string,
	ethereumWsRpcUrl: string | undefined,
	ws: WebSocket | undefined,
	setWs: (ws: WebSocket | undefined) => void,
	getLastProcessedBlock: () => number,
	setLastProcessedBlock: (block: number) => void,
	newLeafSubscribers: newLeafSubscriber[],
	contractAddress: string,
	getAccumulatorDataCalldataOverride?: string,
	eventTopicOverride?: string,
}): void {
	const { mmr, storageAdapter, ethereumHttpRpcUrl, ethereumWsRpcUrl, ws, setWs, getLastProcessedBlock, setLastProcessedBlock, newLeafSubscribers, contractAddress, getAccumulatorDataCalldataOverride, eventTopicOverride } = params
	if (!ethereumWsRpcUrl) {
		console.error("[Client] No ETHEREUM_WS_RPC_URL set. Cannot start subscription sync.")
		return
	}
	if (ws) {
		console.warn("[Client] Subscription WebSocket already running.")
		return
	}
	console.log(`[Client] Connecting to WS: ${ethereumWsRpcUrl}`)

	const newWs = new WebSocket(ethereumWsRpcUrl)
	setWs(newWs)
	newWs.onopen = () => {
		console.log("[Client] WebSocket open. Subscribing to newHeads...")
		const msg = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_subscribe",
			params: ["newHeads"],
		})
		newWs.send(msg)
	}

	let subscriptionId: string | null = null
	newWs.onmessage = async (event: any) => {
		try {
			const data = JSON.parse(event.data)
			if (data.id === 1 && data.result) {
				subscriptionId = data.result
				console.log(`[Client] Subscribed to newHeads. Subscription id: ${subscriptionId}`)
				return
			}
			// Handle new block notifications
			if (data.method === "eth_subscription" && data.params && data.params.subscription === subscriptionId) {
				const blockHash = data.params.result.hash
				console.log(`[Client] New block: ${blockHash}. Fetching events...`)
				// Get latest block number and process new events
				try {
					const { meta } = await getAccumulatorData({
						ethereumHttpRpcUrl,
						contractAddress,
						getAccumulatorDataCalldataOverride,
					})
					const currentLastProcessedBlock = getLastProcessedBlock()
					const latestBlock = meta.previousInsertBlockNumber
					if (latestBlock > currentLastProcessedBlock) {
						const newEvents = await getLeafInsertLogs({
							ethereumHttpRpcUrl,
							contractAddress,
							fromBlock: currentLastProcessedBlock + 1,
							toBlock: latestBlock,
							eventTopicOverride,
						})
						for (const event of newEvents) {
							await processNewLeafEvent({
								mmr,
								storageAdapter,
								ethereumHttpRpcUrl,
								contractAddress,
								event,
								newLeafSubscribers,
								getAccumulatorDataCalldataOverride,
								eventTopicOverride,
							})
						}
						setLastProcessedBlock(latestBlock)
					}
				} catch (err) {
					console.error("[LiveSync] Error during WS event processing:", err)
				}
			}
		} catch (err) {
			console.error("[Client] Error parsing WS message:", err)
		}
	}
	newWs.onerror = (err: any) => {
		console.error("[Client] WebSocket error:", err)
	}
	newWs.onclose = () => {
		console.log("[Client] WebSocket closed.")
		params.setWs(undefined)
	}
}
// Sends a new leaf event to the DB and (if applicable) to the MMR), backfilling if necessary.
export async function processNewLeafEvent( params: {
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	event: NormalizedLeafInsertEvent,
	newLeafSubscribers: newLeafSubscriber[],
	getAccumulatorDataCalldataOverride?: string,
	getLatestCidCalldataOverride?: string,
	eventTopicOverride?: string,
}): Promise<void> {
	const { mmr, storageAdapter, ethereumHttpRpcUrl, contractAddress, event, newLeafSubscribers, getAccumulatorDataCalldataOverride, getLatestCidCalldataOverride, eventTopicOverride } = params
	// handle DB
	await processNewLeafEventForDB(
		storageAdapter,
		ethereumHttpRpcUrl,
		contractAddress,
		event,
		newLeafSubscribers,
		eventTopicOverride,
	)
	// handle MMR
	await processNewLeafEventForMMR(
		mmr,
		storageAdapter,
		event.leafIndex,
		event.newData,
	)
	// Handle subscribers
	for (const callback of newLeafSubscribers) callback(event.leafIndex, uint8ArrayToHexString(event.newData))
	// SANITY CHECK
	// === THE FOLLOWING CODE BLOCK CAN BE REMOVED. IT IS JUST A SANITY CHECK. ===
	const { meta } = await getAccumulatorData({
		ethereumHttpRpcUrl,
		contractAddress,
		getAccumulatorDataCalldataOverride,
	})
	// This sanity check only makes sense when the node is fully synced
	if (mmr.leafCount - 1 === meta.leafCount - 1) {
		try {
			const localRootCid = await mmr.rootCIDAsBase32()
			const onChainRootCid = await getLatestCID({
				ethereumHttpRpcUrl,
				contractAddress,
				getLatestCidCalldataOverride,
			})
			if (localRootCid !== onChainRootCid.toString()) {
				console.warn(
					`[Client] 🧠 Sanity check: \u{274C} Local (${localRootCid} )and on-chain (${onChainRootCid.toString()}) root CIDs do NOT match!`,
				)
			} else {
				console.log("[Client] 🧠 Sanity check: 😅 Local and on-chain root CIDs match!")
			}
		} catch (err) {
			console.warn("[Client] 🧠 Sanity check: \u{274C} Failed to compare root CIDs:", err)
		}
	}
	// =============================== END SANITY CHECK. ===============================

	console.log(`[Client] \u{1F343} Processed new leaf with index ${event.leafIndex}`)
}


// Adds a new leaf to the DB (backfilling if necessary)
async function processNewLeafEventForDB(
	storageAdapter: StorageAdapter,
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	event: NormalizedLeafInsertEvent,
	newLeafSubscribers: newLeafSubscriber[],
	eventTopicOverride?: string,
): Promise<void> {
	const highestContiguousLeafIndex = await storageAdapter.getHighestContiguousLeafIndexWithData()

	// return if we have already have this leaf data in the DB
	if (event.leafIndex <= highestContiguousLeafIndex) return
	if (event.leafIndex > highestContiguousLeafIndex + 1) {
		console.log(
			`[Client] \u{1F4CC} Missing event for leaf indexes ${highestContiguousLeafIndex + 1} to ${event.leafIndex - 1}. Getting them now...`,
		)
		// Walk back through the previousInsertBlockNumber's to get the missing leaves
		const pastEvents: NormalizedLeafInsertEvent[] = await walkBackLeafInsertLogsOrThrow(
			ethereumHttpRpcUrl,
			contractAddress,
			event.leafIndex - 1,
			event.previousInsertBlockNumber,
			highestContiguousLeafIndex + 1,
			eventTopicOverride,
		)
		// Process the missing events
		for (let i = 0; i < pastEvents.length; i++) {
			await processNewLeafEventForDB(
				storageAdapter,
				ethereumHttpRpcUrl,
				contractAddress,
				pastEvents[i],
				newLeafSubscribers,
				eventTopicOverride
			)
		}
		console.log(`[Client] \u{1F44D} Got the missing events.`)
	}

	// Store the event in the DB
	await putLeafRecordInDB(storageAdapter, event.leafIndex, getLeafRecordFromNormalizedLeafInsertEvent(event))
}

export async function processNewLeafEventForMMR(
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
	leafIndex: number,
	newData: Uint8Array,
): Promise<void> {
	const highestCommittedLeafIndex = mmr.leafCount - 1
	// return if we have already have this leaf data in the MMR
	if (leafIndex <= highestCommittedLeafIndex) return
	if (leafIndex > highestCommittedLeafIndex + 1) {
		console.log(`[Client] \u{1F4CC} Lower indexed leaves ${highestCommittedLeafIndex + 1} to ${leafIndex - 1} have yet to be processed by the MMR. Processing them now...`)
		// Walk back through the previousInsertBlockNumber's to get the missing leaves
		// Get {leafIndex: number, newData: Uint8Array}[] for leafIndex from (highestCommittedLeafIndex + 1) to (leafIndex - 1)
		const missingLeaves: { leafIndex: number; newData: Uint8Array }[] = [];
		for (let i = highestCommittedLeafIndex + 1; i < leafIndex; i++) {
			const record : LeafRecord | undefined = await getLeafRecord(storageAdapter, i)
			if (record === undefined) throw new Error(`Missing leaf data for leaf index ${i}`)
			missingLeaves.push({ leafIndex: i, newData: record.newData })
		}
		for (let i = 0; i < missingLeaves.length; i++) {
			await processNewLeafEventForMMR(
				mmr,
				storageAdapter,
				missingLeaves[i].leafIndex,
				missingLeaves[i].newData,
			)
		}
		console.log(`[Client] \u{1F44D} Processed the missing events in the MMR.`)
	}

	// Commit the leaf to the MMR
	await commitLeafToMMR(
		storageAdapter,
		mmr,
		leafIndex,
		newData,
	)
	// TODO: IMPORTANT!MMR should have a callback feature where every time a leaf gets added to it, the trails gets returned to 
	// subscribers. And the IPFS putPinProvide should be registered as a provider
	// for (const callback of newMMRCommittedLeafSubscribers) callback(leafIndex, uint8ArrayToHexString(newData))
	console.log(`[Client] \u{1F343} Added new leaf with index ${leafIndex} to the MMR.`)
}

export function onNewLeaf(newLeafSubscribers: newLeafSubscriber[], callback: (index: number, data: string) => void): () => void {
	newLeafSubscribers.push(callback)
	// Return unsubscribe function
	return () => {
		const idx = newLeafSubscribers.indexOf(callback)
		if (idx !== -1) newLeafSubscribers.splice(idx, 1)
	}
}
