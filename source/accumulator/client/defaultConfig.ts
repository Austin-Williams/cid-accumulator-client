import { AccumulatorClientConfig } from "../../types/types";

export const defaultConfig: AccumulatorClientConfig = {
	// The Ethereum HTTP RPC endpoint to use for contract calls and syncing.
	// Should be a full URL to a node that supports the desired network (e.g., mainnet, testnet).
	ETHEREUM_HTTP_RPC_URL: "https://ethereum-rpc.publicnode.com",

	// (Optional) Maximum block range to request per HTTP RPC call when syncing events.
	// Set to undefined to use the default (1000 blocks).
	ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL: undefined,

	// (Optional) Ethereum WebSocket RPC endpoint for real-time event subscriptions.
	// If undefined, will fall back to HTTP RPC polling.
	ETHEREUM_WS_RPC_URL: undefined,

	// The IPFS gateway URL for retrieving content-addressed data (CIDs).
	// Used for fetching data from IPFS when not available locally.
	// You MUST use a *verifiable* IPFS gateway (e.g.,https://dweb.link). See 
	// https://ipfs.github.io/public-gateway-checker/ and look for the ✅ in the "Verifiable" column.
	IPFS_GATEWAY_URL: "https://dweb.link", // http://127.0.0.1:8080 if you have a local IPFS node.

	// The IPFS HTTP API endpoint for pinning, providing, and putting data.
	// Used for writing data to your own IPFS node. Leave undefined if you don't have your own IPFS node.
	IPFS_API_URL: undefined, // "http://127.0.0.1:5001" if you have a local IPFS node.

	// If true, data will be put (added) to your IPFS node via the API whenever possible.
	// Value is ignored if IPFS_API_URL is undefined or if the AccumulatorClient can't reach it.
	IPFS_PUT_IF_POSSIBLE: true,

	// If true, data will be pinned to your IPFS node to prevent garbage collection.
	// Value is ignored if IPFS_API_URL is undefined,or if the AccumulatorClient can't reach it, or
	// if IPFS_PUT_IF_POSSIBLE is false.
	IPFS_PIN_IF_POSSIBLE: true,

	// If true, your IPFS node will "provide" (advertise) data to the IPFS DHT for discoverability.
	// Value is ignored if IPFS_API_URL is undefined, or if the AccumulatorClient can't reach it, or
	// if IPFS_PIN_IF_POSSIBLE is false.
	IPFS_PROVIDE_IF_POSSIBLE: true,

	// (Optional) Path to the local database file for persistent storage (Node.js only).
	// If undefined, will default to './.db/accumulator.json' (relative to the current working directory).
	DB_PATH: undefined,

	// (Advanced, optional) Override calldata for the getRootCID() contract call.
	// Only set if your contract uses a nonstandard method signature.
	GET_ROOT_CID_CALLDATA_OVERRIDE: undefined,

	// (Advanced, optional) Override calldata for the getState() contract call.
	// Only set if your contract uses a nonstandard method signature.
	GET_STATE_CALLDATA_OVERRIDE: undefined,

	// (Advanced, optional) Override the event signature for LeafAppended events.
	// Only set if your contract uses a nonstandard event signature.
	LEAF_APPENDED_EVENT_SIGNATURE_OVERRIDE: undefined,
}