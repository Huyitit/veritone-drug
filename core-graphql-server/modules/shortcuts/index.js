const _ = require('lodash');
const { VALIDATORS } = require('veritone-json-schemas');

const NOT_FOUND = 'not_found';
const INVALID_INPUT = 'invalid_input';

class Shortcuts {
  constructor(serviceContext) {
    this.logger = serviceContext.logger;
    this.dal = require('../../dal/engineCategory')(serviceContext);
    this.validateEngineOutput = this.validateEngineOutput.bind(this);
  }

  async validateEngineOutput(req, res) {
    const engineOutputToValidate = req.body;
    const specifiedValidationContract = req.param.validationContract;

    // look up validationContract from the engine output
    if (
      !specifiedValidationContract &&
      (!_.isArray(engineOutputToValidate.validationContracts) ||
        engineOutputToValidate.validationContracts.length !== 1)
    ) {
      res.status('400');
      return res.send({
        errors: [
          {
            name: INVALID_INPUT,
            message: `Must have one and only one validationContract`
          }
        ]
      });
    }

    // make sure we currently support validation for this engine category
    const validationContract =
      specifiedValidationContract ||
      engineOutputToValidate.validationContracts[0];
    let engineCategories = await this.dal.getEngineCategoriesDb(null, {
      validationContract
    });

    const validator = VALIDATORS[validationContract];
    if (_.get(engineCategories, 'count') !== 1 || !validator) {
      res.status('400');
      return res.send({
        errors: [
          {
            name: NOT_FOUND,
            message: `Engine output validator does not currently support the validationContact: "${validationContract}"`
          }
        ]
      });
    }

    const results = validator(engineOutputToValidate);
    if (_.get(results, 'valid') === true) {
      return res.send({
        data: results
      });
    } else {
      res.status('400');
      return res.send({
        errors: [
          {
            name: INVALID_INPUT,
            message:
              'The supplied engine result failed schema validation checks. Details errors are included in the validationErrors field.',
            validationErrors: results.errors
          }
        ]
      });
    }
  }
}

module.exports = Shortcuts;
