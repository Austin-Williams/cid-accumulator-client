import { getSelector, getEventTopic, parseLeafAppendedLog } from "./abiUtils"
import { callContractView, ethRpcFetch } from "./ethRpcFetch"
import { parseGetRootCIDResult, parseGetStateResult, parseAccumulatorMetaBits } from "./abiUtils"
import { AccumulatorMetadata, NormalizedLeafAppendedtEvent, PeakWithHeight, RawEthLog } from "../types/types"
import { CID } from "../utils/CID.js"
import { contractPeakHexToMmrCid } from "../utils/codec"

/**
 * Fetches the latest CID from the contract using a raw JSON-RPC call and ABI decoding.
 * @param ethereumHttpRpcUrl - The Ethereum node RPC URL
 * @param contractAddress - The deployed contract address
 * @returns The latest CID as a multiformats.CID object
 */
export async function getRootCID(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	getRootCidSignatureOverride?: string
	getRootCidCalldataOverride?: string
	blockTag?: number
}): Promise<CID> {
	const { ethereumHttpRpcUrl, contractAddress, getRootCidSignatureOverride, getRootCidCalldataOverride, blockTag } =
		params
	const blockTagHex: string = blockTag ? "0x" + blockTag.toString(16) : "latest"
	const signature = getRootCidSignatureOverride ?? "getRootCID()"
	const selector = getSelector(signature)
	const callData = getRootCidCalldataOverride ?? selector
	const contractRootHex: string = await callContractView(ethereumHttpRpcUrl, contractAddress, callData, blockTagHex)
	const contractRootBytes = parseGetRootCIDResult(contractRootHex)
	return CID.decode(Uint8Array.from(contractRootBytes))
}

export async function getState(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	getStateCalldataOverride?: string
	blockTag?: number
}): Promise<{ meta: AccumulatorMetadata; peaks: PeakWithHeight[] }> {
	try {
		const { ethereumHttpRpcUrl, contractAddress, getStateCalldataOverride, blockTag } = params
		const blockTagHex: string = blockTag ? "0x" + blockTag.toString(16) : "latest"

		const signature = "getState()"
		const selector = getSelector(signature)
		const callData = getStateCalldataOverride ?? selector
		const accumulatorDataHex: string = await callContractView(
			ethereumHttpRpcUrl,
			contractAddress,
			callData,
			blockTagHex,
		)

		const [mmrMetaBits, peaks] = parseGetStateResult(accumulatorDataHex)
		const meta = parseAccumulatorMetaBits(mmrMetaBits)
		const activePeaks: Uint8Array[] = peaks.slice(0, meta.peakCount) // only active peaks
		const activePeaksAsCids: CID<unknown, 113, 18, 1>[] = activePeaks.map(contractPeakHexToMmrCid)
		const activePeaksWithHeight: PeakWithHeight[] = activePeaksAsCids.map((cid, i) => ({
			cid,
			height: meta.peakHeights[i],
		}))
		return { meta, peaks: activePeaksWithHeight }
	} catch (err) {
		console.error("[getState] Error:", err)
		throw err
	}
}

// --------------------- EVENTS --------------------
// Helper to format block numbers as 0x-prefixed hex strings
function toHexBlock(n: number): string {
	return "0x" + n.toString(16)
}

/**
 * Finds LeafAppended events using eth_getLogs.
 * @param ethereumHttpRpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @returns Promise<any[]> (array of log objects)
 */
export async function getLeafAppendedLogs(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	fromBlock: number
	toBlock: number
	eventTopicOverride?: string
}): Promise<NormalizedLeafAppendedtEvent[]> {
	const { ethereumHttpRpcUrl, contractAddress, fromBlock, toBlock, eventTopicOverride } = params
	const eventTopic = eventTopicOverride ?? getEventTopic("LeafAppended(uint32,uint32,bytes,bytes32[])")
	const rawLogs: RawEthLog[] = await ethRpcFetch(ethereumHttpRpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics: [eventTopic],
			fromBlock: toHexBlock(fromBlock),
			toBlock: toHexBlock(toBlock),
		},
	])

	// Warn if topics[0] does not match eventTopic
	rawLogs.forEach((log, idx) => {
		const topic0 = log.topics ? log.topics[0].toLowerCase() : undefined
		const expected = eventTopic.toLowerCase()
		if (!log.topics || topic0 !== expected) {
			console.warn(
				`[WARN:getLeafAppendedLogs] log[${idx}].topics[0] does not match eventTopic. topics[0]:`,
				topic0,
				"| eventTopic:",
				expected,
			)
		}
	})

	const parsedLogs: NormalizedLeafAppendedtEvent[] = await Promise.all(
		rawLogs
			.filter((log) => log.topics && log.topics[0] && log.topics[0].toLowerCase() === eventTopic.toLowerCase())
			.map(async (log) => {
				return await parseLeafAppendedLog(log)
			}),
	)
	return parsedLogs
}

/**
 * Finds a LeafAppended log for a specific leaf index using eth_getLogs.
 * @param ethereumHttpRpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @param targetLeafIndex number (the leaf index to filter for)
 * @returns Promise<any[]> (array of log objects for that leaf index)
 */
export async function getLeafAppendedLogForTargetLeafIndex(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	fromBlock: number
	toBlock: number
	targetLeafIndex: number
	eventTopicOverride?: string
}): Promise<NormalizedLeafAppendedtEvent | null> {
	const { ethereumHttpRpcUrl, contractAddress, fromBlock, toBlock, targetLeafIndex, eventTopicOverride } = params
	const eventTopic = eventTopicOverride ?? getEventTopic("LeafAppended(uint32,uint32,bytes,bytes32[])")
	const leafIndexTopic = "0x" + targetLeafIndex.toString(16).padStart(64, "0")
	const topics = [eventTopic, leafIndexTopic]
	const rawLogs: RawEthLog[] = await ethRpcFetch(ethereumHttpRpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics,
			fromBlock: toHexBlock(fromBlock),
			toBlock: toHexBlock(toBlock),
		},
	])
	if (rawLogs.length > 1)
		throw new Error(`Multiple logs found for leaf index ${targetLeafIndex} in range ${fromBlock}-${toBlock}`)
	if (rawLogs.length === 0) return null
	return parseLeafAppendedLog(rawLogs[0])
}
