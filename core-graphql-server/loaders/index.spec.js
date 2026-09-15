const chaiExpect = require('chai').expect;

const mockServiceContext = {
  loaders: {
    task: { batchTasksByJobIds: () => Promise.resolve([]) },
    user: { batchUsersByIds: () => Promise.resolve([]) },
    dagTemplate: {
      batchDagTemplatesByJobIds: () => Promise.resolve([]),
      batchDagTemplatesByIds: () => Promise.resolve([])
    },
    mediaConstraint: {
      batchMediaConstraintsByDestinationTypeIds: () => Promise.resolve([])
    }
  }
};

const loaderModule = require('./index.js')(mockServiceContext);

describe('index.js', function () {
  describe('#require', function () {
    it('should export createLoaders function', function () {
      chaiExpect(typeof loaderModule).to.equal('object');
      chaiExpect(typeof loaderModule.createLoaders).to.equal('function');
    });
  });

  describe('#createLoaders', function () {
    it('should return all five expected DataLoaders', function () {
      const loaders = loaderModule.createLoaders({});

      chaiExpect(loaders).to.have.property('tasksByJobIds');
      chaiExpect(loaders).to.have.property('usersById');
      chaiExpect(loaders).to.have.property('dagTemplatesByJobIds');
      chaiExpect(loaders).to.have.property('dagTemplatesByIds');
      chaiExpect(loaders).to.have.property('mediaConstraintsByDestinationTypeId');
    });

    it('each DataLoader should expose a load function', function () {
      const loaders = loaderModule.createLoaders({});

      chaiExpect(typeof loaders.tasksByJobIds.load).to.equal('function');
      chaiExpect(typeof loaders.usersById.load).to.equal('function');
      chaiExpect(typeof loaders.dagTemplatesByJobIds.load).to.equal('function');
      chaiExpect(typeof loaders.dagTemplatesByIds.load).to.equal('function');
      chaiExpect(
        typeof loaders.mediaConstraintsByDestinationTypeId.load
      ).to.equal('function');
    });
  });
});
