// IndexedDBAdapter: Persistent browser storage
// Implements the StorageAdapter interface for use in browser environments

import type { StorageAdapter } from "../../interfaces/StorageAdapter.js"

export class IndexedDBAdapter implements StorageAdapter {
	async getHighestContiguousLeafIndexWithData(): Promise<number> {
		const indexes: number[] = []
		for await (const { key, value } of this.iterate("leaf:")) {
			const match = typeof key === "string" && key.match(/^leaf:(\d+):newData$/)
			if (match) {
				const idx = parseInt(match[1], 10)
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

	private _instanceId: number
	private static _nextId = 1
	private dbName: string
	private storeName: string
	private dbPromise: Promise<IDBDatabase>

	constructor(dbName = "cid-accumulator", storeName = "kv") {
		this._instanceId = IndexedDBAdapter._nextId++
		this.dbName = dbName
		this.storeName = storeName
		this.dbPromise = this.openDB()
	}

	private openDB(): Promise<IDBDatabase> {
		if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available in this environment.")
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(this.dbName, 1)
			req.onupgradeneeded = () => {
				req.result.createObjectStore(this.storeName)
			}
			req.onsuccess = () => {
				resolve(req.result)
			}
			req.onerror = () => {
				console.error(`[IndexedDBAdapter] onerror (instanceId=${this._instanceId})`, req.error)
				reject(req.error)
			}
		})
	}

	private async withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
		const db = await this.dbPromise
		return new Promise<T>((resolve, reject) => {
			const tx = db.transaction(this.storeName, mode)
			const store = tx.objectStore(this.storeName)
			const req = fn(store)
			req.onsuccess = () => resolve(req.result as T)
			req.onerror = () => reject(req.error)
		})
	}

	async get(key: string): Promise<string | undefined> {
		return await this.withStore("readonly", (store) => store.get(key))
	}

	async put(key: string, value: string): Promise<void> {
		await this.withStore("readwrite", (store) => store.put(value, key))
	}

	async delete(key: string): Promise<void> {
		await this.withStore("readwrite", (store) => store.delete(key))
	}

	async *iterate(prefix: string): AsyncIterable<{ key: string; value: string }> {
		const db = await this.dbPromise
		if (!db) throw new Error("IndexedDB database not initialized.")
		const tx = db.transaction(this.storeName, "readonly")
		const store = tx.objectStore(this.storeName)
		const req = store.openCursor()
		// Wrap cursor iteration in a promise to collect results, then yield
		const results: { key: string; value: string }[] = await new Promise((resolve, reject) => {
			const out: { key: string; value: string }[] = []
			req.onsuccess = () => {
				const cursor = req.result as IDBCursorWithValue | null
				if (cursor) {
					if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
						out.push({ key: cursor.key, value: cursor.value })
					}
					cursor.continue()
				} else {
					resolve(out)
				}
			}
			req.onerror = () => reject(req.error)
		})
		for (const item of results) {
			yield item
		}
	}

	async open(): Promise<void> {
		await this.dbPromise
	}

	async persist(): Promise<void> {
		// No-op for IndexedDB, auto-persistent
	}

	async close(): Promise<void> {
		// IndexedDB does not require explicit close
	}

	/**
	 * Creates an index of all entries keyed by a substring of their payload.
	 * @param offset The starting index of the substring.
	 * @param length The length of the substring.
	 */
	async createIndexByPayloadSlice(offset: number, length: number): Promise<Map<string, string[]>> {
		const index = new Map<string, string[]>()
		for await (const { value } of this.iterate("leaf:")) {
			const slice = value.slice(offset, offset + length)
			if (!index.has(slice)) index.set(slice, [])
			index.get(slice)!.push(value)
		}
		return index
	}
}
