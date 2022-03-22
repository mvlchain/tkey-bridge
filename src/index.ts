import ThresholdKey from "@tkey/core";
import TorusStorageLayer from "@tkey/storage-layer-torus";
import BN from "bn.js"
import {ShareStore} from "@tkey/common-types";
import {TORUS_NETWORK_TYPE} from "@toruslabs/torus-direct-web-sdk";
import path from "path";
import ServiceProviderBase from "@tkey/service-provider-base"
import log from 'loglevel';

/*
1. split given key
2. save provider share to torus network
3. reconstruct key
 */

const proxyContractAddress = process.env.PROXY_CONTRACT_ADDR;
const network = process.env.NETWORK as TORUS_NETWORK_TYPE;
const variant = 'RELEASE';
const version = `0.0.12-${variant}`;
// @ts-ignore
const isDebug = variant === 'DEBUG';

log.setLevel(isDebug ? 'trace' : 'info', false);

const directWebBaseUrl = location.origin + path.join(path.dirname(location.pathname), "serviceworker")

log.info("tkey-bridge version: " + version);
log.info("proxyContractAddress", proxyContractAddress)
log.info("network", network)
log.info("directWebBaseUrl", directWebBaseUrl);

async function _splitKey(postboxKey: string, privateKey: BN) {
  log.trace('enter splitKey');
  /*
  enableLogging?: boolean;
  hostUrl?: string;
  serverTimeOffset?: number;
   */
  const serviceProvider = new ServiceProviderBase({postboxKey});
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    // serviceProvider,
    enableLogging: true
  });

  const tkey = new ThresholdKey({serviceProvider, storageLayer, enableLogging: true});
  log.trace('before _initializeNewKey');
  await tkey._initializeNewKey({
    importedKey: privateKey,
    initializeModules: true
  });
  log.trace('after _initializeNewKey');

  const {newShareStores, newShareIndex} = await tkey.generateNewShare();
  log.trace('after generatenewshare');

  const pubPoly = tkey.metadata.getLatestPublicPolynomial();
  log.trace('after getLatestPublicPolynomial');
  const pubPolyID = pubPoly.getPolynomialID();

  const torusShare = newShareStores['1'];
  let deviceShare: ShareStore = null;
  let serverShare: ShareStore = null;

  const shareIds = tkey.metadata.getShareIndexesForPolynomial(pubPolyID);
  log.trace('after getShareIndexesForPolynomial');
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
      log.error(JSON.stringify(err));
      log.error(err.message);
      _sendMessageToNative('keySplitFailed', err.message);
    });
}
async function _saveTorusShare(postboxKey: string, providerShare: ShareStore, id: string) {
  const serviceProvider = new ServiceProviderBase({postboxKey});
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    // serviceProvider,
    enableLogging: true
  });

  const tkey = new ThresholdKey({serviceProvider, storageLayer});
  await tkey.initialize({neverInitializeNewKey: true });
  log.trace('after tkey.initialize')
  log.debug(`save torus share = ${JSON.stringify(providerShare.toJSON())}, postboxkey=${postboxKey}`);
  await tkey.storageLayer.setMetadata({
    input: providerShare,
    serviceProvider
  });
  log.trace('after setmetadata')
  await tkey.addShareDescription(providerShare.share.shareIndex.toString(), JSON.stringify({
    module: 'serviceProvider',
    id
  }));
  log.trace('after addShareDescription')
}

export function saveTorusShare(postboxKey: string, providerShare: string, id: string) {
  _saveTorusShare(postboxKey, ShareStore.fromJSON(JSON.parse(providerShare)), id)
    .then(() => {
      log.trace('after _saveTorusShare.then')
      _sendMessageToNative('torusShareSaved', null);
    })
    .catch((err) => {
      log.error(err.message);
      _sendMessageToNative('saveTorusShareFailed', err.message);
    });
}

async function _reconstructKeyWithTorusShare(postboxKey: string, anotherShare: ShareStore): Promise<string> {
  const serviceProvider = new ServiceProviderBase({postboxKey});
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    // serviceProvider,
    enableLogging: true
  });

  const tkey = new ThresholdKey({serviceProvider, storageLayer});

  const rawServiceProviderShare = await tkey.storageLayer.getMetadata({
    serviceProvider: tkey.serviceProvider
  });
  log.debug('rawServiceProviderShare = ' + JSON.stringify(rawServiceProviderShare));
  // @ts-ignore
  await tkey.initialize({withShare: rawServiceProviderShare, neverInitializeNewKey: true });
  tkey.inputShareStore(anotherShare);
  const {privKey} = await tkey.reconstructKey();
  return privKey.toString(16);
}

async function _getTorusShare(postboxKey: string): Promise<Object> {
  log.trace("entering _getTorusShare");
  const serviceProvider = new ServiceProviderBase({postboxKey});
  log.trace("after init serviceProvider");
  const storageLayer = new TorusStorageLayer({
    hostUrl: "https://metadata.tor.us",
    // serviceProvider,
    enableLogging: true
  });
  log.trace("after init storageLayer");

  const tkey = new ThresholdKey({serviceProvider, storageLayer});
  log.trace("after init Thresholdkey");

  const rawServiceProviderShare = await tkey.storageLayer.getMetadata({
    serviceProvider: tkey.serviceProvider
  });
  log.trace("after get rawServiceProviderShare");
  log.debug(`get torus share = ${JSON.stringify(rawServiceProviderShare)}, postboxkey=${postboxKey}`);

  return rawServiceProviderShare
}

export function reconstructKeyWithTorusShare(postboxKey: string, shareJson: string) {
  log.debug('shareJson string = ' + shareJson);
  log.debug('postbox key = ' + postboxKey);
  _reconstructKeyWithTorusShare(postboxKey, ShareStore.fromJSON(JSON.parse(shareJson)))
    .then((privKey) => {
      _sendMessageToNative("privateKeyReconstructed", privKey);
    })
    .catch((err) => {
      log.error(err.message);
      _sendMessageToNative('privateKeyReconstructFailed', err.message);
    });
}

export function getTorusShare(postboxKey: string) {
  _getTorusShare(postboxKey)
    .then((ts) => {
      _sendMessageToNative('torusShareRetrieved', JSON.stringify(ts));
    })
    .catch((err) => {
      log.error('getTorusShare failed');
      log.error(JSON.stringify(err));
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
    log.error('detected device is neither iOS nor Android');
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
