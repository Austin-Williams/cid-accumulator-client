import type { SyncNamespace } from "../../types/types"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter"
import type { StorageAdapter } from "../../interfaces/StorageAdapter"
import type { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange"

import {
	startSubscriptionSync,
	startPollingSync,
	startLiveSync,
	stopLiveSync,
	syncBackwardsFromLatest,
	onNewLeaf,
} from "./syncHelpers"

export function getSyncNamespace(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
	ethereumHttpRpcUrl: string,
	ethereumWsRpcUrl: string | undefined,
	contractAddress: string,
	lastProcessedBlock: number,
	getStateCalldataOverride: string | undefined,
	getRootCidCalldataOverride: string | undefined,
	eventTopicOverride: string | undefined,
	maxBlockRangePerRpcCall: number,
): SyncNamespace {
	let sync: SyncNamespace = {
		ethereumHttpRpcUrl,
		ethereumWsRpcUrl,
		contractAddress,
		highestCommittedLeafIndex: -1,
		lastProcessedBlock,
		liveSyncRunning: false,
		liveSyncInterval: undefined,
		websocket: undefined,
		newLeafAppendedEventSubscribers: [],
		onNewLeaf: (callback: (index: number, data: string) => void) => onNewLeaf(sync.newLeafAppendedEventSubscribers, callback),
		startSubscriptionSync: () =>
			startSubscriptionSync({
				mmr,
				storageAdapter,
				ethereumHttpRpcUrl,
				ethereumWsRpcUrl,
				ws: sync.websocket,
				setWs: (ws) => { sync.websocket = ws },
				getLastProcessedBlock: () => sync.lastProcessedBlock,
				setLastProcessedBlock: (b) => { sync.lastProcessedBlock = b },
				newLeafAppendedEventSubscribers: sync.newLeafAppendedEventSubscribers,
				contractAddress,
				getStateCalldataOverride,
				eventTopicOverride,
			}),
		startPollingSync: () =>
			startPollingSync({
				mmr,
				storageAdapter,
				ethereumHttpRpcUrl,
				contractAddress,
				getLiveSyncRunning: () => sync.liveSyncRunning,
				setLiveSyncInterval: (interval) => {
					sync.liveSyncInterval = interval
				},
				newLeafAppendedEventSubscribers: sync.newLeafAppendedEventSubscribers,
				getLastProcessedBlock: () => sync.lastProcessedBlock,
				setLastProcessedBlock: (b) => {
					sync.lastProcessedBlock = b
				},
				getRootCidCalldataOverride,
				eventTopicOverride,
			}),
		startLiveSync: () =>
			startLiveSync(
				mmr,
				storageAdapter,
				contractAddress,
				ethereumHttpRpcUrl,
				ethereumWsRpcUrl,
				sync.websocket,
				(newWs) => {
					sync.websocket = newWs
				},
				() => sync.liveSyncRunning,
				(r) => {
					sync.liveSyncRunning = r
				},
				(interval) => {
					sync.liveSyncInterval = interval
				},
				sync.newLeafAppendedEventSubscribers,
				() => sync.lastProcessedBlock,
				(b) => {
					sync.lastProcessedBlock = b
				},
				getStateCalldataOverride,
				getRootCidCalldataOverride,
				eventTopicOverride,
			),
		stopLiveSync: () =>
			stopLiveSync(
				sync.websocket,
				(newWs) => {
					sync.websocket = newWs
				},
				() => sync.liveSyncInterval,
				(r) => {
					sync.liveSyncRunning = r
				},
				(interval) => {
					sync.liveSyncInterval = interval
				},
			),
		syncBackwardsFromLatest: () =>
			syncBackwardsFromLatest(
				ipfs,
				storageAdapter,
				ethereumHttpRpcUrl,
				contractAddress,
				(b) => {
					sync.lastProcessedBlock = b
				},
				getStateCalldataOverride,
				eventTopicOverride,
				maxBlockRangePerRpcCall,
			),
	}
	return sync
}
