/**
 * @prettier
 */
import * as Bluebird from 'bluebird';
import { CoinFamily, BaseCoin as StaticsBaseCoin } from '@bitgo/statics';
const co = Bluebird.coroutine;
import * as bitgoAccountLib from '@bitgo/account-lib';

import {
  BaseCoin,
  KeyPair,
  ParsedTransaction,
  ParseTransactionOptions,
  SignedTransaction,
  SignTransactionOptions,
  VerifyAddressOptions,
  VerifyTransactionOptions,
  TransactionFee,
  TransactionRecipient as Recipient,
  TransactionPrebuild as BaseTransactionPrebuild,
  TransactionExplanation,
} from '../baseCoin';

import { BitGo } from '../../bitgo';
import { NodeCallback } from '../types';
import BigNumber from 'bignumber.js';
import { MethodNotImplementedError } from '../../errors';

export interface XtzSignTransactionOptions extends SignTransactionOptions {
  txPrebuild: TransactionPrebuild;
  prv: string;
}

export interface TxInfo {
  recipients: Recipient[];
  from: string;
  txid: string;
}

export interface TransactionPrebuild extends BaseTransactionPrebuild {
  txHex: string;
  txInfo: TxInfo;
  feeInfo: XtzTransactionFee;
  source: string;
  dataToSign: string;
}

export interface XtzTransactionFee {
  fee: string;
  gasLimit?: string;
  storageLimit?: string;
}

export interface ExplainTransactionOptions {
  txHex?: string;
  halfSigned?: {
    txHex: string;
  };
  feeInfo: TransactionFee;
}

export class Xtz extends BaseCoin {
  protected readonly _staticsCoin: Readonly<StaticsBaseCoin>;

  constructor(bitgo: BitGo, staticsCoin?: Readonly<StaticsBaseCoin>) {
    super(bitgo);

    if (!staticsCoin) {
      throw new Error('missing required constructor parameter staticsCoin');
    }

    this._staticsCoin = staticsCoin;
  }

  getChain() {
    return this._staticsCoin.name;
  }

  getFamily(): CoinFamily {
    return this._staticsCoin.family;
  }

  getFullName() {
    return this._staticsCoin.fullName;
  }

  getBaseFactor() {
    return Math.pow(10, this._staticsCoin.decimalPlaces);
  }

  static createInstance(bitgo: BitGo, staticsCoin?: Readonly<StaticsBaseCoin>): BaseCoin {
    return new Xtz(bitgo, staticsCoin);
  }

  /**
   * Flag for sending value of 0
   * @returns {boolean} True if okay to send 0 value, false otherwise
   */
  valuelessTransferAllowed(): boolean {
    return true;
  }

  /**
   * Checks if this is a valid base58 or hex address
   * @param address
   */
  isValidAddress(address: string): boolean {
    if (!address) {
      return false;
    }
    return bitgoAccountLib.Xtz.Utils.isValidAddress(address);
  }

  /**
   * Generate Tezos key pair
   *
   * @param seed
   * @returns {Object} object with generated pub, prv
   */
  generateKeyPair(seed?: Buffer): KeyPair {
    const keyPair = seed ? new bitgoAccountLib.Xtz.KeyPair({ seed }) : new bitgoAccountLib.Xtz.KeyPair();
    const keys = keyPair.getKeys();
    return {
      pub: keys.pub,
      prv: keys.prv!,
    };
  }

  parseTransaction(
    params: ParseTransactionOptions,
    callback?: NodeCallback<ParsedTransaction>
  ): Bluebird<ParsedTransaction> {
    return Bluebird.resolve({}).asCallback(callback);
  }

  verifyAddress(params: VerifyAddressOptions): boolean {
    return true;
  }

  verifyTransaction(params: VerifyTransactionOptions, callback?: NodeCallback<boolean>): Bluebird<boolean> {
    return Bluebird.resolve(true).asCallback(callback);
  }

  /**
   * Assemble keychain and half-sign prebuilt transaction
   *
   * @param params
   * @param params.txPrebuild {Object} prebuild object returned by platform
   * @param params.prv {String} user prv
   * @param params.wallet.addressVersion {String} this is the version of the Algorand multisig address generation format
   * @param callback
   * @returns Bluebird<SignedTransaction>
   */
  signTransaction(
    params: XtzSignTransactionOptions,
    callback?: NodeCallback<SignedTransaction>
  ): Bluebird<SignedTransaction> {
    const self = this;
    return co<SignedTransaction>(function*() {
      const txBuilder: any = bitgoAccountLib.getBuilder(self.getChain());
      txBuilder.from(params.txPrebuild.txHex);
      txBuilder.source(params.txPrebuild.source);
      if (params.txPrebuild.dataToSign) {
        txBuilder.overrideDataToSign({ dataToSign: params.txPrebuild.dataToSign });
      }
      txBuilder.sign({ key: params.prv });

      const transaction: any = yield txBuilder.build();
      if (!transaction) {
        throw new Error('Invalid messaged passed to signMessage');
      }
      const response = {
        txHex: transaction.toBroadcastFormat(),
      };
      return transaction.signature.length >= 2 ? response : { halfSigned: response };
    })
      .call(this)
      .asCallback(callback);
  }

  /**
   * Sign message with private key
   *
   * @param key
   * @param message
   */
  signMessage(key: KeyPair, message: string | Buffer, callback?: NodeCallback<Buffer>): Bluebird<Buffer> {
    return co<Buffer>(function* cosignMessage() {
      const keyPair = new bitgoAccountLib.Xtz.KeyPair({ prv: key.prv });
      const signatureData = yield bitgoAccountLib.Xtz.Utils.sign(keyPair, message as string);
      return signatureData.sig;
    })
      .call(this)
      .asCallback(callback);
  }

  /**
   * Builds a funds recovery transaction without BitGo.
   * We need to do three queries during this:
   * 1) Node query - how much money is in the account
   * 2) Build transaction - build our transaction for the amount
   * 3) Send signed build - send our signed build to a public node
   * @param params
   * @param callback
   */
  recover(params: any, callback?: NodeCallback<any>): Bluebird<any> {
    throw new MethodNotImplementedError();
  }

  /**
   * Explain a Tezos transaction from txHex
   * @param params
   * @param callback
   */
  explainTransaction(
    params: ExplainTransactionOptions,
    callback?: NodeCallback<TransactionExplanation>
  ): Bluebird<TransactionExplanation> {
    const self = this;
    return co<TransactionExplanation>(function*() {
      const txHex = params.txHex || (params.halfSigned && params.halfSigned.txHex);
      if (!txHex || !params.feeInfo) {
        throw new Error('missing explain tx parameters');
      }
      const txBuilder = bitgoAccountLib.getBuilder(self.getChain());
      txBuilder.from(txHex);
      const tx: any = yield txBuilder.build();

      const displayOrder = ['id', 'outputAmount', 'changeAmount', 'outputs', 'changeOutputs', 'fee'];

      return {
        displayOrder,
        id: tx.id,
        outputs: tx.outputs,
        outputAmount: tx.outputs
          .reduce((accumulator, output) => accumulator.plus(output.value), new BigNumber('0'))
          .toFixed(0),
        changeOutputs: [], // account based does not use change outputs
        changeAmount: '0', // account base does not make change
        fee: params.feeInfo,
      };
    })
      .call(this)
      .asCallback(callback);
  }

  isValidPub(pub: string): boolean {
    return bitgoAccountLib.Xtz.Utils.isValidPublicKey(pub);
  }
}