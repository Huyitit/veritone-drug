module.exports = function createFunction() {
  /**
   * Attempts to match language string input to any of the
   *    https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
   *    https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
   * and if possible to https://en.wikipedia.org/wiki/ISO_3166-2 country code
   * @param languageString
   *    case insensitive any of 'english', 'en', 'eng', 'en - US', 'eng - US', 'en-us', 'english:en'
   * @returns {string|null} case sensitive 'en',
   *    or 'en - US' if possible to determine country code,
   *    or null if was not possible to match to any ISO code
   */
  function languageStringToIsoCode(languageString) {
    if (!languageString || !languageString.length) {
      return null;
    }

    let languageName = languageString;
    let languageCode = languageString;

    // 'English:en' 'Hawaiian:haw' 'Chinese Traditional:zh-TW'
    const nameToIsoCodeColonSeparatedRegex = /(^[a-zA-Z]*[a-zA-Z]).:/;
    if (nameToIsoCodeColonSeparatedRegex.test(languageCode)) {
      const languageNameToCode = languageString.split(':');
      languageName = languageNameToCode[0].trim();
      languageCode = languageNameToCode[1].trim();
    }

    // 'es' 'ES' 'haw' 'HAW'
    const isoCodeRegex = /^[a-zA-Z]{2}$|^[a-zA-Z]{3}$/;
    if (isoCodeRegex.test(languageCode)) {
      return languageCode.toLowerCase();
    }

    // 'en - US' 'eng - UK'
    // 'en - us' 'eng - uk' 'EN - us' 'EN - US' 'ENG - uk' 'ENG - UK'
    // 'en-us' 'eng-uk' 'EN-us' 'EN-US' 'ENG-uk' 'ENG-UK'
    // 'en- us' 'eng -Uk' 'En -us'...
    const isoCodeToCountryIsoCodeRegex = /(^[a-zA-Z]{2}|^[a-zA-Z]{3}) ?- ?[a-zA-Z]{2}$/;
    if (isoCodeToCountryIsoCodeRegex.test(languageCode)) {
      const isoCodes = languageCode.split('-');
      const languageIsoCode = isoCodes[0].trim().toLowerCase();
      const countryIsoCode = isoCodes[1].trim().toUpperCase();
      return `${languageIsoCode}-${countryIsoCode}`;
    }

    // Try to determine language ISO code by language name like 'English'
    if (languageName && languageName.length) {
      return getIsoCodeForLanguageName(languageName);
    }
    return null;
  }

  /**
   * Match language to ISO code. Case insensitive.
   * @param languageName
   * @returns {string|null} https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes or null
   */
  function getIsoCodeForLanguageName(languageName) {
    languageName = languageName.toLowerCase();
    switch (languageName) {
      case 'english':
        return 'en';
      case 'afrikaans':
        return 'af';
      case 'albanian':
        return 'sq';
      case 'amharic':
        return 'am';
      case 'arabic':
        return 'ar';
      case 'armenian':
        return 'hy';
      case 'azerbaijani':
        return 'az';
      case 'basque':
        return 'eu';
      case 'belarusian':
        return 'be';
      case 'bengali':
        return 'bn';
      case 'bosnian':
        return 'bs';
      case 'bulgarian':
        return 'bg';
      case 'burmese':
        return 'my';
      case 'catalan':
        return 'ca';
      case 'cebuano':
        return 'ceb';
      case 'chichewa':
        return 'ny';
      case 'chinese simplified':
        return 'zh-CN';
      case 'chinese traditional':
        return 'zh-TW';
      case 'chinese':
        return 'zh-CN';
      case 'corsican':
        return 'co';
      case 'croatian':
        return 'hr';
      case 'czech':
        return 'cs';
      case 'danish':
        return 'da';
      case 'dutch':
        return 'nl';
      case 'esperanto':
        return 'eo';
      case 'estonian':
        return 'et';
      case 'filipino':
        return 'tl';
      case 'finnish':
        return 'fi';
      case 'french':
        return 'fr';
      case 'frisian':
        return 'fy';
      case 'galician':
        return 'gl';
      case 'georgian':
        return 'ka';
      case 'german':
        return 'de';
      case 'greek':
        return 'el';
      case 'gujarati':
        return 'gu';
      case 'haitian Creole':
        return 'ht';
      case 'hausa':
        return 'ha';
      case 'hawaiian':
        return 'haw';
      case 'hebrew':
        return 'iw';
      case 'hindi':
        return 'hi';
      case 'homong':
        return 'hmn';
      case 'hungarian':
        return 'hu';
      case 'icelandic':
        return 'is';
      case 'indonesian':
        return 'id';
      case 'irish':
        return 'ga';
      case 'italian':
        return 'it';
      case 'japanese':
        return 'ja';
      case 'javanese':
        return 'jw';
      case 'kannada':
        return 'kn';
      case 'kazakh':
        return 'kk';
      case 'khmer':
        return 'km';
      case 'korean':
        return 'ko';
      case 'kurdish':
        return 'ku';
      case 'kyrgyz':
        return 'ky';
      case 'lao':
        return 'lo';
      case 'latin':
        return 'la';
      case 'latvian':
        return 'lv';
      case 'lithuanian':
        return 'lt';
      case 'luxembourgish':
        return 'lb';
      case 'macedonian':
        return 'mk';
      case 'malagasy':
        return 'mg';
      case 'malay':
        return 'ms';
      case 'malayalam':
        return 'ml';
      case 'maltese':
        return 'mt';
      case 'maori':
        return 'mi';
      case 'marathi':
        return 'mr';
      case 'mongolian':
        return 'mn';
      case 'nepali':
        return 'ne';
      case 'norwegian':
        return 'no';
      case 'pashto':
        return 'ps';
      case 'persian':
        return 'fa';
      case 'polish':
        return 'pl';
      case 'portuguese':
        return 'pt';
      case 'romanian':
        return 'ro';
      case 'russian':
        return 'ru';
      case 'samoan':
        return 'sm';
      case 'scots Gaelic':
        return 'gd';
      case 'serbian':
        return 'sr';
      case 'sesotho':
        return 'st';
      case 'shona':
        return 'sn';
      case 'sindhi':
        return 'sd';
      case 'sinhala':
        return 'si';
      case 'slovak':
        return 'sk';
      case 'slovenian':
        return 'sl';
      case 'somali':
        return 'so';
      case 'spanish':
        return 'es';
      case 'sundanese':
        return 'su';
      case 'swahili':
        return 'sw';
      case 'swedish':
        return 'sv';
      case 'tajik':
        return 'tg';
      case 'tamil':
        return 'ta';
      case 'telugu':
        return 'te';
      case 'thai':
        return 'th';
      case 'turkish':
        return 'tr';
      case 'ukrainian':
        return 'uk';
      case 'urdu':
        return 'ur';
      case 'uzbek':
        return 'uz';
      case 'vietnamese':
        return 'vi';
      case 'welsh':
        return 'cy';
      case 'xhosa':
        return 'xh';
      case 'yiddish':
        return 'yi';
      case 'yoruba':
        return 'yo';
      case 'zulu':
        return 'zu';
      default:
        return null;
    }
  }

  return {
    languageStringToIsoCode
  };
};
