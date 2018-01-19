const bitcoin = require('../bitcoin');
const common = require('../common');
const Wallet = require('./wallet');
const Promise = require('bluebird');
const co = Promise.coroutine;
const _ = require('lodash');
const RmgCoin = require('./coins/rmg');
const WalletV1 = require('../wallet');

const Wallets = function(bitgo, baseCoin) {
  this.bitgo = bitgo;
  this.baseCoin = baseCoin;
  this.coinWallet = Wallet;
};

Wallets.prototype.createWalletInstance = function() {
  return new this.coinWallet(this.bitgo, this.coin);
};

/**
 * Get a wallet by ID (proxy for getWallet)
 * @param params
 * @param callback
 */
Wallets.prototype.get = function(params, callback) {
  return this.getWallet(params, callback);
};

/**
 * List a user's wallets
 * @param params
 * @param callback
 * @returns {*}
 */
Wallets.prototype.list = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  const queryObject = {};

  if (params.skip && params.prevId) {
    throw new Error('cannot specify both skip and prevId');
  }

  if (params.getbalances) {
    if (!_.isBoolean(params.getbalances)) {
      throw new Error('invalid getbalances argument, expecting boolean');
    }
    queryObject.getbalances = params.getbalances;
  }
  if (params.prevId) {
    if (!_.isString(params.prevId)) {
      throw new Error('invalid prevId argument, expecting string');
    }
    queryObject.prevId = params.prevId;
  }
  if (params.limit) {
    if (!_.isNumber(params.limit)) {
      throw new Error('invalid limit argument, expecting number');
    }
    queryObject.limit = params.limit;
  }

  if (params.allTokens) {
    if (!_.isBoolean(params.allTokens)) {
      throw new Error('invalid allTokens argument, expecting boolean');
    }
    queryObject.allTokens = params.allTokens;
  }

  if (params.fetchV1 && !_.isBoolean(params.fetchV1)) {
    throw new Error(`fetchV1 must be a boolean, got ${params.fetchV1} (type ${typeof params.fetchV1})`);
  }

  if (params.fetchV1) {
    return this.internalListMerged(params, callback);
  }

  const self = this;
  return this.bitgo.get(this.baseCoin.url('/wallet'))
  .query(queryObject)
  .result()
  .then(function(body) {
    body.wallets = body.wallets.map(function(w) {
      return new self.coinWallet(self.bitgo, self.baseCoin, w);
    });
    return body;
  })
  .nodeify(callback);
};



/**
 * INTERNAL FUNCTION ONLY - DO NOT USE
 * WILL BE DEPRECATED AFTER V2 MIGRATION
 *
 * List a user's wallets across both V1 and V2 - BTC only
 * Will not return fully usable wallet objects since V1 and V2 wallets are different models.
 * Should only be used to display a merged list of wallets - pagination is enabled with limit and prevId
 * @param {Object] params
 * @param {Boolean} params.getbalances - whether to add balances to the wallet info
 * @param {Number} params.prevIdVersion - the version to start looking within. In pagination scenarios, response
 *  will give nextBatchVersion - this should be passed into prevIdVersion (even if there is no prevId, for instance
 *  when we need to start looking from the beginning of V1)
 * @param {String} params.prevId - the last ID in the last result (used for pagination, gives starting point)
 * @param {Number} params.limit - the number of wallets to fetch
 * @param callback
 * @returns {*}
 */
