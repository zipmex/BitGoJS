import { BaseCoin as CoinConfig } from '@bitgo/statics/dist/src/base';
import { BaseTransactionBuilderFactory } from '../baseCoin';
import { InvalidTransactionError, ParseTransactionError } from '../baseCoin/errors';
import { Transaction } from './transaction';
import { TransactionBuilder } from './transactionBuilder';
import { TransferBuilder } from './transferBuilder';
import { decodeTransaction, isValidRawTransactionFormat } from './utils';
import { ContractType } from './enum';
import { RawData } from './iface';

export class TransactionBuilderFactory extends BaseTransactionBuilderFactory {
  /**
   * Constructor
   *
   * @param  {CoinConfig} _coinConfig - coin configuration data
   */
  constructor(_coinConfig: Readonly<CoinConfig>) {
    super(_coinConfig);
  }

  /** @inheritdoc */
  getTransferBuilder(tx?: Transaction): TransferBuilder {
    return this.initializeBuilder(tx, new TransferBuilder(this._coinConfig));
  }

  /** @inheritdoc */
  public getWalletInitializationBuilder() {
    throw new Error('Method not implemented.');
  }

  /** @inheritdoc */
  public from(raw: any): TransactionBuilder {
    this.validateRawTransaction(raw);
    const txReceip = JSON.parse(raw);
    const decodedTx = decodeTransaction(txReceip.raw_data_hex);
    const contractType = decodedTx.contractType;
    switch (contractType) {
      case ContractType.Transfer:
        return this.getTransferBuilder(new Transaction(this._coinConfig, txReceip));
      default:
        throw new InvalidTransactionError('Invalid transaction type: ' + contractType);
    }
  }

  /**
   * Check the raw transaction has a valid format in the blockchain context, throw otherwise.
   *
   * @param {any} rawTransaction - Transaction in any format
   */
  private validateRawTransaction(rawTransaction: any) {
    if (!isValidRawTransactionFormat(rawTransaction)) {
      throw new ParseTransactionError('Invalid raw transaction');
    }
  }

  /**
   * Initialize the builder with the given transaction
   *
   * @param {Transaction | undefined} tx - the transaction used to initialize the builder
   * @param {TransactionBuilder} builder - the builder to be initialized
   * @returns {TransactionBuilder} the builder initialized
   */
  private initializeBuilder<T extends TransactionBuilder>(tx: Transaction | undefined, builder: T): T {
    if (tx) {
      builder.initBuilder(tx);
    }
    return builder;
  }
}
