const uuidPattern = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

const uuid = {
  id: '/UUID',
  type: 'string',
  pattern: uuidPattern
};

const confidence = {
  id: '/Confidence',
  type: 'number',
  minimum: 0,
  maximum: 1
};

const coords = {
  id: '/Coords',
  type: 'object',
  properties: {
    x: {
      $ref: '/Confidence'
    },
    y: {
      $ref: '/Confidence'
    }
  }
};

const gps = {
  id: '/GPS',
  type: 'object',
  properties: {
    latitude: {
      type: 'number'
    },
    longitude: {
      type: 'number'
    },
    precision: {
      type: 'number'
    },
    direction: {
      type: 'number',
      minimum: 0,
      maximum: 360
    },
    velocity: {
      type: 'number'
    },
    altitude: {
      type: 'number'
    }
  }
};

const tag = {
  id: '/Tag',
  type: 'object',
  properties: {
    key: {
      type: 'string'
    },
    value: {
      type: 'string'
    }
  },
  required: ['key', 'value']
};

const word = {
  id: '/Word',
  type: 'object',
  properties: {
    word: {
      type: 'string'
    },
    confidence: {
      $ref: '/Confidence'
    },
    bestPath: {
      type: 'boolean'
    },
    utteranceLength: {
      type: 'number',
      minimum: 1
    }
  },
  required: ['word']
};

const attribute = {
  id: '/Attribute',
  type: 'object',
  properties: {
    attribute: {
      type: 'string'
    },
    score: {
      type: 'number'
    },
    confidence: {
      $ref: '/Confidence'
    }
  }
};

const sentiment = {
  id: '/Sentiment',
  type: 'object',
  properties: {
    positiveValue: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    positiveConfidence: {
      $ref: '/Confidence'
    },
    negativeValue: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    negativeConfidence: {
      $ref: '/Confidence'
    }
  },
  anyOf: [{ required: ['positiveValue'] }, { required: ['negativeValue'] }],
  additionalProperties: false,
  dependencies: {
    positiveConfidence: {
      required: ['positiveValue']
    },
    negativeConfidence: {
      required: ['negativeValue']
    }
  }
};

const object = {
  id: '/Object',
  type: 'object',
  properties: {
    label: {
      type: 'string'
    },
    type: {
      type: 'string',
      enum: [
        'object',
        'face',
        'library_entity',
        'license_plate',
        'speaker_id',
        'sound_id',
        'facial-features',
        'licensePlate',
        'logo',
        'speaker',
        'sound',
        'concept',
        'keyword',
        'text',
        'namedEntity',
        'face-verification',
        'speaker-verification'
      ]
    },
    uri: {
      type: 'string',
      format: 'uri'
      // TODO validate url string
    },
    confidence: {
      $ref: '/Confidence'
    },
    text: {
      type: 'string'
    },
    gender: {
      type: 'object',
      properties: {
        gender: {
          type: 'string'
        },
        confidence: {
          $ref: '/Confidence'
        }
      }
    },
    emotions: {
      type: 'array'
    },
    age: {
      type: 'object',
      properties: {
        min: {
          type: 'integer',
          minimum: 0
        },
        max: {
          type: 'integer',
          minimum: 0
        },
        confidence: {
          $ref: '/Confidence'
        }
      }
    },
    faceLandmarks: {
      type: 'array'
      //TODO Facelandmark
    },
    objectCategory: {
      type: 'array'
      //TODO
    },
    region: {
      type: 'string',
      enum: ['left', 'right', 'top', 'bottom']
    },
    boundingPoly: {
      type: 'array',
      items: '/Coords'
    },
    gps: {
      type: 'array',
      items: '/GPS'
    },
    attributes: {
      type: 'array',
      items: '/Attribute'
    },
    structuredData: {
      type: 'object',
      properties: {
        [uuidPattern]: {
          type: 'object',
          minProperties: 2,
          maxProperties: 2
        }
      }
    },
    vendor: {
      type: 'object'
    },
    referenceId: {
      description: 'Unique identifier of the vector',
      type: 'string'
    },
    fingerprintVector: {
      $ref: '/Vector'
    },
    tags: {
      type: 'array',
      items: {
        $ref: '/Tag'
      }
    },
    sentence: {
      description: 'The number of the sentence',
      type: 'integer'
    },
    sentiment: {
      $ref: '/Sentiment'
    }
  },
  required: ['label']
};

const series = {
  id: '/Series',
  type: 'object',
  properties: {
    startTimeMs: {
      type: 'integer',
      minimum: 0
    },
    stopTimeMs: {
      type: 'integer',
      minimum: 0
    },
    tags: {
      type: 'array',
      items: {
        $ref: '/Tag'
      }
    },
    language: {
      type: 'string'
    },
    speakerId: {
      type: 'string'
    },
    words: {
      type: 'array',
      items: {
        $ref: '/Word'
      }
    },
    sentiment: {
      $ref: '/Sentiment'
    },
    entityId: {
      $ref: '/UUID'
    },
    libraryId: {
      $ref: '/UUID'
    },
    object: {
      $ref: '/Object'
    },
    gps: {
      type: 'array',
      items: '/GPS'
    },
    vendor: {
      type: 'object'
    },
    referenceId: {
      description: 'Unique identifier of the vector',
      type: 'string'
    }
  },
  required: ['startTimeMs', 'stopTimeMs']
};

const vector = {
  id: '/Vector',
  description: 'An array of floats representing objects in vector space',
  type: 'array',
  items: {
    type: 'number'
  }
};

const engineOutput = {
  id: '/EngineOutput',
  type: 'Object',
  properties: {
    schemaId: {
      type: 'string'
    },
    sourceEngineId: {
      type: 'string'
    },
    sourceEngineName: {
      type: 'string'
    },
    taskPayload: {
      type: 'object'
    },
    taskId: {
      $ref: '/UUID'
    },
    generatedDateUtc: {
      type: 'string',
      format: 'date-time'
    },
    externalSourceId: {
      type: 'string'
    },
    validationContracts: {
      type: 'array',
      items: {
        type: 'string'
      }
    },
    tags: {
      type: 'array',
      items: '/Tag'
    },
    language: {
      type: 'string'
    },
    entityId: {
      $ref: '/UUID'
    },
    libraryId: {
      $ref: '/UUID'
    },
    sentiment: {
      $ref: '/Sentiment'
    },
    gps: {
      type: 'array',
      items: '/GPS'
    },
    object: {
      type: 'array',
      items: {
        $ref: '/Object'
      }
    },
    vendor: {
      type: 'object'
    },
    series: {
      type: 'array',
      items: {
        $ref: '/Series'
      }
    },
    internalTaskId: {
      $ref: '/UUID'
    },
    embedding: {
      description: 'An array of floats representing objects in vector space',
      type: 'array',
      items: {
        type: 'object',
        properties: {
          referenceId: {
            description: 'Unique identifier of the vector',
            type: 'string'
          },
          vector: {
            $ref: '/Vector'
          },
          tags: {
            type: 'array',
            items: {
              $ref: '/Tag'
            }
          }
        }
      }
    }
  }
};

module.exports = {
  uuid,
  confidence,
  coords,
  gps,
  tag,
  word,
  vector,
  object,
  series,
  attribute,
  engineOutput,
  sentiment
};
