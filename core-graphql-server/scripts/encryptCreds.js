// see https://steel-ventures.atlassian.net/wiki/spaces/VT/pages/971407635/S3+URL+Signing+Credential+Management
const crypto = require('crypto');
const { encryptObject, decryptObject } = require('@veritone/core-server-base/util.js')();

if (process.argv.length < 5) {
  console.log(
    'usage:  node encryptCreds.js <accessKey> <secretKey> <encryptionKey>'
  );
  process.exit(1);
}
const accessKey = process.argv[2];
const secretKey = process.argv[3];
const key = process.argv[4];

const str = {
  accessKey,
  secretKey
};
const cr = encryptObject(str, key);
console.log('Ciphertext:');
console.log(cr);

const dec = decryptObject(cr, key);
console.log('Plaintext (JSON):');
console.log(dec);
