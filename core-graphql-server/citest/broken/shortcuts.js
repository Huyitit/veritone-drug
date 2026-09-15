const fs = require('fs');
const helpers = require('./helpers/index');

const config = helpers.config;

const env = config.env;



describe('Search', () => {

  const url = `${config.tools_url}/engine/validate`;

  it('should reject an invalid validation contract', () => {
    const transcriptEngineOutput = `{
      "schemaId": "https://docs.veritone.com/schemas/vtn-standard/transcript.json",
      "validationContracts": [
        "unknownEngineCategory"
      ],
      "series": [
        {
          "startTimeMs": 0,
          "stopTimeMs": 300,
          "words": [
            {
              "word": "this",
              "confidence": 1
            }
          ]
        },
        {
          "startTimeMs": 300,
          "stopTimeMs": 500,
          "words": [
            {
              "word": "is"
            }
          ]
        },
        {
          "startTimeMs": 500,
          "stopTimeMs": 800,
          "words": [
            {
              "word": "a"
            }
          ]
        },
        {
          "startTimeMs": 800,
          "stopTimeMs": 1200,
          "words": [
            {
              "word": "sentence"
            }
          ]
        }
      ]
    }
    `;

    const response = chakram
      .post(url, transcriptEngineOutput)
      .then(response => {
        expect(response.statusCode).to.have.status(400);
        helpers.expect(response.body.data, 'response.body.data').to.be
  
        expect(response.body.errors).to.not.be.null;
        expect(response.body.errors.length).to.be.greaterThan(0);
      });
  });

  it('should validate a transcript engine output', () => {
    const transcriptEngineOutput = `{
      "schemaId": "https://docs.veritone.com/schemas/vtn-standard/transcript.json",
      "validationContracts": [
        "transcript"
      ],
      "series": [
        {
          "startTimeMs": 0,
          "stopTimeMs": 300,
          "words": [
            {
              "word": "this",
              "confidence": 1
            }
          ]
        },
        {
          "startTimeMs": 300,
          "stopTimeMs": 500,
          "words": [
            {
              "word": "is"
            }
          ]
        },
        {
          "startTimeMs": 500,
          "stopTimeMs": 800,
          "words": [
            {
              "word": "a"
            }
          ]
        },
        {
          "startTimeMs": 800,
          "stopTimeMs": 1200,
          "words": [
            {
              "word": "sentence"
            }
          ]
        }
      ]
    }
    `;

    const response = chakram
      .post(url, transcriptEngineOutput)
      .then(response => {
        
        expect(response.body.data.processed).to.not.be.null;
        expect(response.body.data.valid).to.be.true;
        expect(response.body.errors).to.be.null;
      });
  });

  it('should not validate am invalid transcript engine output', () => {
    const transcriptEngineOutput = `{
      "schemaId": "https://docs.veritone.com/schemas/vtn-standard/transcript.json",
      "validationContracts": [
        "transcript"
      ],
      "series": [
        {
          "startTimeMs": 0,
          "stopTimeMs": 300,
          "words": [
            {
              "word": "this",
              "confidence": 1
            }
          ]
        },
        {
          "startTimeMs": 300,
          "stopTimeMs": 500,
          "words": [
            {
              "word": "is"
            }
          ]
        },
        {
          "startTimeMs": 500,
          "stopTimeMs": 800,
          "words": [
            {
              "word": -1
            }
          ]
        },
        {
          "startTimeMs": 800,
          "stopTimeMs": 1200,
          "words": [
            {
              "word": "sentence"
            }
          ]
        }
      ]
    }
    `;

    const response = chakram
      .post(url, transcriptEngineOutput)
      .then(response => {
        expect(response.statusCode).to.have.status(400);
        expect(response.body.errors).to.not.be.null;
        expect(response.body.errors.length).to.be.greaterThan(0);
      });
  });
});
