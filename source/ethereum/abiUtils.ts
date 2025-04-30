import { keccak_256 } from "@noble/hashes/sha3"
import { AccumulatorMetadata, RawEthLog, NormalizedLeafAppendedtEvent, DagCborEncodedData } from "../types/types"
import { contractPeakHexToMmrCid } from "../utils/codec"
import { CID } from "../utils/CID.js"

export function getSelector(signature: string): string {
	const hash: Uint8Array = keccak_256(signature)
	const selectorHex = Array.from(hash.slice(0, 4))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
	return "0x" + selectorHex
}

export function getEventTopic(signature: string): string {
	const hash: Uint8Array = keccak_256(signature)
	return (
		"0x" +
		Array.from(hash)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	)
}

// Parses the ABI-encoded result of a contract call to getRootCID() -> bytes.
// @param abiResult string (0x-prefixed hex string)
// @returns Uint8Array (decoded bytes)
import { hexStringToUint8Array } from "../utils/codec"

export function parseGetRootCIDResult(abiResult: string): Uint8Array {
	// ABI encoding for bytes: 32 bytes offset, then 32 bytes length, then data
	const buf = hexStringToUint8Array(abiResult)
	if (buf.length < 64) throw new Error("Result too short for ABI-encoded bytes")
	// Read length as big-endian uint32 from offset 60
	const len = (buf[60] << 24) | (buf[61] << 16) | (buf[62] << 8) | buf[63]
	if (buf.length < 64 + len) throw new Error("Result too short for declared length")
	return buf.slice(64, 64 + len)
}

export function parseGetStateResult(hex: string): [bigint, DagCborEncodedData[]] {
	const data = hex.startsWith("0x") ? hex.slice(2) : hex
	if (data.length < 64 + 32 * 64) throw new Error("Result too short for ABI-encoded tuple")
	const mmrMetaBits = BigInt("0x" + data.slice(0, 64))
	const peaks: DagCborEncodedData[] = []
	for (let i = 0; i < 32; i++) {
		const start = 64 + i * 64
		const end = start + 64
		peaks.push(hexStringToUint8Array(data.slice(start, end)) as DagCborEncodedData)
	}
	return [mmrMetaBits, peaks]
}

export function parseAccumulatorMetaBits(mmrMetaBits: bigint): AccumulatorMetadata {
	const bits = mmrMetaBits
	const peakHeights: number[] = []
	for (let i = 0; i < 32; i++) {
		peakHeights.push(Number((bits >> BigInt(i * 5)) & 0x1fn))
	}
	const peakCount = Number((bits >> 160n) & 0x1fn)
	const leafCount = Number((bits >> 165n) & 0xffffffffn)
	const previousInsertBlockNumber = Number((bits >> 197n) & 0xffffffffn)
	const deployBlockNumber = Number((bits >> 229n) & 0x7ffffffn)

	return {
		peakHeights,
		peakCount,
		leafCount,
		previousInsertBlockNumber,
		deployBlockNumber,
	}
}

export async function parseLeafAppendedLog(log: RawEthLog): Promise<NormalizedLeafAppendedtEvent> {
	// Helper to parse a 32-byte hex as uint32 (big-endian)
	function parseUint32FromTopic(topic: string): number {
		return parseInt(topic.slice(-8), 16) // last 4 bytes
	}

	const leafIndex = parseUint32FromTopic(log.topics[1])

	// Data field parsing
	const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data

	// previousInsertBlockNumber: first 32 bytes (offset 0)
	const previousInsertBlockNumber = parseInt(data.slice(56, 64), 16)

	// Offsets for dynamic fields (newData, mergeLeftHashes)
	const newDataOffset = parseInt(data.slice(64, 128), 16) * 2
	const mergeLeftHashesOffset = parseInt(data.slice(128, 192), 16) * 2

	// newData: at newDataOffset, first 32 bytes = length, then bytes
	const newDataLen = parseInt(data.slice(newDataOffset, newDataOffset + 64), 16)
	const newDataHex = data.slice(newDataOffset + 64, newDataOffset + 64 + newDataLen * 2)
	const newData = hexStringToUint8Array(newDataHex)

	// mergeLeftHashes: at mergeLeftHashesOffset, first 32 bytes = length, then array of bytes32
	const mergeLeftHashesLen = parseInt(data.slice(mergeLeftHashesOffset, mergeLeftHashesOffset + 64), 16)
	const mergeLeftHashes: Uint8Array[] = []
	let mergeLeftHashesCursor = mergeLeftHashesOffset + 64
	for (let i = 0; i < mergeLeftHashesLen; i++) {
		const hexStr = data.slice(mergeLeftHashesCursor, mergeLeftHashesCursor + 64)
		mergeLeftHashes.push(hexStringToUint8Array(hexStr))
		mergeLeftHashesCursor += 64
	}
	const mergeLeftHashesAsCIDs: CID<unknown, 113, 18, 1>[] = await Promise.all(
		mergeLeftHashes.map(async (input) => contractPeakHexToMmrCid(input)),
	)

	return {
		leafIndex,
		previousInsertBlockNumber,
		newData,
		mergeLeftHashes: mergeLeftHashesAsCIDs,
		blockNumber: log.blockNumber,
		transactionHash: log.transactionHash,
		removed: log.removed,
	}
}
