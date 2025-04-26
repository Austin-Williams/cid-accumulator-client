import type { StorageAdapter } from "../../interfaces/StorageAdapter"
import type { StorageNamespace, LeafRecord } from "../../types/types"
import {
	getLeafRecord,
	putLeafRecordInDB,
	getLeafIndexesWithMissingNewData,
	getCIDDataPairFromDB,
	iterateTrailPairs,
} from "./storageHelpers"

/**
 * Returns a StorageNamespace object with methods bound to the given storage adapter.
 */
export async function getStorageNamespace(storageAdapter: StorageAdapter): Promise<StorageNamespace> {
	const sync = {
		storageAdapter: storageAdapter,
		getLeafRecord: async (index: number) => {
			const result = await getLeafRecord(storageAdapter, index)
			return result === undefined ? null : result
		},
		putLeafRecord: async (index: number, value: LeafRecord) => {
			await putLeafRecordInDB(sync.storageAdapter, index, value)
		},
		getLeafIndexesWithMissingNewData: async () => {
			const maxLeafIndex = await sync.storageAdapter.getHighestContiguousLeafIndexWithData()
			return getLeafIndexesWithMissingNewData(sync.storageAdapter, maxLeafIndex)
		},
		getCIDDataPairFromDB: (index: number) => getCIDDataPairFromDB(sync.storageAdapter, index),
		iterateTrailPairs: () => iterateTrailPairs(sync.storageAdapter),
		get: (key: string) => sync.storageAdapter.get(key),
		put: (key: string, value: string) => sync.storageAdapter.put(key, value),
		delete: (key: string) => sync.storageAdapter.delete(key),
	}
	return sync
}
