import { getStorageNamespace } from "./storageNamespace"
import type { AccumulatorClientConfig } from "../../types/types"
import type { StorageNamespace } from "../../types/types"
import type { StorageAdapter } from "../../interfaces/StorageAdapter"
import { isBrowser } from "../../utils/envDetection"
import { IndexedDBAdapter } from "../../adapters/storage/IndexedDBAdapter"

export async function initStorage(config: AccumulatorClientConfig): Promise<StorageNamespace> {
	// Create a Storage adapter appropriate for the environment
	let storageAdapter: StorageAdapter
	if (isBrowser()) {
		storageAdapter = new IndexedDBAdapter()
	} else {
		const module = await import("../../adapters/storage/JSMapAdapter")
		storageAdapter = new module.JSMapAdapter(config.DB_PATH ?? "./.db/accumulator.json")
	}
	// Initialize the Storage namespace
	return await getStorageNamespace(storageAdapter)
}
