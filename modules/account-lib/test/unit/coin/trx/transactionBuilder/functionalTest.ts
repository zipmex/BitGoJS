import TronWeb from 'tronweb';
import {
  FirstExpectedKeyAddress,
  FirstPrivateKey,
  FirstSigOnBuildTransaction,
  SecondExpectedKeyAddress,
  SecondPrivateKey,
  SecondSigOnBuildTransaction,
  UnsignedBuildTransaction,
} from '../../../../resources/trx';
import { register } from '../../../../../src';
import { TransactionBuilderFactory } from '../../../../../src/coin/trx';
import { protocol } from '../../../../../resources/trx/protobuf/tron';

describe('create a raw transaction and then sign it throught account-lib', () => {
  const privateKeyFrom = FirstPrivateKey;
  const privateKeyTo = SecondPrivateKey;
  const fromAddress = FirstExpectedKeyAddress;
  const toAddress = SecondExpectedKeyAddress; // address _to
  const amount = '10223'; // amount

  const tronWeb = new TronWeb({ fullHost: 'https://api.shasta.trongrid.io', privateKey: privateKeyFrom });
  const factory = register('ttrx', TransactionBuilderFactory);

  it('should create a raw tx, sign it and broadcast it to the network', async () => {
    const block = await tronWeb.trx.getBlock('latest');
    const txBuilder = factory.getTransferBuilder();
    txBuilder
      .amount('131')
      .source({ address: fromAddress })
      .to({ address: toAddress })
      .block({ hash: block.blockID, number: block.block_header.raw_data.number })
      .expiration(Date.now() + 10000000);

    txBuilder.sign({ key: privateKeyFrom });
    txBuilder.sign({ key: privateKeyTo });

    const tx = await txBuilder.build();
    const toJson = tx.toJson();

    const result = await tronWeb.trx.sendRawTransaction(toJson).catch(err => console.error(err));
    console.log(result);
  });

  it('should create a tx from a raw, sign it and broadcast it to the network', async () => {
    const txString =
      '{"visible":false,"txID":"7b3471d917674f27114792adab4c122ebe25b877d5353884fcfb39eea3a66658","raw_data":{"contract":[{"parameter":{"value":{"amount":10223,"owner_address":"41c4530f6bfa902b7398ac773da56106a15af15f92","to_address":"412c2ba4a9ff6c53207dc5b686bfecf75ea7b80577"},"type_url":"type.googleapis.com/protocol.TransferContract"},"type":"TransferContract"}],"ref_block_bytes":"9b79","ref_block_hash":"90068d230cb5de99","expiration":1602602031000,"timestamp":1602601973472},"raw_data_hex":"0a029b79220890068d230cb5de994098af9994d22e5a66080112620a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412310a1541c4530f6bfa902b7398ac773da56106a15af15f921215412c2ba4a9ff6c53207dc5b686bfecf75ea7b8057718ef4f70e0ed9594d22e"}';
    const txBuilder = factory.from(txString);
    txBuilder.extendValidTo(10000000);

    txBuilder.sign({ key: privateKeyFrom });
    txBuilder.sign({ key: privateKeyTo });

    const tx = await txBuilder.build();
    const toJson = tx.toJson();
    // toJson.visible = false;
    const raw = protocol.Transaction.raw.decode(Buffer.from(toJson.raw_data_hex, 'hex'));
    const transaction = new protocol.Transaction();
    transaction.rawData = raw;
    transaction.signature = tx.signature.map(s => Buffer.from(s, 'hex'));
    // message.raw_data.contract[0].parameter.type_url = 'type.googleapis.com/protocol.TransferContract';
    // message.raw_data.contract[0].type = 'TransferContract';

    const result = await tronWeb.trx.sendRawTransaction(toJson).catch(err => console.error(err));
    console.log(result);
  });
});
