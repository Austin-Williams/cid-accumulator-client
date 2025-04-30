import type { StorageAdapter } from "../../interfaces/StorageAdapter"

// JSMapAdapter implements StorageAdapter using a native Map,
// with persistence to a local file (JSON-serialized).
// No external dependencies required. Suitable for moderate datasets (~100k entries).
export class JSMapAdapter implements StorageAdapter {
	// Returns the highest contiguous leafIndex N such that all keys 'leaf:0:newData' ... 'leaf:N:newData' exist and are not undefined/null.
	// This is efficient for the in-memory Map, and does not require iterating over all possible indexes if there are gaps at the end.
	async getHighestContiguousLeafIndexWithData(): Promise<number> {
		// Collect all keys that match 'leaf:{number}:newData'
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
		// Find the highest N such that 0..N are all present
		let N = -1
		for (let i = 0; i < indexes.length; i++) {
			if (indexes[i] !== i) break
			N = i
		}
		return N
	}

	private store: Map<string, string> = new Map()
	private filePath: string

	constructor(filePath: string | undefined) {
		this.filePath = filePath ?? "./db/cli-accumulator.json"
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value)
	}

	async get(key: string): Promise<string | undefined> {
		return this.store.get(key)
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key)
	}

	async *iterate(prefix: string): AsyncIterable<{ key: string; value: string }> {
		for (const [key, value] of this.store.entries()) {
			if (key.startsWith(prefix)) {
				yield { key, value }
			}
		}
	}

	async open(): Promise<void> {
		const { promises: fs } = await import("fs")
		// Load from disk if file exists
		try {
			const data = await fs.readFile(this.filePath, "utf8")
			const obj = JSON.parse(data)
			this.store = new Map(Object.entries(obj))
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err // Ignore file-not-found
		}
	}

	async persist(): Promise<void> {
		const { promises: fs } = await import("fs")
		const obj: Record<string, string> = Object.fromEntries(this.store)
		// Ensure the directory exists before writing the file
		const { dirname } = await import("path")
		await fs.mkdir(dirname(this.filePath), { recursive: true })
		await fs.writeFile(this.filePath, JSON.stringify(obj), "utf8")
	}

	async close(): Promise<void> {
		// Persist to disk as JSON (for compatibility)
		await this.persist()
	}

	// Creates an index of all entries keyed by a substring of their payload.
	// @param offset The starting index of the substring.
	// @param length The length of the substring.
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
