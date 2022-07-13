import ThresholdKey, {CoreError, lagrangeInterpolation} from "@tkey/core";
import TorusStorageLayer from "@tkey/storage-layer-torus";
import BN from "bn.js"
import {getPubKeyPoint, ShareStore, ShareStoreMap, ShareStorePolyIDShareIndexMap} from "@tkey/common-types";
import {TORUS_NETWORK_TYPE} from "@toruslabs/torus-direct-web-sdk";
import path from "path";
import ServiceProviderBase from "@tkey/service-provider-base"
import log from 'loglevel';
import {generatePrivate} from "@toruslabs/eccrypto";
import {KEY_NOT_FOUND} from "@tkey/common-types";

/*
1. split given key
2. save provider share to torus network
3. reconstruct key
 */

const proxyContractAddress = process.env.PROXY_CONTRACT_ADDR;
const network = process.env.NETWORK as TORUS_NETWORK_TYPE;
const variant = 'RELEASE';
const version = `0.1.12-${variant}`;
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
  log.debug('postboxkey=' + postboxKey);
  const serviceProvider = getServiceProvider(postboxKey);
  const tkey = new ThresholdKey({serviceProvider, storageLayer});
  const initResult = await tkey.initialize({importKey: privateKey});
  const pubkey = getPubKeyPoint(privateKey);

  if (!(pubkey.x.eq(initResult.pubKey.x) && pubkey.y.eq(initResult.pubKey.y))) {
    log.debug('initResult.pubKey='+JSON.stringify(initResult.pubKey.toJSON()));
    log.debug('pubkey='+JSON.stringify(pubkey.toJSON()));
    throw new Error("different private key exist");
  } else if (initResult.requiredShares > 0) { // we need more shares, but we don't have it now!
    // we reset with key again
    log.debug('initResult.requiredShares =' + initResult.requiredShares);
    throw new Error("not enough shares");
  }

  let polyId = tkey.metadata.getLatestPublicPolynomial().polynomialId;
  log.debug('polyId=' + polyId);

  if (tkey.getCurrentShareIndexes().length < 3) {
    log.info("share index length < 3, length=" + tkey.getCurrentShareIndexes().length);
    const shareResults = await tkey.generateNewShare();
    polyId = tkey.metadata.getLatestPublicPolynomial().polynomialId;
    log.debug('new polyId=' + polyId);
    return shareMapToShares(shareResults.newShareStores);
  }

  return shareMapToShares(tkey.shares[polyId]);
}

function shareMapToShares(shareStoreMap: ShareStoreMap): { torusShare: ShareStore, deviceShare: ShareStore, serverShare: ShareStore } {
  log.debug('shareMapToShares');
  let torusShare: ShareStore, deviceShare: ShareStore, serverShare: ShareStore;
  for (let shareIndex in shareStoreMap) {
    log.debug('shareIndex=' + shareIndex);
    const shareStore = shareStoreMap[shareIndex];
    if (shareIndex === '1') {
      torusShare = shareStore;
    } else if (!deviceShare) {
      deviceShare = shareStore;
    } else if (!serverShare) {
      serverShare = shareStore;
    }
  }
  log.debug("torusShare=" + JSON.stringify(torusShare.toJSON()));
  log.debug("serverShare=" + JSON.stringify(serverShare.toJSON()));
  log.debug("deviceShare=" + JSON.stringify(deviceShare.toJSON()));
  return {torusShare, deviceShare, serverShare};
}

