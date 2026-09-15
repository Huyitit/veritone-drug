const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
jest.mock('pg');
const pg = require('pg');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const trigger = require('./trigger')(
  serviceContext.logger,
  serviceContext.config,
  serviceContext.dbConnections,
  null,
  serviceContext
);

describe('trigger.js', function () {
  beforeEach(() => {
    jest.resetModules();
    // jest.clearAllMocks();
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  describe('#createTriggers', function () {
    it('should throw error when both events and types are exists', async function () {
      try {
        await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            events: '4,5,6',
            types: '1,2,3'
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'only either events or types should be specified'
        );
      }
    });
    it('should throw error when wildcard exists with multiple events', async function () {
      try {
        await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            events: '4,5,*' //wildcard
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'wild card is not suported for multiple events'
        );
      }
    });
    it('should throw error when wildcard exists with multiple types', async function () {
      try {
        await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            types: '4,5,*' //wildcard
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'wild card is not suported for multiple types'
        );
      }
    });
    it('should throw error when verify target params with email fails', async function () {
      try {
        await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            targets: [
              {
                name: 'Email'
              }
            ]
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'target param is not compatible with the provided target'
        );
      }
    });
    it('should throw error when verify target params with SMS fails', async function () {
      try {
        await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            targets: [
              {
                name: 'SMS'
              }
            ]
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'target param is not compatible with the provided target'
        );
      }
    });
    it('should throw error when verify target params with Webhook fails', async function () {
      try {
        await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            targets: [
              {
                name: 'Webhook'
              }
            ]
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'target param is not compatible with the provided target'
        );
      }
    });
    it('should throw error when verify target params fails with other names', async function () {
      try {
        await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            targets: [
              {
                name: 'test'
              }
            ]
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'target param is not compatible with the provided target'
        );
      }
    });
    it('should return empty array when name of event is empty string', async function () {
      try {
        for (let i = 0; i < 12; i++) {
          serviceContext.dbConnections['core'].write._push([
            {
              organization_id: '123',
              event_name: 'test',
              event_type: 'test'
            }
          ]);
        }
        const res = await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            events: ',,,',
            targets: [
              {
                name: 'Email',
                params: {
                  address: 'test'
                }
              },
              {
                name: 'SMS',
                params: {
                  number: 123
                }
              },
              {
                name: 'Webhook',
                params: {
                  url: 'test'
                }
              }
            ]
          }
        });
        chaiExpect(res.length).to.equal(0);
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
    it('should return empty array when target name is empty string', async function () {
      try {
        for (let i = 0; i < 12; i++) {
          serviceContext.dbConnections['core'].write._push([
            {
              organization_id: '123',
              event_name: 'test',
              event_type: 'test'
            }
          ]);
        }
        const res = await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            types: '1,2,3,4',
            targets: [
              {
                name: 'test',
                params: {
                  address: 'test'
                }
              },
              {
                name: 'test',
                params: {
                  number: 123
                }
              },
              {
                name: '',
                params: {
                  url: 'test'
                }
              }
            ]
          }
        });
        chaiExpect(res).to.not.exist;
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'target param is not compatible with the provided target'
        );
      }
    });
    it('should return array and emit message when insert trigger to database successfully', async function () {
      try {
        for (let i = 0; i < 12; i++) {
          serviceContext.dbConnections['core'].write._push([
            {
              organization_id: '123',
              event_name: 'test',
              event_type: 'test'
            }
          ]);
        }

        const res = await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            events: '1,2,3,4',
            targets: [
              {
                name: 'Email',
                params: {
                  address: 'test'
                }
              },
              {
                name: 'SMS',
                params: {
                  number: 123
                }
              },
              {
                name: 'Webhook',
                params: {
                  url: 'test'
                }
              }
            ]
          }
        });
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(12);
        chaiExpect(res[0].organizationId).to.equal('123');
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
    it('should return empty array when emit message failure', async function () {
      try {
        jest.mock('../messageUtil.js', () => (serviceContext) => {
          return {
            emitEvent: () => {
              throw new Error('produce fails');
            }
          };
        });
        const _trigger = require('./trigger')(
          serviceContext.logger,
          serviceContext.config,
          serviceContext.dbConnections,
          null,
          serviceContext
        );
        for (let i = 0; i < 12; i++) {
          serviceContext.dbConnections['core'].write._push([
            {
              organization_id: '123',
              event_name: 'test',
              event_type: 'test'
            }
          ]);
        }
        const res = await _trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            targets: [
              {
                name: 'Email',
                params: {
                  address: 'test'
                }
              },
              {
                name: 'SMS',
                params: {
                  number: 123
                }
              },
              {
                name: 'Webhook',
                params: {
                  url: 'test'
                }
              }
            ]
          }
        });
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(0);
        jest.resetModules();
        jest.clearAllMocks();
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
    it('should return array of triggers successfully with types in input params', async function () {
      try {
        for (let i = 0; i < 12; i++) {
          serviceContext.dbConnections['core'].write._push([
            {
              organization_id: '123',
              event_name: 'test',
              event_type: 'test'
            }
          ]);
        }
        const res = await trigger.createTriggers(mockUtil.makeContext(), {
          input: {
            types: '1,2,3,4',
            targets: [
              {
                name: 'Email',
                params: {
                  address: 'test'
                }
              },
              {
                name: 'SMS',
                params: {
                  number: 123
                }
              },
              {
                name: 'Webhook',
                params: {
                  url: 'test'
                }
              }
            ]
          }
        });
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(12);
        chaiExpect(res[0].organizationId).to.equal('123');
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
  });
  describe('#upsertTrigger', function () {
    it('should throw error when eventName is empty string in input params', async function () {
      try {
        const res = await trigger.upsertTrigger(mockUtil.makeContext(), {
          input: {
            eventName: '', //is empty string
            eventType: 'test',
            targetName: 'Email',
            consumerParams: {
              address: 'test'
            },
            disableCacheUpdate: true
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'eventName cannot be an empty string'
        );
      }
    });
    it('should throw error when targetName is empty string in input params', async function () {
      try {
        const res = await trigger.upsertTrigger(mockUtil.makeContext(), {
          input: {
            eventName: 'test',
            eventType: 'test',
            targetName: '', //is empty string
            consumerParams: {
              address: 'test'
            },
            disableCacheUpdate: true
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'targetName cannot be an empty string'
        );
      }
    });
    it('should throw error when consumerDirective in input params is not type of JSON', async function () {
      try {
        const res = await trigger.upsertTrigger(mockUtil.makeContext(), {
          input: {
            eventName: 'test',
            eventType: 'test',
            targetName: 'test',
            consumerDirective: '', //is not JSON type
            disableCacheUpdate: true
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'consumerDirective must be JSONData'
        );
      }
    });
    it('should throw error when consumerParams in input params is not type of JSON', async function () {
      try {
        const res = await trigger.upsertTrigger(mockUtil.makeContext(), {
          input: {
            eventName: 'test',
            eventType: 'test',
            targetName: 'test',
            consumerParams: '', //is not JSON type
            disableCacheUpdate: true
          }
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('invalid_input');
        chaiExpect(_.toString(error)).to.contain(
          'consumerParams must be JSONData'
        );
      }
    });
    it('should emit message successfully', async function () {
      try {
        serviceContext.dbConnections['core'].write._push([
          {
            organization_id: '123',
            event_name: 'test',
            event_type: 'test'
          }
        ]);
        const res = await trigger.upsertTrigger(mockUtil.makeContext(), {
          input: {
            eventName: 'test',
            eventType: 'test',
            targetName: 'test',
            consumerParams: {
              address: 'test'
            }
          }
        });
        chaiExpect(res).to.exist;
        chaiExpect(res.organizationId).to.equal('123');
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
    it('should emit message failure', async function () {
      try {
        serviceContext.dbConnections['core'].write._push([
          {
            organization_id: '123',
            event_name: 'test',
            event_type: 'test'
          }
        ]);
        jest.mock('../messageUtil.js', () => (serviceContext) => {
          return {
            emitEvent: () => {
              throw new Error('produce fails');
            }
          };
        });
        const res = await trigger.upsertTrigger(mockUtil.makeContext(), {
          input: {
            eventName: 'test',
            eventType: 'test',
            targetName: 'test',
            consumerParams: {
              address: 'test'
            }
          }
        });
        chaiExpect(res).to.exist;
        chaiExpect(res.organizationId).to.equal('123');
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
  });
  describe('#deleteTrigger', function () {
    jest.resetModules();
    jest.clearAllMocks();
    it('should throw error when trigger is not found', async function () {
      serviceContext.dbConnections['core'].write._push([]);
      try {
        const _trigger = require('./trigger')(
          {
            ...serviceContext.logger,
            log: (...args) => serviceContext.logger.info(args)
          },
          serviceContext.config,
          serviceContext.dbConnections,
          null,
          serviceContext
        );
        await _trigger.deleteTrigger(mockUtil.makeContext(), {
          organizationId: 123,
          id: 123
        });
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('not_found');
        chaiExpect(_.toString(error)).to.contain(
          'The requested ID associated with your organization does not exist'
        );
      }
    });
    it('should throw error when emit message failure', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '123',
          event_trigger_id: '123',
          event_name: 'test',
          event_type: 'test'
        }
      ]);
      try {
        jest.mock('../messageUtil.js', () => (serviceContext) => {
          return {
            emitEvent: () => {
              throw new Error('produce fails');
            }
          };
        });
        const _trigger = require('./trigger')(
          {
            ...serviceContext.logger,
            log: (...args) => serviceContext.logger.info(args)
          },
          serviceContext.config,
          serviceContext.dbConnections,
          null,
          serviceContext
        );
        const res = await _trigger.deleteTrigger(mockUtil.makeContext(), {
          organizationId: 123,
          id: 123
        });
        chaiExpect(res).to.not.exist;
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('service_failure');
        chaiExpect(_.toString(error)).to.contain(
          'unable to update trigger cache'
        );
      }
    });
    it('should delete trigger and emit message successfully and return response with trigger id', async function () {
      serviceContext.dbConnections['core'].write._push([
        {
          organization_id: '123',
          event_trigger_id: '123',
          event_name: 'test',
          event_type: 'test'
        }
      ]);
      try {
        jest.mock('../messageUtil.js', () => (serviceContext) => {
          return {
            emitEvent: () => {}
          };
        });
        const _trigger = require('./trigger')(
          {
            ...serviceContext.logger,
            log: (...args) => serviceContext.logger.info(args)
          },
          serviceContext.config,
          serviceContext.dbConnections,
          null,
          serviceContext
        );
        const res = await _trigger.deleteTrigger(mockUtil.makeContext(), {
          organizationId: 123,
          id: 123
        });
        chaiExpect(res).to.exist;
        chaiExpect(res.id).to.equal(123);
        chaiExpect(res.message).to.contain(
          'Trigger 123 has been removed from organization 123'
        );
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
  });
  describe('#getTriggers', function () {
    it('should throw error when organization id is not found', async function () {
      try {
        const testContext = _.cloneDeep(mockUtil.makeContext());
        testContext._authInfo.organization.organizationId = undefined; //remove organization id
        await trigger.getTriggers(testContext, {});
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('not_allowed');
        chaiExpect(_.toString(error)).to.contain(
          'The authenticated user does not have permission to perform the operation'
        );
      }
    });
    it('should throw error when no trigger is found', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      try {
        await trigger.getTriggers(mockUtil.makeContext(), {});
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('not_found');
        chaiExpect(_.toString(error)).to.contain(
          'The requested object was not found'
        );
      }
    });
    it('should return triggers successfully', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          organization_id: '123',
          event_trigger_id: '123',
          event_name: 'test',
          event_type: 'test'
        }
      ]);
      try {
        const res = await trigger.getTriggers(mockUtil.makeContext(), {});
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(1);
        chaiExpect(res[0].organizationId).to.equal('123');
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
  });
  describe('#getTrigger', function () {
    it('should throw error when organization id is not found', async function () {
      try {
        const testContext = _.cloneDeep(mockUtil.makeContext());
        testContext._authInfo.organization.organizationId = undefined; //remove organization id
        await trigger.getTrigger(testContext, {});
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('not_allowed');
        chaiExpect(_.toString(error)).to.contain(
          'The authenticated user does not have permission to perform the operation'
        );
      }
    });
    it('should throw error when no trigger is found', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      try {
        await trigger.getTrigger(mockUtil.makeContext(), {});
      } catch (error) {
        chaiExpect(error).to.exist;
        chaiExpect(error.name).to.equal('not_found');
        chaiExpect(_.toString(error)).to.contain(
          'The requested object was not found'
        );
      }
    });
    it('should return triggers successfully', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          organization_id: '123',
          event_trigger_id: '123',
          event_name: 'test',
          event_type: 'test'
        }
      ]);
      try {
        const res = await trigger.getTrigger(mockUtil.makeContext(), {});
        chaiExpect(res).to.exist;
        chaiExpect(res.organizationId).to.equal('123');
      } catch (error) {
        chaiExpect(error).to.not.exist;
      }
    });
  });
});
