import { getLeafAppendedLogForTargetLeafIndex } from "../ethereum/commonCalls"
import { NormalizedLeafAppendedtEvent } from "../types/types"

/**
 * Walks back along the previousInsertBlockNumber chain, starting from fromLeafIndex,
 * until toLeafIndex is reached (inclusive). Returns logs in order from oldest to newest.
 * Throws if a log is missing or the chain cannot be completed.
 * WARNING: This is a very slow way to walk back because it requires one (cheap) RPC call per leaf.
 * This is intended to be used only for filling in a few missed leaves for accumulator nodes that are already synced
 * and are processing live events.
 */
export async function walkBackLeafAppendedLogsOrThrow(
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	fromLeafIndex: number,
	fromLeafIndexBlockNumber: number,
	toLeafIndex: number, // inclusive; oldest leaf index to walk back to
	eventTopicOverride?: string,
): Promise<NormalizedLeafAppendedtEvent[]> {
	let currentLeafIndex = fromLeafIndex
	let currentLeafIndexBlockNumber = fromLeafIndexBlockNumber
	const logs: NormalizedLeafAppendedtEvent[] = []

	while (currentLeafIndex >= toLeafIndex) {
		const log: NormalizedLeafAppendedtEvent | null = await getLeafAppendedLogForTargetLeafIndex({
			ethereumHttpRpcUrl,
			contractAddress,
			fromBlock: currentLeafIndexBlockNumber,
			toBlock: currentLeafIndexBlockNumber,
			targetLeafIndex: currentLeafIndex,
			eventTopicOverride,
		})
		if (!log) {
			throw new Error(
				`Missing LeafAppended log for leafIndex=${currentLeafIndex} in block=${currentLeafIndexBlockNumber}`,
			)
		}
		logs.push(log)
		if (currentLeafIndex === toLeafIndex) break
		// Defensive: avoid infinite loop
		if (log.leafIndex === undefined || log.previousInsertBlockNumber === undefined) {
			throw new Error(`[walkBackLeafAppendedLogsOrThrow] Malformed LeafAppended log at leafIndex ${currentLeafIndex}`)
		}
		// Prepare for next iteration
		currentLeafIndex = log.leafIndex - 1
		currentLeafIndexBlockNumber = log.previousInsertBlockNumber
		if (currentLeafIndex < toLeafIndex) {
			throw new Error(`[walkBackLeafAppendedLogsOrThrow] Walkback went past toLeafIndex (${toLeafIndex})`)
		}
	}

	return logs.reverse() // Oldest to newest
}
