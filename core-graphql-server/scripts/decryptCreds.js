// https://steel-ventures.atlassian.net/wiki/spaces/VT/pages/971407635/S3+URL+Signing+Credential+Management

const crypto = require('crypto');
const { decryptObject } = require('@veritone/core-server-base/util.js')();
if (process.argv.length < 3) {
  console.log('usage:  node decryptCreds.js <encryptionKey> <secretText>');
  process.exit(1);
}
const key = process.argv[2];
const secret = process.argv[3];

console.log('decrypting ' + secret + ' with ' + key);
const clear = decryptObject(secret, key);
console.log(clear);
