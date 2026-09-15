module.exports = function () {
  return {
    createdDateTime: (obj) => obj.dateCreated,
    modifiedDateTime: (obj) => obj.dateModified
  };
};
