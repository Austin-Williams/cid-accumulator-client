import { StorageAdapter } from "../../interfaces/StorageAdapter"
import { isNodeJs } from "../../utils/envDetection"

export async function downloadAll(storageAdapter: StorageAdapter, prefix: string): Promise<string> {
	// Gather all leaf data
	const allData: Array<{ index: number; data: string }> = []
	for await (const { key, value } of storageAdapter.iterate(prefix)) {
		const match = key.match(/^leaf:(\d+):newData$/)
		if (match) {
			allData.push({ index: Number(match[1]), data: value })
		}
	}
	const json = JSON.stringify(allData, null, 2)

	if (isNodeJs()) {
		// Node.js: write to disk
		const fs = await import("fs/promises")
		const filePath = `leaves-${Date.now()}.json`
		await fs.writeFile(filePath, json, "utf8")
		console.log(`[Accumulator] Leaves written to ${filePath}`)
		return filePath
	} else {
		// Browser: trigger download
		const blob = new Blob([json], { type: "application/json" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = `leaves-${Date.now()}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
		return a.download
	}
}
