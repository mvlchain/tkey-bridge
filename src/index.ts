import ThresholdKey from "@tkey/core";
import TorusStorageLayer from "@tkey/storage-layer-torus";
import BN from "bn.js"
import {ShareStore} from "@tkey/common-types";
import {TORUS_NETWORK_TYPE} from "@toruslabs/torus-direct-web-sdk";
import path from "path";
import ServiceProviderBase from "@tkey/service-provider-base"

/*
1. split given key
2. save provider share to torus network
3. reconstruct key
 */

const proxyContractAddress = process.env.PROXY_CONTRACT_ADDR;
const network = process.env.NETWORK as TORUS_NETWORK_TYPE;
const version = '0.0.4';

const directWebBaseUrl = location.origin + path.join(path.dirname(location.pathname), "serviceworker")
console.log("tkey-bridge version: " + version);
console.log("proxyContractAddress", proxyContractAddress)
console.log("network", network)
console.log("directWebBaseUrl", directWebBaseUrl);

async function _splitKey(postboxKey: string, privateKey: BN) {
  const serviceProvider = new ServiceProviderBase({postboxKey});
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    serviceProvider,
    enableLogging: true
  });

  const tkey = new ThresholdKey({serviceProvider, storageLayer, enableLogging: true});
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

export function splitKey(postboxKey: string, pkeyString: string) {
  _splitKey(postboxKey, new BN(pkeyString, 16))
    .then(({torusShare, deviceShare, serverShare}) => {
      _sendMessageToNative('keySplitFinished', {ts: JSON.stringify(torusShare.toJSON()), ds: JSON.stringify(deviceShare.toJSON()), ss: JSON.stringify(serverShare.toJSON())});
    })
    .catch((err) => {
      console.error(err.message);
      _sendMessageToNative('keySplitFailed', err.message);
    });
}
async function _saveTorusShare(postboxKey: string, providerShare: ShareStore, id: string) {
  const serviceProvider = new ServiceProviderBase({postboxKey});
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    serviceProvider,
    enableLogging: true
  });

  const tkey = new ThresholdKey({serviceProvider, storageLayer});
  await tkey.initialize({neverInitializeNewKey: true });
  console.log('after tkey.initialize')
  await tkey.storageLayer.setMetadata({
    input: providerShare,
    serviceProvider
  });
  console.log('after setmetadata')
  await tkey.addShareDescription(providerShare.share.shareIndex.toString(), JSON.stringify({
    module: 'serviceProvider',
    id
  }));
  console.log('after addShareDescription')
}

export function saveTorusShare(postboxKey: string, providerShare: string, id: string) {
  _saveTorusShare(postboxKey, ShareStore.fromJSON(JSON.parse(providerShare)), id)
    .then(() => {
      console.log('after _saveTorusShare.then')
      _sendMessageToNative('torusShareSaved', null);
    })
    .catch((err) => {
      console.error(err.message);
      _sendMessageToNative('saveTorusShareFailed', err.message);
    });
}

async function _reconstructKeyWithTorusShare(postboxKey: string, anotherShare: ShareStore): Promise<string> {
  const serviceProvider = new ServiceProviderBase({postboxKey});
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    serviceProvider,
    enableLogging: true
  });

  const tkey = new ThresholdKey({serviceProvider, storageLayer});

  const rawServiceProviderShare = await tkey.storageLayer.getMetadata({
    serviceProvider: tkey.serviceProvider
  });
  console.log('rawServiceProviderShare = ' + JSON.stringify((rawServiceProviderShare as ShareStore).toJSON()));
  // @ts-ignore
  await tkey.initialize({withShare: rawServiceProviderShare, neverInitializeNewKey: true });
  tkey.inputShareStore(anotherShare);
  const {privKey} = await tkey.reconstructKey();
  return privKey.toString(16);
}

async function _getTorusShare(postboxKey: string): Promise<ShareStore> {
  const serviceProvider = new ServiceProviderBase({postboxKey});
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    serviceProvider,
    enableLogging: true
  });

  const tkey = new ThresholdKey({serviceProvider, storageLayer});

  const rawServiceProviderShare = await tkey.storageLayer.getMetadata({
    serviceProvider: tkey.serviceProvider
  });

  return rawServiceProviderShare as ShareStore
}

export function reconstructKeyWithTorusShare(postboxKey: string, shareJson: string) {
  console.log('shareJson string = ' + shareJson);
  console.log('postbox key = ' + postboxKey);
  _reconstructKeyWithTorusShare(postboxKey, ShareStore.fromJSON(JSON.parse(shareJson)))
    .then((privKey) => {
      _sendMessageToNative("privateKeyReconstructed", privKey);
    })
    .catch((err) => {
      console.error(err.message);
      _sendMessageToNative('privateKeyReconstructFailed', err.message);
    });
}

export function getTorusShare(postboxKey: string) {
  _getTorusShare(postboxKey)
    .then((ts) => {
      _sendMessageToNative('torusShareRetrieved', JSON.stringify(ts.toJSON()));
    })
    .catch((err) => {
      console.error('getTorusShare failed');
      console.error(err.message);
      _sendMessageToNative('torusShareRetrieveFailed', err.message);
    });
}

function _sendMessageToNative(command: string, params?: any) {
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
    if (params) {
      // @ts-ignore
      window.tkeybridge[command](JSON.stringify(params));
    } else {
      // @ts-ignore
      window.tkeybridge[command]();
    }
  } else {
    console.error('detected device is neither iOS nor Android');
  }
}

// @ts-ignore
window.splitKey = splitKey;

// @ts-ignore
window.saveTorusShare = saveTorusShare;

// @ts-ignore
window.reconstructKeyWithTorusShare = reconstructKeyWithTorusShare;

// @ts-ignore
window.getTorusShare = getTorusShare;