const finished = require('on-finished');
const _ = require('lodash');
const fs = require('fs');

// Express middleware for reaping uploaded files saved to disk by multer
// or any multipart middleware propagating the req.files object.
// The middleware will automatically remove any uploaded files left in their temporary
// location upon response end or close.
function cleanupMultipartUploads(req, res, next) {
  const processFile = function processFile(err, file) {
    fs.stat(file.path, (err, stats) => {
      if (!err && stats.isFile()) {
        fs.unlink(file.path, (err) => {
          if (err) return console.warn(err);
        });
      }
    });
  };

  const cleanupFiles = (err) => {
    let done = new Set();
    let filesToDelete = [];

    if (req.file) {
      filesToDelete.push(req.file);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        filesToDelete = filesToDelete.concat(req.files);
      } else {
        Object.entries(req.files).forEach(([key, files]) => {
          filesToDelete = filesToDelete.concat(files);
        });
      }
    }
    filesToDelete = _.uniq(filesToDelete).forEach((file) =>
      processFile(err, file)
    );
  };

  finished(res, cleanupFiles);
  next();
}

module.exports = {
  cleanupMultipartUploads
};
