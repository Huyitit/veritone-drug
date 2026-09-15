const chaiExpect = require('chai').expect;
const _ = require('lodash');
const Long = require('long');
const seed1 = new Long(Date.now());
const seed2 = new Long(Date.now() + 10000);
const spookyHash = require('./spookyHash.js');
const shortStr = 'test';
const longStr = `
asdfasdfkjasdfa;sldfjasldjf ;asod ifjalksdjf asdjf alsdf asdfasdfkjasdfa;
;lkajsd;flj asdlkfj a;sdkjf alsdjf;ajsdlfjas ;dfja;ls dkjf;lasjd flkajsdfnpm
;;alksdjflkajsd;lfjalsekfja;osdiu;alsthoasghaseriqEIRYASOITUASEYT;AUSDFLK
asd;flkjas ;bjea;lkj;ajse;iaue8uaw;lejlaisuda8seut;i32u89173498ud9pf8asdf
`;
const midStr = '11111111111111';
describe('spookyHash.js', function () {
  describe('#hash128', function () {
    it('should hash', function () {
      //chaiExpect(spookyHash.hash128(Buffer.from(shortStr))).to.exist;
      for (let i = 0; i < 40; i++)
        chaiExpect(spookyHash.hash128(Buffer.from(_.pad(shortStr, i, '0')))).to
          .exist;
      chaiExpect(spookyHash.hash128(Buffer.from(longStr))).to.exist;
      chaiExpect(spookyHash.hash128(Buffer.from(midStr))).to.exist;
      chaiExpect(spookyHash.hash128(Buffer.from(shortStr), seed1, seed2)).to
        .exist;
    });
  });
  describe('#hash96', function () {
    it('should hash', function () {
      for (let i = 0; i < 40; i++)
        chaiExpect(spookyHash.hash96(Buffer.from(_.pad(shortStr, i, '0')))).to
          .exist;
      chaiExpect(spookyHash.hash96(Buffer.from(longStr))).to.exist;
      chaiExpect(spookyHash.hash96(Buffer.from(shortStr), seed1, seed2)).to
        .exist;
    });
  });
  describe('#hash64', function () {
    it('should hash', function () {
      for (let i = 0; i < 40; i++)
        chaiExpect(spookyHash.hash64(Buffer.from(_.pad(shortStr, i, '0')))).to
          .exist;
      chaiExpect(spookyHash.hash64(Buffer.from(longStr))).to.exist;
      chaiExpect(spookyHash.hash64(Buffer.from(shortStr), seed1, seed2)).to
        .exist;
    });
  });
  describe('#hash32', function () {
    it('should hash', function () {
      for (let i = 0; i < 40; i++)
        chaiExpect(spookyHash.hash32(Buffer.from(_.pad(shortStr, i, '0')))).to
          .exist;
      chaiExpect(spookyHash.hash32(Buffer.from(longStr))).to.exist;
      chaiExpect(spookyHash.hash32(Buffer.from(shortStr), seed1, seed2)).to
        .exist;
    });
  });
});
