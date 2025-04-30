import type { MMRLeafAppendedTrail } from "../../types/types"
import { CID } from "../../utils/CID"
import { encodeBlock } from "../../utils/codec"
import { NULL_CID } from "../../utils/constants"

export class MerkleMountainRange {
	public peaks: CID<unknown, 113, 18, 1>[] = [];
	public leafCount = 0;
	private leafAppendedTrailSubscribers: ((trail: MMRLeafAppendedTrail) => void)[] = []

	constructor() {}

	// Subscribe to be notified whenever addLeafWithTrail is called.
	// @param callback Callback receiving the MMRLeafAppendedTrail for each new leaf
	// @returns Unsubscribe function
	public subscribeToLeafAppendedTrail(callback: (trail: MMRLeafAppendedTrail) => void): () => void {
		this.leafAppendedTrailSubscribers.push(callback);
		return () => {
			const idx = this.leafAppendedTrailSubscribers.indexOf(callback);
			if (idx !== -1) this.leafAppendedTrailSubscribers.splice(idx, 1);
		};
	}
	
	// Adds a new leaf to the MMR and computes all intermediate nodes.
	// @param newData - The raw data for the new leaf node to be added.
	// @param leafIndex - The expected leaf index for the new leaf.
	// @returns An array of CID and data pairs for leaf, all intermediate nodes, and the root
	async addLeafWithTrail(leafIndex: number, newData: Uint8Array): Promise<MMRLeafAppendedTrail> {
		if (this.leafCount !== leafIndex) throw new Error(`Expected leafIndex ${this.leafCount} but got ${leafIndex}`)

		const trail: MMRLeafAppendedTrail = []

		const { cid: leafCID, dagCborEncodedData: dagCborEncodedLeafData } = await encodeBlock(newData)
		trail.push({ cid: leafCID, dagCborEncodedData: dagCborEncodedLeafData })

		let newPeak = leafCID
		let height = 0

		while ((this.leafCount >> height) & 1) {
			const left = this.peaks.pop()
			if (!left) throw new Error("MMR structure error: no peak to merge")

			const { cid: merged, dagCborEncodedData } = await encodeBlock({ L: left, R: newPeak })
			trail.push({ cid: merged, dagCborEncodedData })

			newPeak = merged
			height++
		}

		this.peaks.push(newPeak)
		this.leafCount++

		const peakBaggingInfo = await this.rootCIDWithTrail()
		trail.push(...peakBaggingInfo.trail)

		// Notify all subscribers
		for (const cb of this.leafAppendedTrailSubscribers) {
			try {
				cb(trail);
			} catch (err) {
				console.error("[MMR] Error in leafAppendedTrail subscriber:", err);
			}
		}

		return trail
	}

	// Returns the root CID and the trail of CID/Data pairs needed to compute the root.
	// @returns An object containing the root CID and the trail of CID/Data pairs.
	// The root is redundant (because the last item in the trail is the root) but convenient.
	async rootCIDWithTrail(): Promise<{
		root: CID<unknown, 113, 18, 1> // Redundant (because the last item in the trail is the root) but convenient
		trail: MMRLeafAppendedTrail
	}> {
		const trail: MMRLeafAppendedTrail = []

		if (this.peaks.length === 0) {
			return { root: NULL_CID, trail: [] }
		}

		if (this.peaks.length === 1) {
			return { root: this.peaks[0], trail: [] }
		}

		let current = this.peaks[0]
		for (let i = 1; i < this.peaks.length; i++) {
			const { cid, dagCborEncodedData } = await encodeBlock({ L: current, R: this.peaks[i] })
			trail.push({ cid, dagCborEncodedData })
			current = cid
		}

		return { root: current, trail }
	}

	async rootCID(): Promise<CID<unknown, 113, 18, 1>> {
		const result = await this.rootCIDWithTrail()
		return result.root
	}

	async rootCIDAsBase32(): Promise<string> {
		const cid = await this.rootCID()
		return cid.toString()
	}
}