Wallets.prototype.internalListMerged = function(params, callback) {
  return co(function *() {
    params = params || {};
    common.validateParams(params, [], [], callback);

    if (this.baseCoin.getFamily() !== 'btc') {
      throw new Error('Can only get merged wallets list for btc');
    }

    const queryObject = {};

    if (params.skip) {
      throw new Error('skip not supported for merged wallets list');
    }

    if (params.prevIdVersion) {
      if (!_.isNumber(params.prevIdVersion)) {
        throw new Error(`prevIdVersion must be a number, got ${params.prevIdVersion} (type ${typeof params.prevIdVersion})`);
      }

      if (params.prevIdVersion !== 1 && params.prevIdVersion !== 2) {
        throw new Error('prevIdVersion can only be 1 or 2');
      }
    }

    if (params.getbalances) {
      if (!_.isBoolean(params.getbalances)) {
        throw new Error('invalid getbalances argument, expecting boolean');
      }
      queryObject.getbalances = params.getbalances;
    }

    if (params.prevId) {
      if (!_.isString(params.prevId)) {
        throw new Error('invalid prevId argument, expecting string');
      }

      queryObject.prevId = params.prevId;
    }

    if (params.limit) {
      if (!_.isNumber(params.limit)) {
        throw new Error('invalid limit argument, expecting number');
      }
      queryObject.limit = params.limit;
    }

    const result = { wallets: [] };

    if (!params.prevIdVersion || params.prevIdVersion === 2) {
      // We have a prevId in version 2 (or no prevId), so query v2 API
      const body = yield this.bitgo.get(this.baseCoin.url('/wallet')).query(queryObject).result();
      body.wallets = body.wallets.map((w) => new this.coinWallet(this.bitgo, this.baseCoin, w));
      result.wallets = result.wallets.concat(body.wallets);

      // Check v2 results against limit
      if (queryObject.limit) {

        // If we fulfilled limit, check if next batch will be V1 or V2
        if (body.wallets.length === queryObject.limit) {
          if (body.nextBatchPrevId) {
            // We got a nextBatchPrevId, so there are more v2 wallets - just mark the version and return body
            result.nextBatchPrevId = body.nextBatchPrevId;
            result.nextBatchVersion = 2;
            return result;
          }

          // v2 wallets fulfilled the limit, so check if there are any v1, and if so, mark nextBatchVersion as 1
          // In this case, there will only be nextBatchVersion - NOT nextBatchPrevId
          queryObject.limit = 1;
          const v1Body = yield this.bitgo.get(this.bitgo.url('/wallet')).query(queryObject).result();

          // There are more wallets in v1, so flag there's a next batch in v1
          if (v1Body.wallets.length > 0) {
            result.nextBatchVersion = 1;
          }

          return result;
        }

        // If we haven't fulfilled limit and we're done with V2, fetch V1 wallets
        const remainingLimit = queryObject.limit - body.wallets.length;
        queryObject.limit = remainingLimit;
      }

      delete queryObject.prevId;
    }


    const v1Body = yield this.bitgo.get(this.bitgo.url('/wallet')).query(queryObject).result();
    v1Body.wallets = v1Body.wallets.map((w) => new WalletV1(this.bitgo, w));

    // Concatenate both lists, so V2 comes first
    result.wallets = result.wallets.concat(v1Body.wallets);

    if (v1Body.nextBatchPrevId) {
      result.nextBatchPrevId = v1Body.nextBatchPrevId;
      result.nextBatchVersion = 1;
    }

    return result;
  }).call(this).asCallback(callback);
}

/**
* add
* Add a new wallet (advanced mode).
* This allows you to manually submit the keys, type, m and n of the wallet
* Parameters include:
*    "label": label of the wallet to be shown in UI
*    "m": number of keys required to unlock wallet (2)
*    "n": number of keys available on the wallet (3)
*    "keys": array of keychain ids
*/
Wallets.prototype.add = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], ['label', 'enterprise'], callback);

  if (Array.isArray(params.keys) === false || !_.isNumber(params.m) ||
    !_.isNumber(params.n)) {
    throw new Error('invalid argument');
  }

  if (params.tags && Array.isArray(params.tags) === false) {
    throw new Error('invalid argument for tags - array expected');
  }

  if (params.clientFlags && Array.isArray(params.clientFlags) === false) {
    throw new Error('invalid argument for clientFlags - array expected');
  }

  if (params.isCold && !_.isBoolean(params.isCold)) {
    throw new Error('invalid argument for isCold - boolean expected');
  }

  // TODO: support more types of multisig
  if (params.m !== 2 || params.n !== 3) {
    throw new Error('unsupported multi-sig type');
  }

  const self = this;
  const walletParams = {
    label: params.label,
    m: params.m,
    n: params.n,
    keys: params.keys
  };

  // TODO: replace all IFs with single pick line
  if (params.enterprise) {
    walletParams.enterprise = params.enterprise;
  }

  if (params.isCold) {
    walletParams.isCold = params.isCold;
  }

  if (params.tags) {
    walletParams.tags = params.tags;
  }

  if (params.clientFlags) {
    walletParams.clientFlags = params.clientFlags;
  }

  // Additional params needed for xrp
  if (params.rootPub) {
    walletParams.rootPub = params.rootPub;
  }

  if (params.initializationTxs) {
    walletParams.initializationTxs = params.initializationTxs;
  }

  if (params.disableTransactionNotifications) {
    walletParams.disableTransactionNotifications = params.disableTransactionNotifications;
  }

  return self.bitgo.post(self.baseCoin.url('/wallet')).send(walletParams).result()
  .then(function(newWallet) {
    return {
      wallet: new self.coinWallet(self.bitgo, self.baseCoin, newWallet)
    };
  })
  .nodeify(callback);
};

