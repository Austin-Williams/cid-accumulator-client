import { CID } from "../../utils/CID"
import type { LeafRecord, CIDDataPair, MMRLeafAppendedTrail } from "../../types/types"
import { StorageAdapter } from "../../interfaces/StorageAdapter"
import { verifyCIDAgainstDagCborEncodedDataOrThrow } from "../../utils/verifyCID"
import {
	cidDataPairToStringForDB,
	stringFromDBToCIDDataPair,
	uint8ArrayToHexString,
	hexStringToUint8Array,
	normalizedLeafAppendedtEventToString,
	stringToNormalizedLeafAppendedtEvent,
	stringToPeakWithHeightArray,
	peakWithHeightArrayToStringForDB,
} from "../../utils/codec"

// ====================================================
// DATABASE OPERATIONS & DATA MANAGEMENT
// Functions for storing, retrieving, and managing
// accumulator data in the configured storage backend.
// ====================================================

// Store a leaf record in the DB by leafIndex, splitting fields into separate keys.
export async function putLeafRecordInDB(
	storageAdapter: StorageAdapter,
	leafIndex: number,
	value: LeafRecord,
): Promise<void> {
	// Store newData
	await storageAdapter.put(`leaf:${leafIndex}:newData`, uint8ArrayToHexString(value.newData))
	// Store optional fields as strings
	if (value.event !== undefined)
		await storageAdapter.put(`leaf:${leafIndex}:event`, normalizedLeafAppendedtEventToString(value.event))
	if (value.blockNumber !== undefined)
		await storageAdapter.put(`leaf:${leafIndex}:blockNumber`, value.blockNumber.toString())
	if (value.rootCid !== undefined) await storageAdapter.put(`leaf:${leafIndex}:rootCid`, value.rootCid.toString())
	if (value.peaksWithHeights !== undefined)
		await storageAdapter.put(
			`leaf:${leafIndex}:peaksWithHeights`,
			peakWithHeightArrayToStringForDB(value.peaksWithHeights),
		)
}

// Retrieve a leaf record by leafIndex, reconstructing from individual fields. Throws if types are not correct. */
export async function getLeafRecord(
	storageAdapter: StorageAdapter,
	leafIndex: number,
): Promise<LeafRecord | undefined> {
	const newDataStr = await storageAdapter.get(`leaf:${leafIndex}:newData`)
	if (newDataStr === undefined || newDataStr === null) return undefined
	const newData = hexStringToUint8Array(newDataStr)
	const eventStr = await storageAdapter.get(`leaf:${leafIndex}:event`)
	const event = eventStr !== undefined ? stringToNormalizedLeafAppendedtEvent(eventStr) : undefined
	const blockNumberStr = await storageAdapter.get(`leaf:${leafIndex}:blockNumber`)
	const blockNumber = blockNumberStr !== undefined ? parseInt(blockNumberStr, 10) : undefined
	const rootCidStr = await storageAdapter.get(`leaf:${leafIndex}:rootCid`)
	const rootCid = rootCidStr !== undefined ? CID.parse(rootCidStr) : undefined
	const peaksWithHeightsStr = await storageAdapter.get(`leaf:${leafIndex}:peaksWithHeights`)
	const peaksWithHeights =
		peaksWithHeightsStr !== undefined ? await stringToPeakWithHeightArray(peaksWithHeightsStr) : undefined

	return {
		newData,
		event,
		blockNumber,
		rootCid,
		peaksWithHeights,
	}
}

// Searches from leafIndex 0 to maxLeafIndex for leaves that are missing newData.
// Returns an array of leaf indexes that are missing newData.
// Used for sanity checking.
export async function getLeafIndexesWithMissingNewData(
	storageAdapter: StorageAdapter,
	maxLeafIndex: number,
): Promise<number[]> {
	const missing: number[] = []
	for (let i = 0; i <= maxLeafIndex; i++) {
		const rec = await getLeafRecord(storageAdapter, i)
		// Only count as missing if rec is undefined or newData is not a Uint8Array
		if (!rec || !(rec.newData instanceof Uint8Array)) missing.push(i)
	}
	return missing
}

// Appends all trail pairs to the DB in an efficient, sequential manner.
// Each pair is stored as dag:trail:<index>. The max index is tracked by dag:trail:maxIndex.
// Does not store a CID/Data pair if it is already in the DB
export async function appendTrailToDB(storageAdapter: StorageAdapter, trail: MMRLeafAppendedTrail): Promise<void> {
	let maxIndex = Number((await storageAdapter.get("dag:trail:maxIndex")) ?? -1)
	
	for (const pair of trail) {
		try {
			await verifyCIDAgainstDagCborEncodedDataOrThrow(pair.dagCborEncodedData, pair.cid)
		} catch (err) {
			console.warn('[appendTrailToDB] 💥 CID verification failed:', err, pair);
			continue;
		}
		const cidStr = pair.cid.toString()
		const seenKey = `cid:${cidStr}`
		const alreadyStored = await storageAdapter.get(seenKey)
		if (alreadyStored) continue

		maxIndex++
		await storageAdapter.put(`dag:trail:index:${maxIndex}`, cidDataPairToStringForDB(pair))
		await storageAdapter.put(seenKey, "1")
	}
	await storageAdapter.put("dag:trail:maxIndex", maxIndex.toString())
}

export async function getCIDDataPairFromDB(storageAdapter: StorageAdapter, index: number): Promise<CIDDataPair | null> {
	const value = await storageAdapter.get(`dag:trail:index:${index}`)
	if (value && typeof value === "string") {
		const cidDataPair: CIDDataPair = await stringFromDBToCIDDataPair(value)
		// sanity check
		await verifyCIDAgainstDagCborEncodedDataOrThrow(cidDataPair.dagCborEncodedData, cidDataPair.cid)
		return cidDataPair
	}
	return null
}

// Async generator to efficiently iterate over all stored trail pairs.
export async function* iterateTrailPairs(storageAdapter: StorageAdapter): AsyncGenerator<CIDDataPair> {
	for await (const { value } of storageAdapter.iterate("dag:trail:index:")) {
		if (value && typeof value === "string") yield stringFromDBToCIDDataPair(value)
	}
}

