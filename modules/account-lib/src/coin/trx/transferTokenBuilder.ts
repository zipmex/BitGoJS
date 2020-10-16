import { BaseCoin as CoinConfig } from '@bitgo/statics/';
import BigNumber from 'bignumber.js';
import { TransactionType } from '../baseCoin';
import { BuildTransactionError } from '../baseCoin/errors';
import { protocol } from '../../../resources/trx/protobuf/tron';
import { TransactionBuilder } from './transactionBuilder';
import { Address } from './address';
import { Transaction } from './transaction';
import { TokenValueFields, TransactionReceipt, TransferAssetContract } from './iface';
import {
  decodeTransaction,
  getBase58AddressFromHex,
  getByteArrayFromHexAddress,
  getHexAddressFromBase58Address,
} from './utils';
import ContractType = protocol.Transaction.Contract.ContractType;
import { createHash } from 'crypto';

export class TransferTokenBuilder extends TransactionBuilder {
  private _toAddress: string;
  private _amount: string;
  private _ownerAddress: string;
  private _assetName: string;

  constructor(_coinConfig: Readonly<CoinConfig>) {
    super(_coinConfig);
  }

  /** @inheritdoc */
  protected async buildImplementation(): Promise<Transaction> {
    this.createTransaction();
    return super.buildImplementation();
  }

  /** @inheritdoc */
  initBuilder(tx: Transaction): this {
    super.initBuilder(tx);
    this.transaction.setTransactionType(TransactionType.Send);
    const raw_data = tx.toJson().raw_data;
    const transferAssetContract = raw_data.contract[0] as TransferAssetContract;
    this.initTransfers(transferAssetContract);
    return this;
  }

  /**
   * Initialize the transfer specific data, getting the recipient account
   * represented by the element with a positive amount on the transfer element.
   * The negative amount represents the source account so it's ignored.
   *
   * @param {ValueFields} transfer object with transfer data
   */
  protected initTransfers(transfer: TransferAssetContract): void {
    const { amount, owner_address, to_address, asset_name } = transfer.parameter.value as TokenValueFields;
    if (amount) {
      this.amount(amount.toFixed());
    }
    if (to_address) {
      this.to({ address: getBase58AddressFromHex(to_address) });
    }
    if (owner_address) {
      this.source({ address: getBase58AddressFromHex(owner_address) });
    }
    if (asset_name) {
      this.coin(asset_name);
    }
  }

  /** @inheritdoc */
  validateMandatoryFields() {
    super.validateMandatoryFields();
    if (!this._ownerAddress) {
      throw new BuildTransactionError('Missing parameter: source');
    }
    if (!this._toAddress) {
      throw new BuildTransactionError('Missing parameter: to');
    }
    if (!this._amount) {
      throw new BuildTransactionError('Missing parameter: amount');
    }
    if (!this._assetName) {
      throw new BuildTransactionError('Missing parameter: coin');
    }
  }

  //region Transfer fields
  /**
   * Set the source address,
   *
   * @param {Address} address source account
   * @returns {TransferBuilder} the builder with the new parameter set
   */
  source(address: Address): this {
    this.validateAddress(address);
    this._ownerAddress = getHexAddressFromBase58Address(address.address);
    return this;
  }

  /**
   * Set the destination address where the funds will be sent,
   *
   * @param {Address} address the address to transfer funds to
   * @returns {TransferBuilder} the builder with the new parameter set
   */
  to(address: Address): this {
    this.validateAddress(address);
    this._toAddress = getHexAddressFromBase58Address(address.address);
    return this;
  }

  /**
   * Set the amount to be transferred
   *
   * @param {string} amount amount to transfer in sun, 1 TRX = 1000000 sun
   * @returns {TransferBuilder} the builder with the new parameter set
   */
  amount(amount: string): this {
    const BNamount = new BigNumber(amount);
    this.validateValue(BNamount);
    this._amount = BNamount.toFixed();
    return this;
  }

  coin(coin: string): this {
    // "trx:wbtc"
    // "trx:weth"
    // this.validateString(coin); TODO : validate token name
    this._assetName = getHexAddressFromBase58Address(coin);
    return this;
  }

  //endregion

  private createTransaction(): void {
    const rawDataHex = this.getRawDataHex();
    const rawData = decodeTransaction(rawDataHex);
    const contract = rawData.contract[0] as TransferAssetContract;
    const tokenValueFields = contract.parameter.value as TokenValueFields;

    tokenValueFields.to_address = this._toAddress.toLocaleLowerCase();
    tokenValueFields.owner_address = this._ownerAddress.toLocaleLowerCase();
    tokenValueFields.asset_name = this._assetName.toLocaleLowerCase();

    contract.parameter.type_url = 'type.googleapis.com/protocol.TransferAssetContract';
    contract.type = 'TransferAssetContract';

    const hexBuffer = Buffer.from(rawDataHex, 'hex');
    const id = createHash('sha256')
      .update(hexBuffer)
      .digest('hex');
    const txRecip: TransactionReceipt = {
      raw_data: rawData,
      raw_data_hex: rawDataHex,
      txID: id,
      signature: this.transaction.signature,
    };
    this.transaction = new Transaction(this._coinConfig, txRecip);
  }

  private getRawDataHex(): string {
    const rawContract = {
      ownerAddress: getByteArrayFromHexAddress(this._ownerAddress),
      toAddress: getByteArrayFromHexAddress(this._toAddress),
      amount: new BigNumber(this._amount).toNumber(),
      assetName: getByteArrayFromHexAddress(this._assetName),
    };
    const transferAssetContract = protocol.TransferAssetContract.fromObject(rawContract);
    const contractBytes = protocol.TransferAssetContract.encode(transferAssetContract).finish();
    const txContract = {
      type: ContractType.TransferAssetContract,
      parameter: {
        value: contractBytes,
        type_url: 'type.googleapis.com/protocol.TransferAssetContract',
      },
    };
    const raw = {
      refBlockBytes: Buffer.from(this._refBlockBytes, 'hex'),
      refBlockHash: Buffer.from(this._refBlockHash, 'hex'),
      expiration: this._expiration,
      timestamp: this._timestamp,
      contract: [txContract],
    };
    const rawTx = protocol.Transaction.raw.create(raw);
    return Buffer.from(protocol.Transaction.raw.encode(rawTx).finish()).toString('hex');
  }
}
