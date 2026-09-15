'use strict';

const util = require('../../../test/mockUtil')();
const _ = require('lodash');

describe('dal node', () => {
  let testContext = {};

  util.mockCommon(testContext);

  beforeEach(() => {
    testContext.mod = require('./node')(testContext.app, testContext.model, {
      core: testContext.coreConn
    });
  });

  it('should be a configurable package', () => {
    expect(require('./node')).toEqual(expect.any(Function));
  });

  it('should export an object containing node functions', () => {
    expect(
      require('./node')(testContext.app, testContext.model, {
        core: testContext.pg
      })
    ).toEqual({
      getNodes: expect.any(Function),
      deleteNode: expect.any(Function),
      unpairNode: expect.any(Function),
      updatePauseStatusForNodes: expect.any(Function),
      pairNodeToCluster: expect.any(Function),
      updateNodePing: expect.any(Function),
      updateNodeMetrics: expect.any(Function)
    });
  });

  describe('when calling getNodes', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getNodes.bind(null, { organizationId: 123 }, null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getNodes({}, null, function callback(err, result) {
        expect(err).toBe(null);
        expect(result).toEqual(
          expect.objectContaining({
            totalResults: expect.any(Number),
            from: expect.any(Number),
            to: expect.any(Number),
            results: expect.any(Array)
          })
        );
        expect(result.results.length).toBe(0);
      });
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockNode = {
        nodeId: 'some-node',
        organizationId: 123,
        total: 1
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockNode]));

      jest.spyOn(testContext.model.Node, 'fromDB').mockReturnValue(mockNode);

      await testContext.mod.getNodes(
        {
          organizationId: 123,
          nodeId: 'some-node-id',
          clusterId: 'some-cluster-id',
          offset: 1,
          limit: 1
        },
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual({
            totalResults: 1,
            from: 1,
            to: 2,
            results: [mockNode]
          });
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Node.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling deleteNode', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.deleteNode.bind(null, 'node-abc', null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.deleteNode(
        'node-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockNode = {
        nodeId: 'some-node',
        organizationId: 123
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockNode]));

      jest.spyOn(testContext.model.Node, 'fromDB').mockReturnValue(mockNode);

      await testContext.mod.deleteNode(
        'node-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockNode);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Node.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling unpairNode', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.unpairNode.bind(null, 'node-id', null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.unpairNode(
        'node-id',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockNode = {
        nodeId: 'some-node',
        organizationId: 123
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockNode]));

      jest.spyOn(testContext.model.Node, 'fromDB').mockReturnValue(mockNode);

      await testContext.mod.unpairNode(
        'node-id',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockNode);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Node.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling updatePauseStatusForNodes', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.updatePauseStatusForNodes.bind(
        null,
        ['node-id'],
        false,
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.updatePauseStatusForNodes(
        ['node-id'],
        false,
        null,
        function callback(err, results) {
          expect(err).toBe(null);
          expect(results).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockNode = {
        nodeId: 'some-node',
        organizationId: 123
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockNode]));

      jest.spyOn(testContext.model.Node, 'fromDB').mockReturnValue(mockNode);

      await testContext.mod.updatePauseStatusForNodes(
        ['node-id'],
        true,
        null,
        function callback(err, results) {
          expect(err).toBe(null);
          expect(results).toEqual([mockNode]);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Node.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling pairNodeToCluster', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.pairNodeToCluster.bind(null, {}, null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.pairNodeToCluster(
        {},
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockNode = {
        nodeId: 'some-node',
        organizationId: 123
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockNode]));

      jest.spyOn(testContext.model.Node, 'fromDB').mockReturnValue(mockNode);

      await testContext.mod.pairNodeToCluster(
        {},
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockNode);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Node.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling updateNodePing', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.updateNodePing.bind(null, 'node-abc', null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.updateNodePing(
        'node-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockNode = {
        nodeId: 'some-node',
        organizationId: 123
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockNode]));

      jest.spyOn(testContext.model.Node, 'fromDB').mockReturnValue(mockNode);

      await testContext.mod.updateNodePing(
        'node-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockNode);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Node.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling updateNodeMetrics', () => {
    let mockNodeMetrics;
    let mockResultNode;

    beforeEach(() => {
      mockNodeMetrics = {
        cpuCount: 123
      };

      mockResultNode = {
        nodeId: 'some-node-id'
      };

      testContext.req.params = {
        nodeId: 'some-node-id'
      };
    });

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.updateNodeMetrics.bind(
        null,
        'some-node-id',
        mockNodeMetrics,
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.updateNodeMetrics(
        'some-node-id',
        mockNodeMetrics,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockResultNode]));

      jest
        .spyOn(testContext.model.Node, 'fromDB')
        .mockReturnValue(mockResultNode);

      await testContext.mod.updateNodeMetrics(
        'some-node-id',
        mockNodeMetrics,
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockResultNode);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Node.fromDB).toHaveBeenCalled();
    });
  });
});
