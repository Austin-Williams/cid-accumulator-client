import { keccak_256 } from "@noble/hashes/sha3"

// Compute the selector
function getSelector(signature: string): string {
	const hash = keccak_256(new TextEncoder().encode(signature))
	// First 4 bytes (8 hex chars)
	return Array.from(hash)
		.slice(0, 4)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.toLowerCase()
}

// Left-pad address to 32 bytes (64 hex chars)
function leftPadAddress(address: string): string {
	let clean = address.startsWith("0x") ? address.slice(2) : address
	if (clean.length !== 40) throw new Error("Invalid address length")
	const result = clean.padStart(64, "0")
	return result.toLowerCase()
}

export function overrideForLeafAppendedEventSignature(address: string): string {
	const result = "0x" + leftPadAddress(address)
	console.log(`Leaf appended event signature override: ${result}`)
	return result.toLowerCase()
}

// Combine selector and argument
export function overrideForGetRootCidCalldata(address: string): string {
	const selector = getSelector("getRootCID(address)")
	const arg = leftPadAddress(address)
	const result = "0x" + selector + arg
	console.log(`Root CID calldata override: ${result}`)
	return result.toLowerCase()
}

// Combine selector and argument
export function overrideForGetStateCalldata(address: string): string {
	const selector = getSelector("getState(address)")
	const arg = leftPadAddress(address)
	const result = "0x" + selector + arg
	console.log(`State calldata override: ${result}`)
	return result.toLowerCase()
}
