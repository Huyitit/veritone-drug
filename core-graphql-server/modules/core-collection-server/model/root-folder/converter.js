'use strict';

function convert(src, dst) {
  if (dst && src && src.treeFolderId) {
    var dstFolder = {};
    dstFolder.name = src.treeFolderName;
    dstFolder.description = src.treeFolderDescription;
    dstFolder.treeFolderId = src.treeFolderId;
    dst.folderObject = dstFolder;
  }
}

module.exports = {
  convert: convert
};
