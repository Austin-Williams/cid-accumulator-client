import { CID } from "../utils/CID.js"

export const MINIMAL_ACCUMULATOR_ABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint32",
				"name": "leafIndex",
				"type": "uint32"
			},
			{
				"indexed": false,
				"internalType": "uint32",
				"name": "previousInsertBlockNumber",
				"type": "uint32"
			},
			{
				"indexed": false,
				"internalType": "bytes",
				"name": "newData",
				"type": "bytes"
			},
			{
				"indexed": false,
				"internalType": "bytes32[]",
				"name": "mergeLeftHashes",
				"type": "bytes32[]"
			}
		],
		"name": "LeafAppended",
		"type": "event"
	},{
		"inputs": [],
		"name": "getRootCID",
		"outputs": [
			{
				"internalType": "bytes",
				"name": "rawCIDv1",
				"type": "bytes"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getState",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			},
			{
				"internalType": "bytes32[32]",
				"name": "",
				"type": "bytes32[32]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
] as const

// Canonical dag-cbor/sha2-256/CIDv1 null node CID
export const NULL_CID: CID<unknown, 113, 18, 1> = CID.parse(
	"bafyreifqwkmiw256ojf2zws6tzjeonw6bpd5vza4i22ccpcq4hjv2ts7cm",
)
