'use strict';

function convert(src, dst) {
  if (dst && src && src.treeFolderId) {
    var dstFolderSummary = {};
    dstFolderSummary.maxDepth = src.maxDepth;
    dstFolderSummary.hasSubFolder = src.hasSubFolder;
    dst.folderSummaryObject = dstFolderSummary;
  }
}

module.exports = {
  convert: convert
};
