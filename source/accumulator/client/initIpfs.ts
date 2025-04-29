import { UniversalIpfsAdapter } from "../../adapters/ipfs/UniversalIpfsAdapter"
import { IpfsAdapter } from "../../interfaces/IpfsAdapter"
import { IpfsNamespace, AccumulatorClientConfig } from "../../types/types"
import { isNodeJs } from "../../utils/envDetection"
import { getIpfsNamespace } from "./ipfsNamespace"
import { StorageAdapter } from "../../interfaces/StorageAdapter"
import { NULL_CID } from "../../utils/constants"
import * as dagCbor from "../../utils/dagCbor"

export async function initIpfs(
	config: AccumulatorClientConfig,
	storageAdapter: StorageAdapter,
): Promise<IpfsNamespace> {
	// Create an IPFS adapter
	const ipfsAdapter: IpfsAdapter = new UniversalIpfsAdapter(
		config.IPFS_GATEWAY_URL,
		config.IPFS_API_URL,
		config.IPFS_PUT_IF_POSSIBLE,
		config.IPFS_PIN_IF_POSSIBLE,
		config.IPFS_PROVIDE_IF_POSSIBLE,
		config.REMOTE_PIN_BASE_URL
			? { baseUrl: config.REMOTE_PIN_BASE_URL, headers: config.REMOTE_PIN_HEADERS ?? {} }
			: undefined,
		config.REMOTE_PIN_FAILURE_THRESHOLD,
	)

	let shouldPut = config.IPFS_PUT_IF_POSSIBLE && config.IPFS_API_URL !== undefined
	let shouldPin = config.IPFS_PIN_IF_POSSIBLE && config.IPFS_API_URL !== undefined
	let shouldProvide = config.IPFS_PROVIDE_IF_POSSIBLE && config.IPFS_API_URL !== undefined && isNodeJs()
	if (!shouldPut) shouldPin = false // Doesn't make sense to pin if they don't put
	if (!shouldPin) shouldProvide = false // Doesn't make sense to provide if they don't pin
	let shouldRemotePin = config.REMOTE_PIN_BASE_URL !== undefined

	// Check if IPFS Gateway connection is working
	console.log("[Client] \u{1F440} Checking IPFS Gateway connection...")
	try {
		// Attempt to fetch a block
		await ipfsAdapter.getBlock(NULL_CID)
		console.log("[Client] 🔗 Connected to IPFS Gateway.")
	} catch (e) {
		console.error("[Client] \u{274C} Failed to connect to IPFS Gateway:", e)
		throw new Error("Failed to connect to IPFS Gateway. Must abort. See above error.")
	}

	// If relevant, check that IPFS API connection can PUT/PIN
	if (shouldPut) {
		console.log("[Client] \u{1F440} Checking IPFS API connection (attempting to PUT a block)...")
		try {
			// Attempt to put a block
			await ipfsAdapter.putBlock(NULL_CID, dagCbor.encode(null))
			console.log("[Client] 🔗 Connected to IPFS API and verified it can PUT blocks.")
		} catch (e) {
			shouldPut = false
			shouldPin = false
			console.error("[Client] \u{274C} Failed to connect to IPFS API:", e)
			console.log("[Client] 🤷‍♂️ Will continue without IPFS API connection (Using IPFS Gateway only).")
		}
	}

	// If relevant, check that IPFS API connection can PUT/PIN
	if (shouldProvide && shouldPut) {
		console.log("[Client] \u{1F440} Checking if IPFS API can provide (advertise) blocks...")
		try {
			// Attempt to provide a block
			await ipfsAdapter.provide(NULL_CID)
			console.log("[Client] 🔗 Connected to IPFS API and verified it can PROVIDE blocks.")
		} catch (e) {
			shouldProvide = false
			console.error("[Client] \u{274C} Failed to verify that the IPFS API can provide (advertise) blocks.", e)
			console.log("[Client] 🤷‍♂️ Will continue without telling IPFS API to provide (advertise) blocks.")
		}
	}

	// Initialize the IPFS namespace object
	const ipfs = getIpfsNamespace(ipfsAdapter, storageAdapter, shouldPut, shouldPin, shouldProvide, shouldRemotePin)

	console.log("[Client] 📜 IPFS Capability Summary:")
	console.log(`[Client] 📜 Summary: IPFS Gateway connected: YES`)
	console.log(`[Client] 📜 Summary: IPFS API PUT is set up: ${shouldPut ? "YES" : "NO"}`)
	console.log(`[Client] 📜 Summary: IPFS API PIN is set up: ${shouldPin ? "YES" : "NO"}`)
	console.log(`[Client] 📜 Summary: IPFS API PROVIDE is set up: ${shouldProvide ? "YES" : "NO"}`)
	console.log(`[Client] 📜 Summary: IPFS API REMOTE PIN is set up: ${shouldRemotePin ? "YES" : "NO"}`)

	return ipfs
}
