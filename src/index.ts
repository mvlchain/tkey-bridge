import ThresholdKey, {CoreError} from "@tkey/core";
import TorusStorageLayer from "@tkey/storage-layer-torus";
import BN from "bn.js"
import {getPubKeyPoint, ShareStore, ShareStoreMap, ShareStorePolyIDShareIndexMap} from "@tkey/common-types";
import {TORUS_NETWORK_TYPE} from "@toruslabs/torus-direct-web-sdk";
import path from "path";
import ServiceProviderBase from "@tkey/service-provider-base"
import log from 'loglevel';
import {generatePrivate} from "@toruslabs/eccrypto";

/*
1. split given key
2. save provider share to torus network
3. reconstruct key
 */

const proxyContractAddress = process.env.PROXY_CONTRACT_ADDR;
const network = process.env.NETWORK as TORUS_NETWORK_TYPE;
const variant = 'DEBUG';
const version = `0.1.1-${variant}`;
// @ts-ignore
const isDebug = variant === 'DEBUG';

log.setLevel(isDebug ? 'trace' : 'info', false);

const directWebBaseUrl = location.origin + path.join(path.dirname(location.pathname), "serviceworker")

const getServiceProvider = (postboxKey: string) => new ServiceProviderBase({postboxKey});
const storageLayer = new TorusStorageLayer({
  hostUrl: "https://metadata.tor.us",
  // serviceProvider,
  enableLogging: true
});

log.info("tkey-bridge version: " + version);
log.info("proxyContractAddress", proxyContractAddress)
log.info("network", network)
log.info("directWebBaseUrl", directWebBaseUrl);

async function _splitKey(postboxKey: string, privateKey: BN): Promise<{ torusShare: ShareStore, deviceShare: ShareStore, serverShare: ShareStore }> {
  log.trace('postboxkey=' + postboxKey);
  const serviceProvider = getServiceProvider(postboxKey);
  const tkey = new ThresholdKey({serviceProvider, storageLayer});
  const initResult = await tkey.initialize({importKey: privateKey});
  const pubkey = getPubKeyPoint(privateKey);
  if (!(pubkey.x.eq(initResult.pubKey.x) && pubkey.y.eq(initResult.pubKey.y))) {
    log.trace('initResult.pubKey='+JSON.stringify(initResult.pubKey.toJSON()));
    log.trace('pubkey='+JSON.stringify(pubkey.toJSON()));
    return _forceInitAndSplit(tkey, privateKey);
  } else if (initResult.requiredShares > 0) { // we need more shares, but we don't have it now!
    // we reset with key again
    return _forceInitAndSplit(tkey, privateKey);
  }

  const polyId = tkey.metadata.getLatestPublicPolynomial().polynomialId;

  if (tkey.getCurrentShareIndexes().length < 3) {
    log.error("share index length < 3, length=" + tkey.getCurrentShareIndexes().length);
    throw new Error("share index length < 3");
  }

  return shareMapToShares(tkey.shares[polyId]);
}

function shareMapToShares(shareStoreMap: ShareStoreMap): { torusShare: ShareStore, deviceShare: ShareStore, serverShare: ShareStore } {
  log.trace('shareMapToShares');
  let torusShare: ShareStore, deviceShare: ShareStore, serverShare: ShareStore;
  for (let shareIndex in shareStoreMap) {
    log.trace('shareIndex=' + shareIndex);
    const shareStore = shareStoreMap[shareIndex];
    if (shareIndex === '1') {
      torusShare = shareStore;
    } else if (!deviceShare) {
      deviceShare = shareStore;
    } else if (!serverShare) {
      serverShare = shareStore;
    }
  }
  log.trace("torusShare=" + JSON.stringify(torusShare.toJSON()));
  log.trace("serverShare=" + JSON.stringify(serverShare.toJSON()));
  log.trace("deviceShare=" + JSON.stringify(deviceShare.toJSON()));
  return {torusShare, deviceShare, serverShare};
}

