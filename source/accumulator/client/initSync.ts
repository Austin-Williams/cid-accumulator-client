import { AccumulatorClientConfig, IpfsNamespace } from "../../types/types"
import { StorageAdapter } from "../../interfaces/StorageAdapter"
import { SyncNamespace } from "../../types/types"
import { getSyncNamespace } from "./syncNamespace"
import { getState } from "../../ethereum/commonCalls"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange"

export async function initSync(
	contractAddress: string,
	config: AccumulatorClientConfig,
	storageAdapter: StorageAdapter,
	ipfs: IpfsNamespace,
	mmr: MerkleMountainRange,
	getStateCalldataOverride: string | undefined,
	eventTopicOverride: string | undefined,
): Promise<SyncNamespace> {
	// Check if Ethereum connection is working
	console.log("[Client] \u{1F440} Checking Ethereum connection...")
	let lastProcessedBlock: number = 0
	try {
		const { meta } = await getState({
			ethereumHttpRpcUrl: config.ETHEREUM_HTTP_RPC_URL,
			contractAddress: contractAddress,
			getStateCalldataOverride: config.GET_STATE_CALLDATA_OVERRIDE,
		})
		console.log(`[Client] 🔗 Connected to Ethereum. Target contract address: ${contractAddress}`)
		lastProcessedBlock = meta.deployBlockNumber - 1
	} catch (e) {
		console.error("[Client] \u{274C} Failed to connect to Ethereum node:", e)
		throw new Error("Failed to connect to Ethereum node. See above error.")
	}
	// Initialize a Sync namespace object
	const sync = getSyncNamespace(
		ipfs.ipfsAdapter,
		mmr,
		storageAdapter,
		config.ETHEREUM_HTTP_RPC_URL,
		config.ETHEREUM_WS_RPC_URL,
		contractAddress,
		lastProcessedBlock,
		getStateCalldataOverride,
		config.GET_ROOT_CID_CALLDATA_OVERRIDE,
		eventTopicOverride,
		config.ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL ?? 1000,
	)
	return sync
}
