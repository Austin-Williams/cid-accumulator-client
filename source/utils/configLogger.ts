import type { AccumulatorClientConfig } from "../types/types"

export function logConfig(contractAddress: string, config: AccumulatorClientConfig) {
	console.log(`[Client] ⚙ Config: CONTRACT_ADDRESS: ${contractAddress}`)
	console.log(`[Client] ⚙ Config: ETHEREUM_HTTP_RPC_URL: ${config.ETHEREUM_HTTP_RPC_URL}`)
	console.log(`[Client] ⚙ Config: ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL: ${config.ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL ?? "undefined"}`)
	console.log(`[Client] ⚙ Config: ETHEREUM_WS_RPC_URL: ${config.ETHEREUM_WS_RPC_URL ?? "undefined"}`)
	console.log(`[Client] ⚙ Config: IPFS_GATEWAY_URL: ${config.IPFS_GATEWAY_URL}`)
	console.log(`[Client] ⚙ Config: IPFS_API_URL: ${config.IPFS_API_URL ?? "undefined"}`)
	console.log(`[Client] ⚙ Config: IPFS_PUT_IF_POSSIBLE: ${config.IPFS_PUT_IF_POSSIBLE}`)
	console.log(`[Client] ⚙ Config: IPFS_PIN_IF_POSSIBLE: ${config.IPFS_PIN_IF_POSSIBLE}`)
	console.log(`[Client] ⚙ Config: IPFS_PROVIDE_IF_POSSIBLE: ${config.IPFS_PROVIDE_IF_POSSIBLE}`)
	console.log(`[Client] ⚙ Config: DB_PATH: ${config.DB_PATH ?? "undefined"}`)
	console.log(`[Client] ⚙ Config: GET_ROOT_CID_CALLDATA_OVERRIDE: ${config.GET_ROOT_CID_CALLDATA_OVERRIDE ?? "undefined"}`)
	console.log(`[Client] ⚙ Config: GET_STATE_CALLDATA_OVERRIDE: ${config.GET_STATE_CALLDATA_OVERRIDE ?? "undefined"}`)
	console.log(`[Client] ⚙ Config: LEAF_APPENDED_EVENT_SIGNATURE_OVERRIDE: ${config.LEAF_APPENDED_EVENT_SIGNATURE_OVERRIDE ?? "undefined"}`)
}