async function _forceInitAndSplit(tkey: ThresholdKey, privateKey: BN): Promise<{ torusShare: ShareStore, deviceShare: ShareStore, serverShare: ShareStore }> {
  log.trace('_forceInitAndSplit');
  const details = tkey.getKeyDetails();
  log.trace('details.requiredShares=' + details.requiredShares);
  if (details.requiredShares === 0) {
    // don't need to generate new share!
  } else if (details.requiredShares === 1) {
    const share = new BN(generatePrivate());
    await tkey._initializeNewKey({importedKey: privateKey, determinedShare: share});
    log.trace('after _initializeNewKey');
  } else {
    throw new Error('requiredShares > 1');
  }
  const polyId = tkey.metadata.getLatestPublicPolynomial().polynomialId;
  log.trace('polyId=' + polyId);
  return shareMapToShares(tkey.shares[polyId]);
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

async function _reconstructKeyWithTorusShare(postboxKey: string, nonProviderShare: ShareStore): Promise<{ privateKey: BN, share: ShareStore }> {
  const serviceProvider = getServiceProvider(postboxKey);
  const tkey = new ThresholdKey({serviceProvider, storageLayer});

  // @ts-ignore
  await tkey.initialize({ neverInitializeNewKey: true });
  tkey.inputShareStore(nonProviderShare);
  const {privKey: privateKey} = await tkey.reconstructKey();
  log.trace('reconstructed private key=' + privateKey.toString('hex'));
  const polyId = tkey.metadata.getLatestPublicPolynomial().polynomialId;
  log.trace('polyId=' + polyId);
  const shareStoreMap = tkey.shares[polyId];
  const indexes = tkey.metadata.getShareIndexesForPolynomial(polyId);
  log.trace('polynomial share indexes=');
  for (let i=0; i<indexes.length; i++) { log.trace(indexes[i]); }

  const existing = Object.keys(shareStoreMap);
  log.trace('existing indexes=');
  for (let i=0; i<existing.length; i++) { log.trace(existing[i]); }

  const nonExisting = indexes.find((x) => existing.indexOf(x) < 0);
  let share: ShareStore;
  log.trace('nonExisting=' + nonExisting);
  if (!!nonExisting) {
    share = tkey.outputShareStore(nonExisting, polyId);
    log.trace('share=' + (share.share.share.toString('hex')));
  }
  return {privateKey, share};
}


async function _getTorusShare(postboxKey: string): Promise<ShareStore | null> {
  log.trace("entering _getTorusShare");
  const serviceProvider = getServiceProvider(postboxKey);
  log.trace("after init serviceProvider");
  const tkey = new ThresholdKey({serviceProvider, storageLayer});
  try {
    await tkey.initialize({
      neverInitializeNewKey: true
    });
  } catch (e) {
    if (e instanceof CoreError && e.code === 1000 && e.message === 'key has not been generated yet') {
      log.trace('this is new user');
      return null;
    } else {
      throw e;
    }
  }
  const polyId = tkey.metadata.getLatestPublicPolynomial().getPolynomialID();
  const shares = tkey.shares[polyId];
  if (!!shares) {
    log.warn('cannot get the shares for polynomial id = ' + polyId);
    return null;
  }
  return shares['1'];
}

export function reconstructKeyWithTorusShare(postboxKey: string, shareJson: string) {
  log.debug('shareJson string = ' + shareJson);
  log.debug('postbox key = ' + postboxKey);
  _reconstructKeyWithTorusShare(postboxKey, ShareStore.fromJSON(JSON.parse(shareJson)))
    .then(({privateKey, share}) => {
      _sendMessageToNative("privateKeyReconstructed", {privateKey: privateKey.toString('hex'), share: JSON.stringify(share.toJSON())} );
    })
    .catch((err) => {
      log.error(err.message);
      _sendMessageToNative('privateKeyReconstructFailed', err.message);
    });
}

export function getTorusShare(postboxKey: string) {
  _getTorusShare(postboxKey)
    .then((ts) => {
      _sendMessageToNative('torusShareRetrieved', ts && ts.toJSON());
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
window.reconstructKeyWithTorusShare = reconstructKeyWithTorusShare;

// @ts-ignore
window.getTorusShare = getTorusShare;
