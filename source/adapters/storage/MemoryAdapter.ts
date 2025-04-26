import type { StorageAdapter } from "../../interfaces/StorageAdapter"

/**
 * MemoryAdapter implements StorageAdapter for tests/in-memory use.
 */
export class MemoryAdapter implements StorageAdapter {
	private store: Map<string, any> = new Map()

	async getHighestContiguousLeafIndexWithData(): Promise<number> {
		const indexes: number[] = []
		for (const key of this.store.keys()) {
			const match = key.match(/^leaf:(\d+):newData$/)
			if (match) {
				const idx = parseInt(match[1], 10)
				const value = this.store.get(key)
				if (value !== undefined && value !== null) {
					indexes.push(idx)
				}
			}
		}
		if (indexes.length === 0) return -1
		indexes.sort((a, b) => a - b)
		let N = -1
		for (let i = 0; i < indexes.length; i++) {
			if (indexes[i] !== i) break
			N = i
		}
		return N
	}

	async get(key: string): Promise<string | undefined> {
		return this.store.get(key)
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value)
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key)
	}

	async open(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	async close(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	async persist(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	async *iterate(keyPrefix: string): AsyncIterable<{ key: string; value: string }> {
		for (const [key, value] of this.store.entries()) {
			if (key.startsWith(keyPrefix)) {
				yield { key, value }
			}
		}
	}

	async createIndexByPayloadSlice(offset: number, length: number): Promise<Map<string, string[]>> {
		const index = new Map<string, string[]>()
		for (const [key, value] of this.store.entries()) {
			if (!key.startsWith("leaf:")) continue
			const slice = value.slice(offset, offset + length)
			if (!index.has(slice)) index.set(slice, [])
			index.get(slice)!.push(value)
		}
		return index
	}
}
