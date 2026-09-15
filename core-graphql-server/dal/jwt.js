var jwt = require('jsonwebtoken');

//TODO Change JWT verification to async verification jwt.verify
//takes in a schema from jwtSchemas.js
module.exports = function (jwtSchema) {
  return {
    sign: function sign(payload) {
      if (!this.signingKey) {
        return new Error('No signing key');
      }
      try {
        var signedPayload = jwt.sign(payload, this.signingKey, this.options);
        return signedPayload;
      } catch (err) {
        return err;
      }
    },
    verify: function verify(token) {
      if (!this.decodingKey) {
        return new Error('No decoding key');
      }
      try {
        var verifiedPayload = jwt.verify(token, this.decodingKey, this.options);
        return verifiedPayload;
      } catch (err) {
        return err;
      }
    },
    signingKey: jwtSchema.secret || jwtSchema.privateKey,
    decodingKey: jwtSchema.secret || jwtSchema.publicKey,
    options: jwtSchema.options
  };
};
