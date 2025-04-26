// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { DagCborCIDEncoder } from "../libraries/DagCborCIDEncoder.sol";


// CUSTOM ERRORS
error DataBlockTooLargeForIPFS(uint256 actualSize);

/**
* An on-chain Merkle Mountain Range (MMR) accumulator that allows arbitrary
* data (bytes) to be appended as leaves (via the _addData function). The
* contract maintains a root hash encoded as an IPFS CID (Content Identifier),
* which is updated trustlessly -- by this contract itself -- with each insertion.
* The CID can be used to fetch and verify the complete data set from IPFS, so
* users don't need their own Ethereum nodes or paid-tier RPC providers to
* acquire and verify arbitrarily large sets of data from the contract. It is
* suitable for applications requiring efficient, verifiable access to
* historical data.
*/

contract CIDAccumulator {
	// LIBRARIES
	using DagCborCIDEncoder for bytes;

	// EVENTS
	event LeafInsert(
		uint32 indexed leafIndex,
		uint32 previousInsertBlockNumber,
		bytes newData,
		bytes32[] leftInputs
	);

	// CONSTANTS
	// Packed bitfield layout for mmrMetaBits
	uint256 private constant PEAK_COUNT_OFFSET = 160;
	uint256 private constant PEAK_COUNT_MASK = 0x1F; // 5 bits
	uint256 private constant LEAF_COUNT_OFFSET = 165;
	uint256 private constant LEAF_COUNT_MASK = 0xFFFFFFFF; // 32 bits
	uint256 private constant PREVIOUS_INSERT_BLOCKNUM_OFFSET = 197;
	uint256 private constant PREVIOUS_INSERT_BLOCKNUM_MASK = 0xFFFFFFFF; // 32 bits
	uint256 private constant DEPLOY_BLOCKNUM_OFFSET = 229;
	uint256 private constant DEPLOY_BLOCKNUM_MASK = 0x7FFFFFF; // 27 bits
	uint256 private constant MAX_SIZE_IPFS_BLOCK = 1_000_000; // Just under 1 MB

	// STATE VARIABLES
	bytes32[32] private peaks; // Fixed-size array for node hashes
	/**
	* Packed bitfield containing all peak node heights, peak count,
	* total leaf count, the previous insert block number, and the contract
	* deployment block number.
	*
	* Layout (from least significant bit to most):
	* Bits 0–159   : 32 peak node heights (5 bits each). heights[i] = (bits >> (i * 5)) & 0x1F
	* Bits 160–164 : peakCount (5 bits) — number of peaks currently in use
	* Bits 165–196 : leafCount (32 bits) — total number of data leaves added
	* Bits 197–228 : previousInsertBlockNumber (32 bits)
	* Bits 229–255 : deployBlockNumber (27 bits) — block number this contract was deployed in
	*
	* This structure allows us to avoid separate storage slots for peak metadata,
	* reducing gas usage by packing everything into a single uint256.
	*/
	uint256 private mmrMetaBits;

	constructor() {
		mmrMetaBits = uint256(block.number) << DEPLOY_BLOCKNUM_OFFSET;
	}

	// EXTERNAL FUNCTIONS
	// For low-level off-chain integration
	function getAccumulatorData() external view returns (uint256, bytes32[32] memory) {
		return (mmrMetaBits, peaks);
	}

	// PUBLIC FUNCTIONS
	function getLatestCID() public view returns (bytes memory) {
		bytes32 root = _getMMRRoot();
		return _wrapCID(root);
	}

	// INTERNAL FUNCTIONS
	function _addData(bytes calldata newData) internal {
		// Defensive: Reject blocks too large for IPFS
		if (newData.length > MAX_SIZE_IPFS_BLOCK) revert DataBlockTooLargeForIPFS(newData.length);

		// SLOAD the packed bitfield and get the peakCount
		uint256 bits = mmrMetaBits;
		uint256 peakCount = uint256((bits >> PEAK_COUNT_OFFSET) & PEAK_COUNT_MASK);

		// Collect the left half of all _combine steps (required for off-chain integration)
		bytes32[32] memory leftInputs;

		// Merge peaks of equal height
		bytes32 carryHash = DagCborCIDEncoder.encodeRawBytes(newData);
		uint256 carryHeight = 0;
		uint256 mergeCount = 0;
		while (
			peakCount > 0 &&
			uint256((bits >> ((peakCount - 1) * 5)) & 0x1F) == carryHeight
		) {
			bytes32 topHash = peaks[peakCount - 1]; // SLOAD
			peakCount--;

			bytes32 combined = _combine(topHash, carryHash);

			// Record the left input for this merge
			leftInputs[mergeCount] = topHash;
			unchecked {mergeCount++;}

			carryHash = combined;
			unchecked { carryHeight++; }
		}

		peaks[peakCount] = carryHash; // SSTORE the hash of the DAG-CBOR encoded link node

		// Shrink array to actual size
		bytes32[] memory finalLeftInputs = new bytes32[](mergeCount);
		for (uint256 i = 0; i < mergeCount;) {
			finalLeftInputs[i] = leftInputs[i];
			unchecked { i++; }
		}

		emit LeafInsert(
			uint32((bits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK),
			uint32((bits >> PREVIOUS_INSERT_BLOCKNUM_OFFSET) & PREVIOUS_INSERT_BLOCKNUM_MASK),
			newData, // This is NOT DAG-CBOR encoded
			finalLeftInputs // These are the hashes of the DAG-CBOR encoded nodes on the left of each _combine for this merge
		);

		// Update packed heights
		uint256 heightShift = peakCount * 5;
		bits &= ~(uint256(0x1F) << heightShift); // clear old height
		bits |= uint256(carryHeight) << heightShift; // set new height

		// Update peak count
		bits &= ~(PEAK_COUNT_MASK << PEAK_COUNT_OFFSET);
		bits |= uint256(peakCount + 1) << PEAK_COUNT_OFFSET;

		// Update leaf count
		uint256 currentLeafCount = (bits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK;
		bits &= ~(LEAF_COUNT_MASK << LEAF_COUNT_OFFSET);
		bits |= (currentLeafCount + 1) << LEAF_COUNT_OFFSET;

		// Store current block number in mmrMetaBits
		bits &= ~(PREVIOUS_INSERT_BLOCKNUM_MASK << PREVIOUS_INSERT_BLOCKNUM_OFFSET); // clear
		bits |= uint256(block.number) << PREVIOUS_INSERT_BLOCKNUM_OFFSET; // set

		mmrMetaBits = bits; // SSTORE
	}

	function _getLeafCount() internal view returns (uint256) {
		return uint256((mmrMetaBits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK);
	}

	// PRIVATE FUNCTIONS
	function _combine(bytes32 left, bytes32 right) private pure returns (bytes32) {
		return DagCborCIDEncoder.encodeLinkNode(left, right);
	}

	function _getMMRRoot() private view returns (bytes32 root) {
		uint256 peakCount = (mmrMetaBits >> PEAK_COUNT_OFFSET) & PEAK_COUNT_MASK;
		if (peakCount == 0) { return bytes32(0); }
		root = peaks[0];
		for (uint256 i = 1; i < peakCount; i++) {
			root = _combine(root, peaks[i]);
		}
	}

	function _wrapCID(bytes32 hash) private pure returns (bytes memory) {
		// Multihash prefix: sha2-256 (0x12), length 32 (0x20)
		bytes memory multihash = abi.encodePacked(
			hex"12", // SHA2-256 code.
			hex"20", // Length: 32 bytes.
			hash     // The digest.
		);
		return abi.encodePacked(
			hex"01", // CID version 1.
			hex"71", // dag-cbor codec.
			multihash
		);
	}
}