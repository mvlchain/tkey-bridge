import ThresholdKey from "@tkey/core";
import TorusServiceProvider from "@tkey/service-provider-torus";
import TorusStorageLayer from "@tkey/storage-layer-torus";
import BN from "bn.js"
import {ShareStore} from "@tkey/common-types";
import {TORUS_NETWORK_TYPE} from "@toruslabs/torus-direct-web-sdk";
import path from "path";

/*
1. split given key
2. save provider share to torus network
3. reconstruct key
 */
const LOGIN_TYPE_GOOGLE = 'GOOGLE';
const LOGIN_TYPE_APPLE = 'APPLE';
const LOGIN_TYPE_FACEBOOK = 'FACEBOOK';

const postboxKey = process.env.POSTBOX_KEY;

const proxyContractAddress = process.env.PROXY_CONTRACT_ADDR;
const network = process.env.NETWORK as TORUS_NETWORK_TYPE;

const directWebBaseUrl = location.origin + path.join(path.dirname(location.pathname), "serviceworker")
console.log("proxyContractAddress", proxyContractAddress)
console.log("network", network)
console.log("directWebBaseUrl", directWebBaseUrl);
const serviceProvider = new TorusServiceProvider({
    postboxKey: postboxKey,
    directParams: {
        baseUrl: directWebBaseUrl,
        proxyContractAddress,
        network,
        enableLogging: true
    },
    enableLogging: true
});
const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    serviceProvider,
    enableLogging: true
});

const splitKeyFromStr = (pkeyString) => _splitKey(new BN(pkeyString, 16))

async function _splitKey(privateKey: BN) {
    const tkey = new ThresholdKey({serviceProvider, storageLayer, enableLogging: true});
    // @ts-ignore
    await tkey.serviceProvider.init({skipSw: false, skipPrefetch: false});
    await tkey._initializeNewKey({
        importedKey: privateKey,
        initializeModules: true
    });

    const {newShareStores, newShareIndex} = await tkey.generateNewShare();

    const pubPoly = tkey.metadata.getLatestPublicPolynomial();
    const pubPolyID = pubPoly.getPolynomialID();

    const torusShare = newShareStores['1'];
    let deviceShare: ShareStore = null;
    let serverShare: ShareStore = null;

    const shareIds = tkey.metadata.getShareIndexesForPolynomial(pubPolyID);
    for (let k=0; k < shareIds.length; k++) {
        if (shareIds[k] !== '1') {
            if (!deviceShare) {
                deviceShare = newShareStores[shareIds[k]];
            } else {
                serverShare = newShareStores[shareIds[k]];
            }
        }
    }

    return {torusShare, deviceShare, serverShare};
}

export function splitKey(pkeyString) {
    _splitKey(new BN(pkeyString, 16)).then(({torusShare, deviceShare, serverShare}) => {
        _sendMessageToNative('keySplitFinished', {ts: torusShare, ds: deviceShare, ss: serverShare});
    })
}
async function _saveTorusShare(providerShare: ShareStore, id: string) {
    const tkey = new ThresholdKey({serviceProvider, storageLayer});
    // @ts-ignore
    await tkey.serviceProvider.init({skipSw: false, skipPrefetch: false});
    await tkey.storageLayer.setMetadata({
        input: providerShare,
        serviceProvider
    });
    await tkey.addShareDescription(providerShare.share.shareIndex.toString(), JSON.stringify({
        module: 'serviceProvider',
        id
    }));
}

export function saveTorusShare(providerShare: string, id: string) {
    _saveTorusShare(ShareStore.fromJSON(JSON.parse(providerShare)), id).then(() =>
        _sendMessageToNative('torusShareSaved', null));
}

function _sendMessageToNative(command: string, params) {
    // iOS
    // @ts-ignore
    if (window.webkit?.messageHandlers?.tkeybridge) {
        const message = {
            command,
            params
        };
        // @ts-ignore
        window.webkit.messageHandlers.tkeybridge.postMessage(message);
    }
    // Android
    // @ts-ignore
    else if (window.tkeybridge) {
        const paramsJson = JSON.stringify(params);
        // @ts-ignore
        window.tkeybridge[command](paramsJson);
    } else {
        // error
    }
}

// @ts-ignore
window.splitKey = splitKey;
// @ts-ignore
window.splitKeyFromStr = splitKeyFromStr
// @ts-ignore
window.saveTorusShare = saveTorusShare;
