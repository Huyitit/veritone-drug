const _ = require('lodash');
const errors = require('../../../error')({});

const Validator = require('./validator');

const validSdo = {
  id: 'DEADBEEF',
  aDateTime: '2019-06-05T19:11:00Z',
  text: 'fake event for testing',
  type: 'SPOTS'
};

const schema = {
  $id: 'https://veritone.com/validator-spec.json',
  type: 'object',
  title: 'Test Schema',
  $schema: 'http://json-schema.org/draft-07/schema#',
  required: ['aDateTime', 'id', 'text'],
  properties: {
    aDateTime: {
      type: 'dateTime',
      title: 'A Date & Time',
      description: 'ISO-8601 combined date and time in UTC'
    },
    id: {
      type: 'string',
      title: 'ID',
      examples: ['1234-abcd'],
      description: 'anything will do'
    },
    text: {
      type: 'string',
      title: 'Some Text',
      examples: ['the quick brown fox jumped over the lazy dog'],
      description: 'lorum ipsum'
    },
    type: {
      type: 'string',
      title: 'Test Type',
      examples: ['Unit'],
      description: 'a type'
    }
  },
  description: 'Schema for unit testing the structured data validator'
};

describe('structured data validation', () => {
  const context = {};
  let validator;
  beforeEach(() => {
    context.logger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn()
    };

    validator = new Validator(context);
  });

  it('should error if no schema is provided', () => {
    expect(() => {
      validator.validateData(validSdo, null);
    }).toThrow(Error);
  });

  it('should validate a valid event', async () => {
    const valid = await validator.validateAsync(schema, validSdo);
    expect(valid).toEqual(true);
  });

  it('should accept a schema that is a string', async () => {
    const stringSchema = JSON.stringify(schema);
    const valid = await validator.validateAsync(stringSchema, validSdo);
    expect(valid).toEqual(true);
  });

  it('should enforce "dateTime" types are valid ISO-8601', async () => {
    const invalidSdo = _.cloneDeep(validSdo);
    invalidSdo.aDateTime = '2019-06-30T00:01:02:345Z';
    await expect(async () =>
      validator.validateAsync(schema, invalidSdo)
    ).rejects.toThrow(errors.InvalidInput);
  });

  it('should not require a timezone offset', async () => {
    const sdo = _.cloneDeep(validSdo);
    sdo.aDateTime = '2019-07-02T00:00:00';
    const valid = await validator.validateAsync(schema, sdo);
    expect(valid).toEqual(true);
  });

  it('should return data as-is when data or schema is nil', () => {
    expect(validator.coerceDataBySchema(null, schema)).toEqual(null);
    expect(validator.coerceDataBySchema(validSdo, null)).toEqual(validSdo);
  });

  it('should coerce a JSON object string when schema type is object', () => {
    const objectSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    };

    const data = '{"id":"abc-123"}';
    const result = validator.coerceDataBySchema(data, objectSchema);

    expect(result).toEqual({ id: 'abc-123' });
  });

  it('should coerce a JSON array string when schema type is array', () => {
    const arraySchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      }
    };

    const data = '[{"id":"a"},{"id":"b"}]';
    const result = validator.coerceDataBySchema(data, arraySchema);

    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('should recursively coerce nested object and array schema properties', () => {
    const nestedSchema = {
      type: 'object',
      properties: {
        discoveryPolicy: {
          type: 'object',
          properties: {
            labels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' }
                }
              }
            }
          }
        }
      }
    };

    const data = {
      discoveryPolicy:
        '{"labels":"[{\\"key\\":\\"sports\\"},{\\"key\\":\\"news\\"}]"}'
    };

    const result = validator.coerceDataBySchema(data, nestedSchema);

    expect(result).toEqual({
      discoveryPolicy: {
        labels: [{ key: 'sports' }, { key: 'news' }]
      }
    });
  });

  it('should keep original string when parsing fails', () => {
    const objectSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    };

    const data = '{"id":"abc"';
    const result = validator.coerceDataBySchema(data, objectSchema);

    expect(result).toEqual(data);
  });

  it('should keep strings unchanged for non-object and non-array schema types', () => {
    const result = validator.coerceDataBySchema('123', { type: 'string' });
    expect(result).toEqual('123');
  });
});
