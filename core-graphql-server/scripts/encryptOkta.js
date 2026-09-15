const crypto = require('crypto');
const { encryptObject, decryptObject } = require('@veritone/core-server-base/util.js')();

if (process.argv.length < 5) {
  console.log(
    'usage:  node encryptOkta.js <clientId> <clientSecret> <oktaDomain> <encryptionKey>'
  );
  process.exit(1);
}
const accessKey = process.argv[2];
const secretKey = process.argv[3];
const oktaDomain = process.argv[4];
const key = process.argv[5];

const str = {
  clientId: accessKey,
  clientSecret: secretKey,
  oktaDomain
};

const cr = encryptObject(str, key);
console.log('Ciphertext:');
console.log(cr);

const dec = decryptObject(cr, key);
console.log('Plaintext (JSON):');
console.log(dec);
