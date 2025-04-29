import type { IpfsAdapter } from "../../interfaces/IpfsAdapter"
import type { StorageAdapter } from "../../interfaces/StorageAdapter"
import type { DagCborEncodedData, IpfsNamespace } from "../../types/types"
import type { CID } from "../../utils/CID"
import { getAndResolveCID, rePinAllDataToIPFS, putPinProvideToIPFS } from "./ipfsHelpers"

export function getIpfsNamespace(
	ipfs: IpfsAdapter,
	storageAdapter: StorageAdapter,
	shouldPut: boolean,
	shouldPin: boolean,
	shouldProvide: boolean,
	shouldRemotePin: boolean,
): IpfsNamespace {
	return {
		ipfsAdapter: ipfs,
		shouldPut,
		shouldPin,
		shouldProvide,
		shouldRemotePin,
		getAndResolveCID: (cid: CID<unknown, 113, 18, 1>, opts?: { signal?: AbortSignal }) =>
			getAndResolveCID(ipfs, storageAdapter, cid, opts),
		rePinAllDataToIPFS: () => rePinAllDataToIPFS(ipfs, storageAdapter, shouldPut, shouldPin, shouldProvide, shouldRemotePin),
		putPinProvideToIPFS: ({ cid, dagCborEncodedData }: { cid: CID<unknown, 113, 18, 1>; dagCborEncodedData: DagCborEncodedData }) =>
			putPinProvideToIPFS(ipfs, shouldPut, shouldProvide, shouldRemotePin, cid, dagCborEncodedData),
	}
}
