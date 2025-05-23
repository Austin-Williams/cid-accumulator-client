import type {
	AccumulatorClientConfig,
	DataNamespace,
	IpfsNamespace,
	MMRLeafAppendedTrail,
	StorageNamespace,
	SyncNamespace,
} from "../../types/types"
import { defaultConfig } from "./defaultConfig"
import { rebuildMMR } from "./mmrHelpers"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange"
import { stopLiveSync, syncBackwardsFromLatest } from "./syncHelpers"
import { initStorage } from "./initStorage"
import { initIpfs } from "./initIpfs"
import { initSync } from "./initSync"
import { getDataNamespace } from "./dataNamespace"
import { logConfig } from "../../utils/configLogger"

// AccumulatorClient: Unified entry point for accumulator logic in any environment.
// Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
export class AccumulatorClient {
	public contractAddress: string
	public config: AccumulatorClientConfig
	public data?: DataNamespace
	public ipfs?: IpfsNamespace
	public storage?: StorageNamespace
	public sync?: SyncNamespace
	public mmr: MerkleMountainRange

	constructor(contractAddress: string, config?: AccumulatorClientConfig) {
		this.contractAddress = contractAddress
		this.config = config ?? defaultConfig
		this.mmr = new MerkleMountainRange()
		logConfig(this.contractAddress, this.config)
	}

	async init(): Promise<void> {
		// SET UP STORAGE
		this.storage = await initStorage(this.config)
		// Ensure DB is open
		await this.storage.storageAdapter.open()
		// Log how many leaves are in the DB
		const highestLeafIndexInDB = await this.storage.storageAdapter.getHighestContiguousLeafIndexWithData()
		console.log(`[Client] \u{1F4E4} Found ${highestLeafIndexInDB + 1} leafs in DB`)

		// SET UP IPFS
		this.ipfs = await initIpfs(this.config, this.storage!.storageAdapter)
		// If IPFS is set up to pin, subscribe to MMR leaf inserts and pin all relevant CIDs
		if (this.ipfs.shouldPin) {
			this.mmr.subscribeToLeafAppendedTrail(
				(trail: MMRLeafAppendedTrail) => {
					for (const {cid, dagCborEncodedData} of trail) {
						this.ipfs?.putPinProvideToIPFS({cid, dagCborEncodedData})
					}
				}
			)
		}

		// SET UP SYNC
		this.sync = await initSync(
			this.contractAddress,
			this.config,
			this.storage.storageAdapter,
			this.ipfs,
			this.mmr,
			this.config.GET_STATE_CALLDATA_OVERRIDE,
			this.config.LEAF_APPENDED_EVENT_SIGNATURE_OVERRIDE,
		)

		// SET UP DATA (friendly "front-end" to storage)
		this.data = getDataNamespace(
			this.storage.storageAdapter,
			() => this.mmr.leafCount - 1,
			(this.sync!.onNewLeaf).bind(this.sync!)
		)
	}

	async start(): Promise<void> {
		console.log("[Client] 🚀 Starting AccumulatorClient...")
		await this.init()

		if (!this.ipfs || !this.sync || !this.storage) throw new Error("Not all namespaces present. This should never happen.")

		await syncBackwardsFromLatest(
			this.ipfs.ipfsAdapter,
			this.storage.storageAdapter,
			this.sync.ethereumHttpRpcUrl,
			this.sync.contractAddress,
			(block: number) => (this.sync!.lastProcessedBlock = block),
			this.config.GET_STATE_CALLDATA_OVERRIDE,
			this.config.LEAF_APPENDED_EVENT_SIGNATURE_OVERRIDE,
			this.config.ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL ?? 1000,
		)

		rebuildMMR(this.mmr, this.storage.storageAdapter) // Fire-and-forget
		
		this.sync.startLiveSync()
		
		console.log("[Client] 🟢 Client is ready to use.")
	}

	// Gracefully shuts down the AccumulatorClient: stops live sync and closes the DB if possible.
	// Safe to call multiple times.
	public async shutdown(): Promise<void> {
		if (!this.sync || !this.ipfs || !this.storage)
			throw new Error("Not all namespaces present. This should never happen.")
		console.log("[Client] 👋 Shutting down gracefully.")
		// Stop live sync (polling or WS)
		stopLiveSync(
			this.sync!.websocket,
			(newWs: WebSocket | undefined) => (this.sync!.websocket = newWs),
			() => this.sync!.liveSyncInterval,
			(isRunning: boolean) => (this.sync!.liveSyncRunning = isRunning),
			(interval: ReturnType<typeof setTimeout> | undefined) => (this.sync!.liveSyncInterval = interval),
		)
		// Close DB if possible
		await this.storage.storageAdapter.close()
		console.log("[Client] 🏁 Done.")
	}
}