/**
 * Generate a new wallet
 * 1. Creates the user keychain locally on the client, and encrypts it with the provided passphrase
 * 2. If no pub was provided, creates the backup keychain locally on the client, and encrypts it with the provided passphrase
 * 3. Uploads the encrypted user and backup keychains to BitGo
 * 4. Creates the BitGo key on the service
 * 5. Creates the wallet on BitGo with the 3 public keys above
 * @param params
 * @param callback
 * @returns {*}
 */
Wallets.prototype.generateWallet = co(function *(params, callback) {
  params = params || {};
  common.validateParams(params, ['label'], ['passphrase', 'userKey', 'backupXpub', 'enterprise', 'passcodeEncryptionCode'], callback);
  const self = this;
  const label = params.label;

  if ((!!params.backupXpub + !!params.backupXpubProvider) > 1) {
    throw new Error('Cannot provide more than one backupXpub or backupXpubProvider flag');
  }

  if (params.disableTransactionNotifications !== undefined && !_.isBoolean(params.disableTransactionNotifications)) {
    throw new Error('Expected disableTransactionNotifications to be a boolean. ');
  }

  if (params.passcodeEncryptionCode && !_.isString(params.passcodeEncryptionCode)) {
    throw new Error('passcodeEncryptionCode must be a string');
  }

  let userKeychain;
  let backupKeychain;
  let bitgoKeychain;
  let derivationPath;

  const passphrase = params.passphrase;
  const canEncrypt = (!!passphrase && typeof passphrase === 'string');
  const isCold = (!canEncrypt || !!params.userKey);

  // Add the user keychain
  const userKeychainPromise = co(function *() {
    let userKeychainParams;
    // User provided user key
    if (params.userKey) {
      userKeychain = { pub: params.userKey };
      userKeychainParams = userKeychain;
      if (params.coldDerivationSeed) {
        // the derivation only makes sense when a key already exists
        const derivation = self.baseCoin.deriveKeyWithSeed({ key: params.userKey, seed: params.coldDerivationSeed });
        derivationPath = derivation.derivationPath;
        userKeychain.pub = derivation.key;
      }
    } else {
      if (!canEncrypt) {
        throw new Error('cannot generate user keypair without passphrase');
      }
      // Create the user and backup key.
      userKeychain = self.baseCoin.keychains().create();
      userKeychain.encryptedPrv = self.bitgo.encrypt({ password: passphrase, input: userKeychain.prv });
      userKeychainParams = {
        pub: userKeychain.pub,
        encryptedPrv: userKeychain.encryptedPrv,
        originalPasscodeEncryptionCode: params.passcodeEncryptionCode
      };
    }

    const newUserKeychain = yield self.baseCoin.keychains().add(userKeychainParams);
    userKeychain = _.extend({}, newUserKeychain, userKeychain);
  })();

  const backupKeychainPromise = Promise.try(function() {
    if (params.backupXpubProvider || self.baseCoin instanceof RmgCoin) {
      // If requested, use a KRS or backup key provider
      return self.baseCoin.keychains().createBackup({
        provider: params.backupXpubProvider || 'defaultRMGBackupProvider',
        disableKRSEmail: params.disableKRSEmail,
        type: null
      });
    }

    // User provided backup xpub
    if (params.backupXpub) {
      // user provided backup ethereum address
      backupKeychain = { pub: params.backupXpub, source: 'backup' };
    } else {
      if (!canEncrypt) {
        throw new Error('cannot generate backup keypair without passphrase');
      }
      // No provided backup xpub or address, so default to creating one here
      return self.baseCoin.keychains().createBackup();
    }

    return self.baseCoin.keychains().add(backupKeychain);
  })
  .then(function(newBackupKeychain) {
    backupKeychain = _.extend({}, newBackupKeychain, backupKeychain);
  });

  const bitgoKeychainParams = {
    enterprise: params.enterprise
  };

  const bitgoKeychainPromise = self.baseCoin.keychains().createBitGo(bitgoKeychainParams)
  .then(function(keychain) {
    bitgoKeychain = keychain;
  });

  // Add the user keychain
  yield Promise.all([userKeychainPromise, backupKeychainPromise, bitgoKeychainPromise]);
  let walletParams = {
    label: label,
    m: 2,
    n: 3,
    keys: [
      userKeychain.id,
      backupKeychain.id,
      bitgoKeychain.id
    ],
    isCold: isCold
  };

  if (params.enterprise) {
    walletParams.enterprise = params.enterprise;
  }

  if (params.disableTransactionNotifications) {
    walletParams.disableTransactionNotifications = params.disableTransactionNotifications;
  }

  if (self.baseCoin.getFamily() === 'xrp' && params.rootPrivateKey) {
    walletParams.rootPrivateKey = params.rootPrivateKey;
  }

  const keychains = {
    userKeychain,
    backupKeychain,
    bitgoKeychain
  };
  walletParams = yield self.baseCoin.supplementGenerateWallet(walletParams, keychains);
  const newWallet = yield self.bitgo.post(self.baseCoin.url('/wallet')).send(walletParams).result();
  const result = {
    wallet: new self.coinWallet(self.bitgo, self.baseCoin, newWallet),
    userKeychain: userKeychain,
    backupKeychain: backupKeychain,
    bitgoKeychain: bitgoKeychain
  };

  if (backupKeychain.prv) {
    result.warning = 'Be sure to backup the backup keychain -- it is not stored anywhere else!';
  }

  if (derivationPath) {
    userKeychain.derivationPath = derivationPath;
  }

  return Promise.resolve(result).asCallback(callback);
});

