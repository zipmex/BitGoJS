const BaseCoin = require('../baseCoin');
const Wallet = require('../wallet');
const common = require('../../common');
const config = require('../../config');
const BigNumber = require('bignumber.js');
const Util = require('../../util');
const _ = require('lodash');
const Promise = require('bluebird');
const request = require('superagent');
const crypto = require('crypto');
const prova = require('prova-lib');
const co = Promise.coroutine;

class Ofc extends BaseCoin {

  /**
   * Returns the factor between the base unit and its smallest subdivison
   * @return {number}
   */
  getBaseFactor() {
    // 10^18
    return '100';
  }

  getChain() {
    return 'ofc';
  }

  getFamily() {
    return 'ofc';
  }

  getFullName() {
    return 'US Dollar';
  }

  /**
   * Flag for sending value of 0
   * @returns {boolean} True if okay to send 0 value, false otherwise
   */
  valuelessTransferAllowed() {
    return true;
  }

  /**
   * Flag for sending data along with transactions
   * @returns {boolean} True if okay to send tx data (ETH), false otherwise
   */
  transactionDataAllowed() {
    return true;
  }

  /**
   * Evaluates whether an address string is valid for this coin
   * @param address
   */
  isValidAddress(address) {
    return true;
  }

  /**
   * Return boolean indicating whether input is valid public key for the coin.
   *
   * @param {String} pub the pub to be checked
   * @returns {Boolean} is it valid?
   */
  isValidPub(pub) {
    try {
      prova.HDNode.fromBase58(pub);
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = Ofc;
