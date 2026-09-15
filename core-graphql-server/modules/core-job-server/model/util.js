'use strict';
const striptags = require('striptags');

module.exports = function init() {
  return {
    dateTimeToJson: dateTimeToJson,
    stripHtmlTags: stripHtmlTags
  };

  function dateTimeToJson(value) {
    if (!value) {
      return;
    }

    const date = new Date(value * 1000);
    return date.toISOString();
  }

  /**
   * stripHtmlTags: strips html tags from string.
   * Use this as convert function to override the default behavior of core-server-base/createModel for string fields.
   * The default behavior uses sanitize-html which also does escaping in addition to removing html tags.
   * In the cases where this behavior is producing invalid results (ex. uris) use this as the convert function in the model
   * @param  val The value of the string
   * @param  {} _src Unused, required for interface compatibility with field convert
   * @param  {} self The model data
   * @param  {} key The field name
   */
  function stripHtmlTags(val, _src, self, key) {
    self[key] = val ? striptags(val) : null;
  }
};