//
// listShares
// List the user's wallet shares
//
Wallets.prototype.listShares = function(params, callback) {
  params = params || {};
  common.validateParams(params, [], [], callback);

  return this.bitgo.get(this.baseCoin.url('/walletshare'))
  .result()
  .nodeify(callback);
};

//
// getShare
// Gets a wallet share information, including the encrypted sharing keychain. requires unlock if keychain is present.
// Params:
//    walletShareId - the wallet share to get information on
//
Wallets.prototype.getShare = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['walletShareId'], [], callback);

  return this.bitgo.get(this.baseCoin.url('/walletshare/' + params.walletShareId))
  .result()
  .nodeify(callback);
};

//
// updateShare
// updates a wallet share
// Params:
//    walletShareId - the wallet share to update
//    state - the new state of the wallet share
//
Wallets.prototype.updateShare = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['walletShareId'], [], callback);

  return this.bitgo.post(this.baseCoin.url('/walletshare/' + params.walletShareId))
  .send(params)
  .result()
  .nodeify(callback);
};

//
// resendShareInvite
// Resends a wallet share invitation email
// Params:
//    walletShareId - the wallet share whose invitiation should be resent
//
Wallets.prototype.resendShareInvite = function(params, callback) {
  return co(function *() {
    params = params || {};
    common.validateParams(params, ['walletShareId'], [], callback);

    const urlParts = params.walletShareId + '/resendemail';
    return this.bitgo.post(this.baseCoin.url('/walletshare/' + urlParts))
    .result();
  }).call(this).asCallback(callback);
};

//
// cancelShare
// cancels a wallet share
// Params:
//    walletShareId - the wallet share to update
//
Wallets.prototype.cancelShare = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['walletShareId'], [], callback);

  return this.bitgo.del(this.baseCoin.url('/walletshare/' + params.walletShareId))
  .send()
  .result()
  .nodeify(callback);
};

