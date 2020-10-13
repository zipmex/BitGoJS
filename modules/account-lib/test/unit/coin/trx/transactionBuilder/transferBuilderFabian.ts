import should from 'should';
import { TransactionType } from '../../../../../src/coin/baseCoin';
import { register } from '../../../../../src';
import {
  AccountPermissionUpdateContractPriv,
  FirstExpectedKeyAddress,
  FirstPrivateKey,
  FirstSigOnBuildTransaction,
  InvalidIDTransaction,
  SecondExpectedKeyAddress,
  SecondPrivateKey,
  SecondSigOnBuildTransaction,
  UnsignedAccountPermissionUpdateContractTx,
  UnsignedBuildEmptyIDTransaction,
  UnsignedBuildInvalidIDTransaction,
  UnsignedBuildTransaction,
  UnsignedInvalidContractBuildTransaction,
  UnsignedInvalidExpirationBuildTransaction,
  UnsignedInvalidTimeStampBuildTransaction,
} from '../../../../resources/trx';
import { TransactionBuilderFactory } from '../../../../../src/coin/trx';
import * as Crypto from '../../../../../src/utils/crypto';

describe('Send founds builder with new model', function() {
  const factory = register('ttrx', TransactionBuilderFactory);
  const privateKeyFrom = FirstPrivateKey;
  const privateKeyTo = SecondPrivateKey;
  const fromAddress = FirstExpectedKeyAddress;
  const toAddress = SecondExpectedKeyAddress; // address _to

  describe('test TX creation', () => {
    it('should create a send tx', async () => {
      const txBuilder = factory.getTransferBuilder();
      txBuilder
        .amount('1231')
        .source({ address: fromAddress })
        .to({ address: toAddress })
        .block({ hash: '000000000085b7f121624fe808437610a2f9d9a3e458825d330a5d13a7f72d71', number: 8763378 })
        .expiration(new Date().getTime() + 1000000);

      txBuilder.sign({ key: FirstPrivateKey });
      txBuilder.sign({ key: SecondPrivateKey });

      const tx = await txBuilder.build();
    });
  });

  describe('backward compatibility', () => {
    let txBuilder;

    beforeEach(() => {
      txBuilder = factory.getTransferBuilder();
    });

    describe('Transaction builder from method', () => {
      describe('should succeed to parse', () => {
        it('a transfer contract for an unsigned tx', () => {
          const txJson = JSON.stringify(UnsignedBuildTransaction);
          txBuilder.from(txJson);
        });

        it('a transfer contract for a half-signed tx', () => {
          const txJson = JSON.stringify(FirstSigOnBuildTransaction);
          txBuilder.from(txJson);
        });

        it('a transfer contract for a fully signed tx', () => {
          const txJson = JSON.stringify(SecondSigOnBuildTransaction);
          txBuilder.from(txJson);
        });
      });
    });

    describe('Transaction builder sign method', () => {
      describe('should succeed to sign', () => {
        it('an unsigned transaction', () => {
          const txJson = JSON.stringify(UnsignedBuildTransaction);
          txBuilder.from(txJson);
          txBuilder.sign({ key: FirstPrivateKey });
        });

        it('a transaction signed with a different key', () => {
          const txJson = JSON.stringify(FirstSigOnBuildTransaction);
          txBuilder.from(txJson);
          txBuilder.sign({ key: SecondPrivateKey });
        });

        it('a signed transaction with an xprv', async () => {
          txBuilder.from(FirstSigOnBuildTransaction);
          const SecondPrivateKeyXprv = Crypto.rawPrvToExtendedKeys(SecondPrivateKey);
          txBuilder.sign({ key: SecondPrivateKeyXprv.xprv });
          const tx = await txBuilder.build();

          tx.toJson().signature[0].should.equal(
            'bd08e6cd876bb573dd00a32870b58b70ea8b7908f5131686502589941bfa4fdda76b8c81bbbcfc549be6d4988657cea122df7da46c72041def2683d6ecb04a7401',
          );
          tx.toJson().signature[1].should.equal(
            'f3cabe2f4aed13e2342c78c7bf4626ea36cd6509a44418c24866814d3426703686be9ef21bd993324c520565beee820201f2a50a9ac971732410d3eb69cdb2a600',
          );

          tx.id.should.equal('80b8b9eaed51c8bba3b49f7f0e7cc5f21ac99a6f3e2893c663b544bf2c695b1d');
          tx.type.should.equal(TransactionType.Send);
          tx.inputs.length.should.equal(1);
          tx.inputs[0].address.should.equal('TTsGwnTLQ4eryFJpDvJSfuGQxPXRCjXvZz');
          tx.inputs[0].value.should.equal('1718');
          tx.outputs.length.should.equal(1);
          tx.outputs[0].address.should.equal('TNYssiPgaf9XYz3urBUqr861Tfqxvko47B');
          tx.outputs[0].value.should.equal('1718');
          tx.validFrom.should.equal(1571811410819);
          tx.validTo.should.equal(1571811468000);
        });
      });

      describe('should fail to sign', () => {
        it('a transaction with the same key', async () => {
          const txJson = JSON.stringify(FirstSigOnBuildTransaction);
          txBuilder.from(txJson);
          txBuilder.sign({ key: FirstPrivateKey });
          await txBuilder.build().should.be.rejectedWith('Transaction signing did not return an additional signature.');
        });
      });
    });

    describe('Transaction builder', () => {
      it('should build an half signed tx', async () => {
        const txJson = JSON.stringify(UnsignedBuildTransaction);
        txBuilder.from(txJson);
        txBuilder.sign({ key: FirstPrivateKey });
        const tx = await txBuilder.build();

        tx.id.should.equal('80b8b9eaed51c8bba3b49f7f0e7cc5f21ac99a6f3e2893c663b544bf2c695b1d');
        tx.type.should.equal(TransactionType.Send);
        tx.inputs.length.should.equal(1);
        tx.inputs[0].address.should.equal('TTsGwnTLQ4eryFJpDvJSfuGQxPXRCjXvZz');
        tx.inputs[0].value.should.equal('1718');
        tx.outputs.length.should.equal(1);
        tx.outputs[0].address.should.equal('TNYssiPgaf9XYz3urBUqr861Tfqxvko47B');
        tx.outputs[0].value.should.equal('1718');
      });

      it.skip('should build the right JSON after is half signed tx', async () => {
        const txJson = JSON.stringify(UnsignedBuildTransaction);
        txBuilder.from(txJson);
        txBuilder.sign({ key: FirstPrivateKey });
        const tx = await txBuilder.build();
        const signedTxJson = tx.toJson();

        signedTxJson.txID.should.equal(UnsignedBuildTransaction.txID);
        signedTxJson.raw_data_hex.should.equal(UnsignedBuildTransaction.raw_data_hex);
        signedTxJson.signature.length.should.equal(1);
        signedTxJson.signature[0].should.equal(
          'bd08e6cd876bb573dd00a32870b58b70ea8b7908f5131686502589941bfa4fdda76b8c81bbbcfc549be6d4988657cea122df7da46c72041def2683d6ecb04a7401',
        );
        JSON.stringify(signedTxJson.raw_data).should.equal(JSON.stringify(UnsignedBuildTransaction.raw_data));
      });

      it('should not extend a half signed tx', () => {
        const txJson = JSON.stringify(FirstSigOnBuildTransaction);
        txBuilder.from(txJson);

        should.throws(() => txBuilder.extendValidTo(10000));
      });

      it('should extend an unsigned tx', async () => {
        const extendMs = 10000;
        txBuilder.from(JSON.parse(JSON.stringify(UnsignedBuildTransaction)));
        txBuilder.extendValidTo(extendMs);
        const tx = await txBuilder.build();

        tx.id.should.not.equal(UnsignedBuildTransaction.txID);
        tx.id.should.equal('764aa8a72c2c720a6556def77d6092f729b6e14209d8130f1692d5aff13f2503');
        const oldExpiration = UnsignedBuildTransaction.raw_data.expiration;
        tx.validTo.should.equal(oldExpiration + extendMs);
        tx.type.should.equal(TransactionType.Send);
        tx.inputs.length.should.equal(1);
        tx.inputs[0].address.should.equal('TTsGwnTLQ4eryFJpDvJSfuGQxPXRCjXvZz');
        tx.inputs[0].value.should.equal('1718');
        tx.outputs.length.should.equal(1);
        tx.outputs[0].address.should.equal('TNYssiPgaf9XYz3urBUqr861Tfqxvko47B');
        tx.outputs[0].value.should.equal('1718');
        tx.validFrom.should.equal(1571811410819);
      });

      it('should catch an invalid id', async () => {
        const txJson = JSON.stringify(InvalidIDTransaction);
        should.throws(() => txBuilder.from(txJson));
      });

      it('should throw exception of wrong id', () => {
        const txJson = JSON.stringify(UnsignedBuildInvalidIDTransaction);
        should.throws(() => txBuilder.from(txJson));
      });

      it('should throw exception of empty id', () => {
        const txJson = JSON.stringify(UnsignedBuildEmptyIDTransaction);
        should.throws(() => txBuilder.from(txJson));
      });

      it('should throw exception of invalid time stamp', () => {
        const txJson = JSON.stringify(UnsignedInvalidTimeStampBuildTransaction);
        should.throws(() => txBuilder.from(txJson));
      });

      it('should throw exception of invalid expiration time', () => {
        const txJson = JSON.stringify(UnsignedInvalidExpirationBuildTransaction);
        should.throws(() => txBuilder.from(txJson));
      });

      it('should throw exception of non-existence of contract', () => {
        const txJson = JSON.stringify(UnsignedInvalidContractBuildTransaction);
        should.throws(() => txBuilder.from(txJson));
      });

      it('should validate JSON transaction', () => {
        const txJson = UnsignedAccountPermissionUpdateContractTx;
        should.doesNotThrow(() => txBuilder.from(txJson));
      });

      it('should validate stringified JSON transaction', () => {
        const txJsonString = JSON.stringify(UnsignedBuildTransaction);
        should.doesNotThrow(() => txBuilder.from(txJsonString));
      });
    });

    describe('#validateKey', () => {
      it('should not throw an error when the key is valid', () => {
        const key = '2DBEAC1C22849F47514445A56AEF2EF164528A502DE4BD289E23EA1E2D4C4B06';
        should.doesNotThrow(() => txBuilder.validateKey({ key }));
      });

      it('should throw an error when the key is invalid', () => {
        const key = 'jiraiya';
        should.throws(() => txBuilder.validateKey({ key }), 'The provided key is not valid');
      });
    });

    it('should build an half signed tx from implementation', async () => {
      const txBuilder = factory.getTransferBuilder();
      const txJson = JSON.stringify(UnsignedBuildTransaction);
      txBuilder.from(txJson);
      txBuilder.sign({ key: FirstPrivateKey });
      const tx = await txBuilder.build();

      should.equal(tx.id, '80b8b9eaed51c8bba3b49f7f0e7cc5f21ac99a6f3e2893c663b544bf2c695b1d');
      should.equal(tx.type, TransactionType.Send);
      should.equal(tx.inputs.length, 1);
      should.equal(tx.inputs[0].address, 'TTsGwnTLQ4eryFJpDvJSfuGQxPXRCjXvZz');
      should.equal(tx.inputs[0].value, '1718');
      should.equal(tx.outputs.length, 1);
      should.equal(tx.outputs[0].address, 'TNYssiPgaf9XYz3urBUqr861Tfqxvko47B');
      should.equal(tx.outputs[0].value, '1718');
    });

    it('should build an half signed tx from factory', async () => {
      const txJson = JSON.stringify(UnsignedBuildTransaction);
      const txBuilder = factory.from(txJson);
      txBuilder.sign({ key: FirstPrivateKey });
      const tx = await txBuilder.build();

      should.equal(tx.id, '80b8b9eaed51c8bba3b49f7f0e7cc5f21ac99a6f3e2893c663b544bf2c695b1d');
      should.equal(tx.type, TransactionType.Send);
      should.equal(tx.inputs.length, 1);
      should.equal(tx.inputs[0].address, 'TTsGwnTLQ4eryFJpDvJSfuGQxPXRCjXvZz');
      should.equal(tx.inputs[0].value, '1718');
      should.equal(tx.outputs.length, 1);
      should.equal(tx.outputs[0].address, 'TNYssiPgaf9XYz3urBUqr861Tfqxvko47B');
      should.equal(tx.outputs[0].value, '1718');
    });
  });
});
