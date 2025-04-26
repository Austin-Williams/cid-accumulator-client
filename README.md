# cid-accumulator-client
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
[Client] 📦 Checking blocks 8199765 to 8200764 for LeafInsert events...
[Client] 🍃 Found 7 LeafInsert events
[Client] 📦 Checking blocks 8198765 to 8199764 for LeafInsert events...
[Client] 🍃 Found 5 LeafInsert events
[Client] 📦 Checking blocks 8197765 to 8198764 for LeafInsert events...
...
[Client] 📥 Downloaded all data for root CID bafyreid...n5kpy74e from IPFS.
[Client] 🙌 Successfully resolved all remaining data from IPFS!
[Client] 🌲 Your accumulator client has acquired all data!
[Client] ⛰️ Rebuilding the Merkle Mountain Range from synced leaves and pinning to IPFS. (This can take a while)...
[Client] 🎉 Fully rebuilt the Merkle Mountain Range up to leaf index 217
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

### Stopping Live Sync and Shutting down

```typescript
// To stop listening for new data
client.sync.stopLiveSync()
```

To shut down the client gracefully (unsubscribe from websockets, close DB connection, etc.)

```typescript
await client.shutdown()
```