async function _forceInitAndSplit(tkey: ThresholdKey, privateKey: BN): Promise<{ torusShare: ShareStore, deviceShare: ShareStore, serverShare: ShareStore }> {
  log.debug('_forceInitAndSplit');
  const details = tkey.getKeyDetails();
  log.debug('details.requiredShares=' + details.requiredShares);
  if (details.requiredShares === 0) {
    // don't need to generate new share!
  } else if (details.requiredShares === 1) {
    const share = new BN(generatePrivate());
    await tkey._initializeNewKey({importedKey: privateKey, determinedShare: share});
    log.debug('after _initializeNewKey');
  } else {
    throw new Error('requiredShares > 1');
  }
  const polyId = tkey.metadata.getLatestPublicPolynomial().polynomialId;
  log.debug('polyId=' + polyId);
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

function _reconstructKeyWithShares(share1: ShareStore, share2: ShareStore): BN {
  // check sharestore poly id for validation
  if (share1.polynomialID !== share2.polynomialID) {
    throw new Error("share's polynomial id don't match");
  }

  const privKey = lagrangeInterpolation([share1.share.share, share2.share.share], [share1.share.shareIndex, share2.share.shareIndex]);
  return privKey;
}

async function _reconstructKeyWithTorusShare(postboxKey: string, nonProviderShare: ShareStore): Promise<{ privateKey: BN, share: ShareStore }> {
  const serviceProvider = getServiceProvider(postboxKey);
  const tkey = new ThresholdKey({serviceProvider, storageLayer});

  // @ts-ignore
  await tkey.initialize({ neverInitializeNewKey: true });
  tkey.inputShareStore(nonProviderShare);
  const {privKey: privateKey} = await tkey.reconstructKey();
  log.debug('reconstructed private key=' + privateKey.toString('hex'));
  const polyId = tkey.metadata.getLatestPublicPolynomial().polynomialId;
  log.debug('polyId=' + polyId);
  const shareStoreMap = tkey.shares[polyId];
  const indexes = tkey.metadata.getShareIndexesForPolynomial(polyId);
  log.debug('polynomial share indexes=');
  for (let i=0; i<indexes.length; i++) { log.debug(indexes[i]); }

  const existing = Object.keys(shareStoreMap);
  log.debug('existing indexes=');
  for (let i=0; i<existing.length; i++) { log.debug(existing[i]); }

  const nonExisting = indexes.find((x) => existing.indexOf(x) < 0);
  let share: ShareStore;
  log.debug('nonExisting=' + nonExisting);
  if (!!nonExisting) {
    share = tkey.outputShareStore(nonExisting, polyId);
    log.debug('share=' + (share.share.share.toString('hex')));
  }
  return {privateKey, share};
}


async function _getTorusShare(postboxKey: string): Promise<ShareStore | null> {
  log.debug("entering _getTorusShare");
  const serviceProvider = getServiceProvider(postboxKey);
  log.debug("after init serviceProvider");
  const tkey = new ThresholdKey({serviceProvider, storageLayer});
  try {
    await tkey.initialize({
      neverInitializeNewKey: true
    });
  } catch (e) {
    if (e instanceof CoreError && e.code === 1000 && e.message.includes('key has not been generated yet')) {
      log.debug('this is new user case');
      return null;
    } else {
      log.debug('tkey torus share retrieval error case');
      throw e;
    }
  }
  const polyId = tkey.metadata.getLatestPublicPolynomial().getPolynomialID();
  const shares = tkey.shares[polyId];
  if (!shares) {
    log.warn('cannot get the shares for polynomial id = ' + polyId);
    return null;
  }
  return shares['1'];
}

async function _deleteTorusShare(postboxKey: string) {
  const serviceProvider = getServiceProvider(postboxKey);
  await storageLayer.setMetadataStream({
    input: [{ message: KEY_NOT_FOUND, dateAdded: Date.now() }],
    privKey: [new BN(postboxKey, 'hex')] ,
    serviceProvider: serviceProvider,
  });
}

export function reconstructKeyWithShares(shareJson: string, shareJson2: string) {
  try {
    const share1 = ShareStore.fromJSON(JSON.parse(shareJson));
    const share2 = ShareStore.fromJSON(JSON.parse(shareJson2));
    const privKey = _reconstructKeyWithShares(share1, share2);
    _sendMessageToNative("privateKeyReconstructed", privKey.toString('hex'));
  } catch (err) {
    _sendMessageToNative('privateKeyReconstructFailed', err.message);
  }
}

export function reconstructKeyWithTorusShare(postboxKey: string, shareJson: string) {
  log.debug('shareJson string = ' + shareJson);
  log.debug('postbox key = ' + postboxKey);
  _reconstructKeyWithTorusShare(postboxKey, ShareStore.fromJSON(JSON.parse(shareJson)))
    .then(({privateKey, share}) => {
      _sendMessageToNative("privateKeyReconstructedWithShares", {privateKey: privateKey.toString('hex').padStart(64, '0'), share: JSON.stringify(share.toJSON())} );
    })
    .catch((err) => {
      log.error(err.message);
      _sendMessageToNative('privateKeyReconstructFailed', err.message);
    });
}

export function interfaceTest(arg: string) {
  _sendMessageToNative('interfaceTestCallback', arg);
}

export function interfaceTest2() {
  _sendMessageToNative('interfaceTestCallback');
}


export function getTorusShare(postboxKey: string) {
  _getTorusShare(postboxKey)
    .then((ts) => {
      if (!ts) {
        _sendMessageToNative('noTorusShareRetrieved');
      } else {
        _sendMessageToNative('torusShareRetrieved', JSON.stringify(ts.toJSON()));
      }
    })
    .catch((err) => {
      log.error('getTorusShare failed');
      log.error(JSON.stringify(err));
      _sendMessageToNative('torusShareRetrieveFailed', err.message);
    });
}

export function deleteTorusShare(postboxKey: string) {
  _deleteTorusShare(postboxKey)
    .then(() => {
      _sendMessageToNative('torusShareDeleted');
    })
    .catch((err) => {
      log.error('deleteTorusShare failed');
      log.error(JSON.stringify(err));
      _sendMessageToNative('torusShareDeleteFailed', err.message);
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
window.reconstructKeyWithShares = reconstructKeyWithShares;

// @ts-ignore
window.getTorusShare = getTorusShare;

if (isDebug) {
  // @ts-ignore
  window.interfaceTest = interfaceTest;

// @ts-ignore
  window.interfaceTest2 = interfaceTest2;

// @ts-ignore
  window.deleteTorusShare = deleteTorusShare;
}