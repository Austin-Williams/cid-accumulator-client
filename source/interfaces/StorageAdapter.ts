// We use strings for both keys and values since that is compatible with most storage solutions
export interface StorageAdapter {
	getHighestContiguousLeafIndexWithData(): Promise<number>
	put(key: string, value: string): Promise<void>
	get(key: string): Promise<string | undefined>
	delete(key: string): Promise<void>
	open(): Promise<void>
	close(): Promise<void>

	// Explicitly persist in-memory data to disk (if supported by the adapter)
	persist(): Promise<void>

	// Returns an async iterator over all records whose keys start with the given prefix.
	iterate(keyPrefix: string): AsyncIterable<{ key: string; value: string }>

	// Creates an index of all entries keyed by a substring of their payload.
	// @param offset The starting index of the substring of the payload.
	// @param length The length of the substring of the payload.
	createIndexByPayloadSlice(offset: number, length: number): Promise<Map<string, string[]>>
}
