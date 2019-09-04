const fs = require('fs');
const { promisify } = require('util');

/**
 * Change the password of a wallet's user key.
 */
const { BitGo } = require('../dist/src');

async function changeWalletPassword(
  env,
  otpToken,
  coinName,
  walletId,
  oldPassword,
  newPassword
) {
  const accessToken = process.env.BITGO_TOKEN;
  const bitgo = new BitGo({ env, accessToken });
  await bitgo.unlock({ otp: otpToken });
  const coin = bitgo.coin(coinName);

  console.log('fetching wallet...');
  const wallet = await coin.wallets().get({ id: walletId });
  const userKeyId = wallet._wallet.keys[0];
  console.log(`re-encrypting user key ${userKeyId}`);

  const keychains = await coin.keychains();
  const userKey = await keychains.get({ id: userKeyId });

  console.log('decrypting old key...');
  const decryptedPrv = bitgo.decrypt({ input: userKey.encryptedPrv, password: oldPassword });
  console.log('success');

  if (newPassword) {
    const backupFileName = `encrypted-wallet-password-${userKeyId}.json`;

    console.log(`creating backup of encrypted key in ${backupFileName}...`);
    const open = promisify(fs.open);
    const writeFile = promisify(fs.writeFile);
    const backupFile = await open(backupFileName, 'ax');
    await writeFile(backupFile, JSON.stringify(userKey, null, 2));

    console.log('re-encrypting with new password...');
    const newEncryptedPrv = bitgo.encrypt({ input: decryptedPrv, password: newPassword });

    console.log('submitting new key...');
    const newKey = { ...userKey, encryptedPrv: newEncryptedPrv };
    await bitgo
      .put(coin.url(`/key/${userKeyId}`))
      .send(newKey)
      .result();

    console.log('success');
  } else {
    console.log(`--newPassword not given, exiting`);
  }
}

async function main() {
  const {
    otp,
    env,
    coin,
    wallet,
    password,
    newPassword,
  } = require('yargs')
    .options({
      otp: { desc: 'otp code', demand: true },
      env: { desc: 'prod, test, ...', demand: true },
      coin: { desc: 'btc, tbtc, ...', demand: true },
      wallet: { desc: 'wallet id', demand: true },
      password: { desc: 'old password', demand: true },
      newPassword: { desc: 'new password' }
    })
    .argv;

  await changeWalletPassword(env, otp, coin, wallet, password, newPassword);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
