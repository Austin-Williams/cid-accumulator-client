# cid-accumulator-client

> **⚠️ DEPRECATED ⚠️**: Please see [https://github.com/Austin-Williams/cid-accumulator-monorepo](https://github.com/Austin-Williams/cid-accumulator-monorepo) for the latest version.

Universal JS/TS client for interacting with smart contracts that implement the CIDAccumulator pattern.

## Installation

```bash
npm install cid-accumulator-client
```

## Usage

### Configure and start the client:

```typescript
import type { AccumulatorClientConfig } from "cid-accumulator-client"
import { AccumulatorClient } from "cid-accumulator-client"

// Set your configuration options
const config: AccumulatorClientConfig = {...YourConfigOptions...}

// Instantiate the client
const client = new AccumulatorClient("0xYourContractAddress", config)

// Start the client
await client.start()
```

### Wait for client to sync

You'll see verbose logs in the console showing syncing progress.

```bash
[Client] 🚀 Starting AccumulatorClient...
[Client] 📤 Found 0 leafs in DB
[Client] 👀 Checking IPFS Gateway connection...
[Client] 🔗 Connected to IPFS Gateway.
[Client] 👀 Checking IPFS API connection (attempting to PUT a block)...
[Client] 🔗 Connected to IPFS API and verified it can PUT blocks.
[Client] 👀 Checking if IPFS API can provide (advertise) blocks...
[Client] 🔗 Connected to IPFS API and verified it can PROVIDE blocks.
[Client] 📜 IPFS Capability Summary:
[Client] 📜 Summary: IPFS Gateway connected: YES
[Client] 📜 Summary: IPFS API PUT is set up: YES
[Client] 📜 Summary: IPFS API PIN is set up: YES
[Client] 📜 Summary: IPFS API PROVIDE is set up: YES
[Client] 👀 Checking Ethereum connection...
[Client] 🔗 Connected to Ethereum. Target contract address: <0xYOUR_CONTRACT_ADDRESS>
[Client] 🔁 Syncing backwards from block 8200764 to block 8147142 (53622 blocks), grabbing 1000 blocks per RPC call.
[Client] 🔎 Simultaneously checking IPFS for older root CIDs as we discover them.
[Client] 📦 Checking blocks 8199765 to 8200764 for LeafAppended events...
[Client] 🍃 Found 7 LeafAppended events
[Client] 📦 Checking blocks 8198765 to 8199764 for LeafAppended events...
[Client] 🍃 Found 5 LeafAppended events
[Client] 📦 Checking blocks 8197765 to 8198764 for LeafAppended events...
...
[Client] 📥 Downloaded all data for root CID bafyreid...n5kpy74e from IPFS.
[Client] 🙌 Successfully resolved all remaining data from IPFS!
[Client] 🌲 Your accumulator client has acquired all data!
[Client] ⛰️ Rebuilding the Merkle Mountain Range from synced leaves and pinning to IPFS. (This can take a while)...
[Client] 🎉 Finished rebuilding the Merkle Mountain Range.
[Client] 👎 No ETHEREUM_WS_RPC_URL provided, will use polling.
[Client] 👀 Using HTTP polling to monitor the chain for new data insertions.
[Client] 🟢 Client is ready to use.
```

When you see `[Client] 🟢 Client is ready to use.` you're ready to access data.

### Accessing data

```typescript
// See how many items have been inserted into the accumulator
const count = await client.data.getHighestIndex()

// Access the ith data that was inserted into the accumulator
const data = await client.data.getData(i)

// Get a range of data by insertion index
const range = await client.data.getRange(start, end) // Returns array of { index: number; data: string }

// Subscribe to new data as it is inserted
const unsubscribe = client.data.subscribe((index, data) => {
	console.log(`New data inserted at index ${index}: ${data}`)
})
// Call unsubscribe() when you're done

// Iterate over all data
for await (const { key, value } of client.data.iterate()) {
	console.log(`Key: ${key}, Value: ${value}`)
}

// Index by data payload slice
const index = await client.data.createIndexByPayloadSlice(offset, length)
const matches = await index.get("someSlice") // Returns array of data (strings) that match the slice

// Download all data to a JSON file (saves to `accumulator-data-${Date.now()}.json` in Nodejs; triggers download prompt in browser)
const filePath = await client.data.downloadAll()

```

### Stopping Live Sync

```typescript
// To stop listening for new data
client.sync.stopLiveSync()
```

### Shutting down

```typescript
// To shut down the client gracefully (unsubscribe from websockets, close DB connection, etc.)
await client.shutdown()
```

### Config Options

```typescript
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
	// Value is ignored if IPFS_API_URL is undefined, or if the AccumulatorClient can't reach it, or
	// if IPFS_PUT_IF_POSSIBLE is false.
	IPFS_PIN_IF_POSSIBLE: true,

	// If true, your IPFS node will "provide" (advertise) data to the IPFS DHT for discoverability.
	// Value is ignored if IPFS_API_URL is undefined, or if the AccumulatorClient can't reach it, or
	// if IPFS_PIN_IF_POSSIBLE is false.
	IPFS_PROVIDE_IF_POSSIBLE: true,

	// (Optional) Path to the local database file for persistent storage (Node.js only).
	// If undefined, will default to '.db/accumulator.json' (relative to the current working directory).
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