//
// acceptShare
// Accepts a wallet share, adding the wallet to the user's list
// Needs a user's password to decrypt the shared key
// Params:
//    walletShareId - the wallet share to accept
//    userPassword - (required if more a keychain was shared) user's password to decrypt the shared wallet
//    newWalletPassphrase - new wallet passphrase for saving the shared wallet prv.
//                          If left blank and a wallet with more than view permissions was shared, then the userpassword is used.
//    overrideEncryptedPrv - set only if the prv was received out-of-band.
//
Wallets.prototype.acceptShare = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['walletShareId'], ['overrideEncryptedPrv', 'userPassword', 'newWalletPassphrase'], callback);

  const self = this;
  let encryptedPrv = params.overrideEncryptedPrv;

  return this.getShare({ walletShareId: params.walletShareId })
  .then(function(walletShare) {
    // Return right away if there is no keychain to decrypt, or if explicit encryptedPrv was provided
    if (!walletShare.keychain || !walletShare.keychain.encryptedPrv || encryptedPrv) {
      return walletShare;
    }

    // More than viewing was requested, so we need to process the wallet keys using the shared ecdh scheme
    if (!params.userPassword) {
      throw new Error('userPassword param must be provided to decrypt shared key');
    }

    return self.bitgo.getECDHSharingKeychain()
    .then(function(sharingKeychain) {
      if (!sharingKeychain.encryptedXprv) {
        throw new Error('encryptedXprv was not found on sharing keychain');
      }

      // Now we have the sharing keychain, we can work out the secret used for sharing the wallet with us
      sharingKeychain.prv = self.bitgo.decrypt({ password: params.userPassword, input: sharingKeychain.encryptedXprv });
      const rootExtKey = bitcoin.HDNode.fromBase58(sharingKeychain.prv);

      // Derive key by path (which is used between these 2 users only)
      const privKey = bitcoin.hdPath(rootExtKey).deriveKey(walletShare.keychain.path);
      const secret = self.bitgo.getECDHSecret({ eckey: privKey, otherPubKeyHex: walletShare.keychain.fromPubKey });

      // Yes! We got the secret successfully here, now decrypt the shared wallet prv
      const decryptedSharedWalletPrv = self.bitgo.decrypt({ password: secret, input: walletShare.keychain.encryptedPrv });

      // We will now re-encrypt the wallet with our own password
      const newWalletPassphrase = params.newWalletPassphrase || params.userPassword;
      encryptedPrv = self.bitgo.encrypt({ password: newWalletPassphrase, input: decryptedSharedWalletPrv });

      // Carry on to the next block where we will post the acceptance of the share with the encrypted prv
      return walletShare;
    });
  })
  .then(function() {
    const updateParams = {
      walletShareId: params.walletShareId,
      state: 'accepted'
    };

    if (encryptedPrv) {
      updateParams.encryptedPrv = encryptedPrv;
    }

    return self.updateShare(updateParams);
  })
  .nodeify(callback);
};

/**
 * Get a wallet by its ID
 * @param params
 * @param callback
 * @returns {*}
 */
Wallets.prototype.getWallet = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['id'], [], callback);

  const self = this;

  const query = {};

  if (params.allTokens) {
    if (!_.isBoolean(params.allTokens)) {
      throw new Error('invalid allTokens argument, expecting boolean');
    }
    query.allTokens = params.allTokens;
  }

  return this.bitgo.get(this.baseCoin.url('/wallet/' + params.id))
  .query(query)
  .result()
  .then(function(wallet) {
    return new self.coinWallet(self.bitgo, self.baseCoin, wallet);
  })
  .nodeify(callback);
};

/**
 * Get a wallet by its address
 * @param params
 * @param callback
 * @returns {*}
 */
Wallets.prototype.getWalletByAddress = function(params, callback) {
  params = params || {};
  common.validateParams(params, ['address'], [], callback);

  const self = this;

  return this.bitgo.get(this.baseCoin.url('/wallet/address/' + params.address))
  .result()
  .then(function(wallet) {
    return new self.coinWallet(self.bitgo, self.baseCoin, wallet);
  })
  .nodeify(callback);
};

module.exports = Wallets;
