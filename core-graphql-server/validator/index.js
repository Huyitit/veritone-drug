const _ = require('lodash');
const { Validator: JSONValidator } = require('jsonschema');
const engineOutputSchemas = require('./json-schema/engine-output');
const SDOValidator = require('../modules/structureddata/model/validator.js');

module.exports = function createModule(serviceContext) {
  const errors = require('../error')(serviceContext.config);
  const { logger } = serviceContext;
  const structuredData = serviceContext.dal.structuredData;
  const genericSDOValidator = new SDOValidator(serviceContext, true);

  async function validateEngineOutput(instance, args, context) {
    const v = new JSONValidator();

    _.forEach(engineOutputSchemas, (schema) => {
      v.addSchema(schema, schema.id);
    });

    const validationResults = v.validate(
      // when called with a string input in query variable, the input should be processed into JSON.
      JSON.parse(_.isString(instance) ? instance : JSON.stringify(instance)),
      engineOutputSchemas.engineOutput
    );

    if (validationResults.errors.length > 0) {
      throw new errors.InvalidInput({ data: validationResults.errors });
    }
    const sdErrors = await validateStructuredData(instance);
    if (!_.isEmpty(sdErrors)) {
      throw new errors.InvalidInput({ data: sdErrors });
    }

    return true;
  }

  async function validateStructuredData(output) {
    // Find structured data in objects list
    let errors = [];
    let objects = _.get(output, 'object');
    if (_.isArray(objects) && !_.isEmpty(objects)) {
      for (let obj of objects) {
        if (_.isObject(obj) && !_.isEmpty(obj)) {
          errors = errors.concat(await validateStructuredDataInstance(obj));
        }
      }
    }

    // Find structured data in series objects list
    let series = _.get(output, 'series');
    if (_.isArray(series) && !_.isEmpty(series)) {
      for (let serObj of series) {
        let obj = _.get(serObj, 'object');
        if (_.isObject(obj) && !_.isEmpty(obj)) {
          errors = errors.concat(await validateStructuredDataInstance(obj));
        }
      }
    }

    return errors;
  }

  async function validateStructuredDataInstance(output) {
    let sd = _.get(output, 'structuredData');
    const errors = [];
    if (!_.isEmpty(sd)) {
      for (let [schemaId, instance] of Object.entries(sd)) {
        const schemaRow = await structuredData.getSchemaRowFromCache(schemaId);
        try {
          await genericSDOValidator.validateAsync(schemaRow.schema, instance);
        } catch (e) {
          errors.push({ message: e.message });
        }
      }
    }
    return errors;
  }

  return {
    validateEngineOutput
  };
};
