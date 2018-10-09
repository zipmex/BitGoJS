
const Promise = require('bluebird');
const co = Promise.coroutine;
require('should');
const TestV2BitGo = require('../../lib/test_bitgo');
const nock = require('nock');
const sinon = require('sinon');
const Util = require('../../../src/util');

describe('Prebuild and Sign ETH Transaction', co(function *() {

  let bitgo;
  let ethWallet;
  let recipients;
  let tx;
  let originalMethod;

  before(co(function *() {
    bitgo = new TestV2BitGo({ env: 'test' });
    bitgo.initializeTestVars();
    const coin = bitgo.coin('teth');
    ethWallet = coin.newWalletObject(bitgo, coin, {});

    originalMethod = ethWallet.getOperationSha3ForExecuteAndConfirm;
    ethWallet.getOperationSha3ForExecuteAndConfirm = () => 'a hash';
    recipients = [{
      address: '0xe59dfe5c67114b39a5662cc856be536c614124c0',
      amount: '100000'
    }];
    tx = { recipients, nextContractSequenceId: 0 };
  }));

  it('should read transaction recipients from txPrebuild even if none are specified as top-level params', co(function *() {
    sinon.stub(Util, 'xprvToEthPrivateKey');
    sinon.stub(Util, 'ethSignMsgHash');
    const { halfSigned } = yield ethWallet.signTransaction({ txPrebuild: tx, prv: 'my_user_prv' });
    halfSigned.should.have.property('recipients', recipients);

    Util.xprvToEthPrivateKey.restore();
    Util.ethSignMsgHash.restore();
  }));

  it('should throw an error if no recipients are in the txPrebuild and none are specified as params', co(function *() {
    yield ethWallet.signTransaction({ txPrebuild: {}, prv: 'my_user_prv' }).should.be.rejectedWith('recipients missing or not array');
  }));

  it('should throw an error if no recipients are in the txPrebuild and none are specified as params', co(function *() {
    yield ethWallet.signTransaction({ txPrebuild: { recipients: 'not-array' }, prv: 'my_user_prv' }).should.be.rejectedWith('recipients missing or not array');
  }));

  after(function() {
    ethWallet.getOperationSha3ForExecuteAndConfirm = originalMethod;
    nock.activeMocks().should.be.empty();
  });
}));
