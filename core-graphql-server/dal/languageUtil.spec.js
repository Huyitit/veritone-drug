const util = require('./languageUtil.js')();
const iso6391 = require('iso-639-1');

describe('languageUtil', function () {
  it('should return ISO code for colon separated laguage string', function () {
    let languageString = 'Hawaiian:haw';
    let expectedResult = 'haw';
    let actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);

    languageString = 'Hawaiian:HAW';
    expectedResult = 'haw';
    actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);
  });
  it('should return ISO code for ISO code laguage string', function () {
    let languageString = 'haw';
    let expectedResult = 'haw';
    let actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);

    languageString = 'HAW';
    expectedResult = 'haw';
    actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);
  });
  it('should return ISO code for language name in laguage string', function () {
    let languageString = 'Hawaiian';
    let expectedResult = 'haw';
    let actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);

    languageString = 'HAWAIIAN';
    expectedResult = 'haw';
    actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);
  });
  it('should return ISO language and country code for ISO language and country codes', function () {
    let languageString = 'en - US';
    let expectedResult = 'en-US';
    let actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);

    languageString = 'eng - UK';
    expectedResult = 'eng-UK';
    actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);

    languageString = 'en-us';
    expectedResult = 'en-US';
    actualResult = util.languageStringToIsoCode(languageString);
    expect(actualResult).toEqual(expectedResult);
  });
  it('should get a language ISO code for known language name', function () {
    let languageName = 'English';
    let expectedResult = 'en';
    let actualResult = util.languageStringToIsoCode(languageName);
    expect(actualResult).toEqual(expectedResult);

    languageName = 'Meow';
    expectedResult = null;
    actualResult = util.languageStringToIsoCode(languageName);
    expect(actualResult).toEqual(expectedResult);
  });

  it('should try all', function () {
    // this test gets a list of all language names from a third-party
    // library and runs over all of them. the existing code doesn't handle
    // all. to check for regression and excercise the whole file, we
    // count all the non-empty results and check against a known current total.
    const allNames = iso6391.getAllNames();
    let num = 0;
    allNames.forEach((name) => {
      const res = util.languageStringToIsoCode(name);
      if (res) num++;
    });
    expect(num).toBeGreaterThanOrEqual(94);
  });
});
