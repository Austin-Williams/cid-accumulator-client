import { CID } from "../../utils/CID"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter"
import { isBrowser } from "../../utils/envDetection"
import { verifyCIDAgainstDagCborEncodedData, verifyCIDAgainstDagCborEncodedDataOrThrow } from "../../utils/verifyCID"
import { DagCborEncodedData } from "../../types/types"
import { RateLimiter } from "../../utils/rateLimiter"

/**
 * UniversalIpfsAdapter implements IpfsAdapter using raw fetch calls to the IPFS HTTP API (Kubo-compatible).
 * No external dependencies required except fetch (native in Node >=18).
 */
export class UniversalIpfsAdapter implements IpfsAdapter {
	private gatewayUrl: string
	private apiUrl: string | undefined
	private shouldPut: boolean
	private shouldPin: boolean
	private shouldProvide: boolean
	private remotePinConfig?: { baseUrl: string; headers: Record<string, string> }
	private remotePinFailures = 0
	private remotePinFailureThreshold = 5
	private remotePinRateLimiter?: RateLimiter

	constructor(
		gatewayUrl: string,
		apiUrl: string | undefined,
		wantsToPut: boolean,
		wantsToPin: boolean,
		wantsToProvide: boolean,
		remotePinConfig: { baseUrl: string; headers: Record<string, string> } | undefined,
		remotePinFailureThreshold: number | undefined,
	) {
		// Remove trailing '/ipfs' or '/ipfs/' and any trailing slash from the gateway URL
		this.gatewayUrl = gatewayUrl.replace(/\/?ipfs\/?$/, "").replace(/\/$/, "")
		this.apiUrl = apiUrl?.replace(/\/$/, "") // Remove trailing slash
		this.shouldPut = wantsToPut && apiUrl !== undefined
		this.shouldPin = wantsToPin && apiUrl !== undefined
		this.shouldProvide = wantsToProvide && apiUrl !== undefined && !isBrowser()
		this.remotePinConfig = remotePinConfig
		if (remotePinConfig) this.remotePinRateLimiter = new RateLimiter(200)
		if (remotePinFailureThreshold !== undefined) this.remotePinFailureThreshold = remotePinFailureThreshold
	}

	/**
	 * Get a block by CID from IPFS.
	 */
	async getBlock(cid: CID<unknown, 113, 18, 1>): Promise<DagCborEncodedData> {
		const url = `${this.gatewayUrl}/ipfs/${cid.toString()}`
		const res = await fetch(url, { method: "GET" })
		if (!res.ok) throw new Error(`IPFS block/get failed: ${res.status} ${res.statusText}`)
		const data: DagCborEncodedData = new Uint8Array(await res.arrayBuffer()) as DagCborEncodedData

		// Verify that we actually got what we asked for
		await verifyCIDAgainstDagCborEncodedDataOrThrow(
			data,
			cid,
			`[UniversalIpfsAdapter.getBlock] 🚨 IPFS Gateway returned invalid data!`,
		)

		return data
	}

	/**
	 * Put a block (dag-cbor, sha2-256, CIDv1) to IPFS. Pinning is optional, controlled by config.
	 * Note: The CID is not used directly; IPFS computes it from the data.
	 */
	async putBlock(cid: CID<unknown, 113, 18, 1>, dagCborEncodedData: DagCborEncodedData): Promise<void> {
		if (!verifyCIDAgainstDagCborEncodedData(dagCborEncodedData, cid)) {
			console.warn(
				`[UniversalIpfsAdapter.putBlock] ‼️ CID/Data pair is invalid. dagCborEncodedData: ${dagCborEncodedData}, expectedCID: ${cid.toString()}`,
			)
		}
		if (!this.shouldPut) return

		const url = `${this.apiUrl}/api/v0/block/put?format=dag-cbor&mhtype=sha2-256&pin=${this.shouldPin}`
		const form = new FormData()
		form.append("data", new Blob([dagCborEncodedData]))
		const res = await fetch(url, {
			method: "POST",
			body: form,
			// fetch sets Content-Type for multipart automatically
		})
		if (!res.ok) throw new Error(`IPFS block/put failed: ${res.status} ${res.statusText}`)

		// Verify returned CID
		const response = await res.json()
		const returnedCid = CID.parse(response.Key)
		if (returnedCid.toString() !== cid.toString()) {
			console.warn(
				`[UniversalIpfsAdapter.putBlock] ‼️ CID returned by the IPFS API was ${returnedCid.toString()} but you expected ${cid.toString()}`,
			)
		}

		// Remote pin via Pinning Service API if configured
		if (this.remotePinConfig && this.remotePinRateLimiter) {
			const { baseUrl, headers } = this.remotePinConfig
			const limiter = this.remotePinRateLimiter
			try {
				await limiter.execute(() => fetch(`${baseUrl}/pins`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...headers,
					},
					body: JSON.stringify({ cid: cid.toString() }),
				}))
				console.debug(`[UniversalIpfsAdapter] 🟢🟢🟢🟢🟢 Remote pin succeeded for CID ${cid.toString()}`)
			} catch (err) {
				this.remotePinFailures++
				console.error(`[UniversalIpfsAdapter] 🔴🔴🔴🔴🔴 Remote pin failed (#${this.remotePinFailures}):`, err)
				if (this.remotePinFailures >= this.remotePinFailureThreshold) {
					console.log(`[UniversalIpfsAdapter] 🔴🔴🔴🔴🔴 Disabling remote pinning after ${this.remotePinFailures} failures`)
					this.remotePinConfig = undefined
				}
			}
		}
	}

	/**
	 * Provide a CID to the DHT (optional, fire-and-forget).
	 */
	async provide(cid: CID<unknown, 113, 18, 1>): Promise<void> {
		if (!this.shouldProvide) return
		const url = `${this.apiUrl}/api/v0/dht/provide?arg=${cid.toString()}`
		// Fire and forget; don't block on the result
		fetch(url).catch(() => {})
	}
}
