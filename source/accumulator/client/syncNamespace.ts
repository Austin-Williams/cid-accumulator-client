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
	shouldPut: boolean,
	shouldPin: boolean,
	shouldProvide: boolean,
	getAccumulatorDataCalldataOverride: string | undefined,
	getLatestCidCalldataOverride: string | undefined,
	eventTopicOverride: string | undefined,
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
		newLeafSubscribers: [],
		onNewLeaf: (callback: (index: number, data: string) => void) => onNewLeaf(sync.newLeafSubscribers, callback),
		startSubscriptionSync: () =>
			startSubscriptionSync(
				ipfs,
				mmr,
				storageAdapter,
				ethereumHttpRpcUrl,
				ethereumWsRpcUrl,
				sync.websocket,
				(newWs) => {
					sync.websocket = newWs
				},
				lastProcessedBlock,
				(b) => {
					lastProcessedBlock = b
				},
				sync.newLeafSubscribers,
				contractAddress,
				() => sync.highestCommittedLeafIndex,
				(i) => {
					sync.highestCommittedLeafIndex = i
				},
				shouldPut,
				shouldProvide,
			),
		startPollingSync: () =>
			startPollingSync({
				ipfs,
				mmr,
				storageAdapter,
				ethereumHttpRpcUrl,
				contractAddress,
				getLiveSyncRunning: () => sync.liveSyncRunning,
				setLiveSyncInterval: (interval) => {
					sync.liveSyncInterval = interval
				},
				newLeafSubscribers: sync.newLeafSubscribers,
				lastProcessedBlock,
				setLastProcessedBlock: (b) => {
					lastProcessedBlock = b
				},
				getHighestCommittedLeafIndex: () => sync.highestCommittedLeafIndex,
				setHighestCommittedLeafIndex: (i) => {
					sync.highestCommittedLeafIndex = i
				},
				shouldPut,
				shouldProvide,
				getAccumulatorDataCalldataOverride,
				eventTopicOverride,
			}),
		startLiveSync: () =>
			startLiveSync(
				ipfs,
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
				sync.newLeafSubscribers,
				lastProcessedBlock,
				(b) => {
					lastProcessedBlock = b
				},
				() => sync.highestCommittedLeafIndex,
				(i) => {
					sync.highestCommittedLeafIndex = i
				},
				shouldPin,
				shouldProvide,
				getAccumulatorDataCalldataOverride,
				getLatestCidCalldataOverride,
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
			syncBackwardsFromLatest(ipfs, storageAdapter, ethereumHttpRpcUrl, contractAddress, (b) => {
				lastProcessedBlock = b
			}),
	}
	return sync
}
