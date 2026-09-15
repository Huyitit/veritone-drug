var createModel = require('../util/create-model');

var Program = createModel({
  // String fields:
  programName: {
    type: 'string'
  },
  programImage: {
    type: 'string'
  },
  // Number fields:
  programId: {
    type: 'number'
  }
});

module.exports = Program;
