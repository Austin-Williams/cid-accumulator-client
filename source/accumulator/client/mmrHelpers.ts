import { StorageAdapter } from "../../interfaces/StorageAdapter"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange"
import { appendTrailToDB, getLeafRecord } from "./storageHelpers"

// Adds a leaf to the MMR, stores the trail in the DB.
export async function commitLeafToMMR(
	storageAdapter: StorageAdapter,
	mmr: MerkleMountainRange,
	leafIndex: number,
	newData: Uint8Array,
): Promise<void> {
	// Add leaf to MMR
	const trail = await mmr.addLeafWithTrail(leafIndex, newData)
	// Store trail in local DB (efficient append-only)
	await appendTrailToDB(storageAdapter, trail)
}

/**
 * Rebuilds the Merkle Mountain Range (MMR) by committing all uncommitted leaves and pinning the full trail to IPFS.
 *
 * This function iterates through all uncommitted leaves and commits them one by one.
 * For each leaf, it adds the leaf to the MMR, stores the trail in the DB, and pins the full trail to IPFS.
 *
 * @returns A Promise that resolves when the MMR has been rebuilt from all uncommitted leaves.
 */
export async function rebuildMMR(
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
): Promise<void> {
	console.log(`[Client] ⛰️ Rebuilding the Merkle Mountain Range from synced leaves. (This can take a while)...`)
	const fromIndex: number = mmr.leafCount
	const toIndex: number = await storageAdapter.getHighestContiguousLeafIndexWithData()
	if (fromIndex > toIndex) throw new Error(`[Client] Expected to commit leaves from ${fromIndex} to ${toIndex}, but found no newData for leaf ${fromIndex}`)
	if (fromIndex === toIndex) return // All leaves already committed
	for (let i = fromIndex; i <= toIndex; i++) {
		const record = await getLeafRecord(storageAdapter, i)
		if (!record || !record.newData) throw new Error(`[Client] Expected newData for leaf ${i}`)
		if (!(record.newData instanceof Uint8Array)) throw new Error(`[Client] newData for leaf ${i} is not a Uint8Array`)
		await commitLeafToMMR(storageAdapter, mmr, i, record.newData)
	}
	console.log(`[Client] 🎉 Fully rebuilt the Merkle Mountain Range up to leaf index ${toIndex}`)
	await storageAdapter.persist()
}
