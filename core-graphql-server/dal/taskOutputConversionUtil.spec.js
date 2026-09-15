const util = require('./taskOutputConversionUtil.js')();
const assert = require('chai').assert; //('assert');
const chaiExpect = require('chai').expect; // require('expect.js');
const InvalidInput = require('../error')({}).InvalidInput;

describe('taskOutputConversionUtil', function () {
  it('should convert object task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5000,
            end: 8000,
            found: 'newsreader',
            salience: 0.9,
            boundingBox: {
              top: 10,
              left: 100,
              width: 800,
              height: 80,
              imageWidth: 1000,
              imageHeight: 100
            }
          },
          {
            start: 0,
            end: 3000,
            found: 'candybar',
            salience: 0.9999
          }
        ]
      }
    };
    const engine = {
      name: 'object recognition engine',
      id: 'engineId',
      categoryId: '088a31be-9bd6-4628-a6f0-e4004e362ea0'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object).to.be.an('object');
    chaiExpect(actualSerieItem1.object.type).to.equal('object');
    chaiExpect(actualSerieItem1.object.label).to.equal('candybar');
    chaiExpect(actualSerieItem1.object.confidence).to.equal(0.9999);
    chaiExpect(actualSerieItem1.object.objectCategory).to.be.an('array');
    chaiExpect(actualSerieItem1.object.objectCategory.length).to.equal(1);
    chaiExpect(actualSerieItem1.object.objectCategory[0].class).to.equal(
      'candybar'
    );

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.object).to.be.an('object');
    chaiExpect(actualSerieItem2.object.type).to.equal('object');
    chaiExpect(actualSerieItem2.object.label).to.equal('newsreader');
    chaiExpect(actualSerieItem2.object.confidence).to.equal(0.9);
    chaiExpect(actualSerieItem2.object.objectCategory).to.be.an('array');
    chaiExpect(actualSerieItem2.object.objectCategory.length).to.equal(1);
    chaiExpect(actualSerieItem2.object.objectCategory[0].class).to.equal(
      'newsreader'
    );
    chaiExpect(actualSerieItem2.object.boundingPoly).to.be.an('array');
    chaiExpect(actualSerieItem2.object.boundingPoly.length).to.equal(4);
    chaiExpect(actualSerieItem2.object.boundingPoly[0].x).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[0].y).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[1].x).to.equal(0.9);
    chaiExpect(actualSerieItem2.object.boundingPoly[1].y).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[2].x).to.equal(0.9);
    chaiExpect(actualSerieItem2.object.boundingPoly[2].y).to.equal(0.9);
    chaiExpect(actualSerieItem2.object.boundingPoly[3].x).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[3].y).to.equal(0.9);
  });

  it('should convert sentiment tast output series to engine sorted output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5000,
            end: 8000,
            score: 0.86
          },
          {
            start: 0,
            end: 3000,
            score: 0.5
          }
        ]
      }
    };
    const engine = {
      name: 'sentiment recognition engine',
      id: 'engineId',
      categoryId: 'f2554098-f14b-4d81-9be1-41d0f992a22f'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.sentiment).to.be.an('object');
    chaiExpect(actualSerieItem1.sentiment.positiveValue).to.equal(0.5);
    chaiExpect(actualSerieItem1.sentiment.positiveConfidence).to.equal(1);

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.sentiment).to.be.an('object');
    chaiExpect(actualSerieItem2.sentiment.positiveValue).to.equal(0.86);
    chaiExpect(actualSerieItem2.sentiment.positiveConfidence).to.equal(1);
  });

  it('should convert face recognition task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5000,
            end: 8000,
            entityId: 'entityId2',
            libraryId: 'libraryId',
            confidence: 99.72,
            boundingBox: {
              top: 10,
              left: 100,
              width: 800,
              height: 80,
              imageWidth: 1000,
              imageHeight: 100
            }
          },
          {
            start: 0,
            end: 3000,
            entityId: 'entityId1',
            libraryId: 'libraryId',
            confidence: 97.72
          }
        ]
      }
    };
    const engine = {
      name: 'face recognition engine',
      id: 'engineId',
      categoryId: '6faad6b7-0837-45f9-b161-2f6bf31b7a07'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object).to.be.an('object');
    chaiExpect(actualSerieItem1.object.type).to.equal('face');
    chaiExpect(actualSerieItem1.object.entityId).to.equal('entityId1');
    chaiExpect(actualSerieItem1.object.libraryId).to.equal('libraryId');
    chaiExpect(actualSerieItem1.object.confidence).to.equal(0.9772);

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.object).to.be.an('object');
    chaiExpect(actualSerieItem2.object.type).to.equal('face');
    chaiExpect(actualSerieItem2.object.entityId).to.equal('entityId2');
    chaiExpect(actualSerieItem2.object.libraryId).to.equal('libraryId');
    chaiExpect(actualSerieItem2.object.confidence).to.equal(0.9972);
    chaiExpect(actualSerieItem2.object.boundingPoly).to.be.an('array');
    chaiExpect(actualSerieItem2.object.boundingPoly.length).to.equal(4);
    chaiExpect(actualSerieItem2.object.boundingPoly[0].x).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[0].y).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[1].x).to.equal(0.9);
    chaiExpect(actualSerieItem2.object.boundingPoly[1].y).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[2].x).to.equal(0.9);
    chaiExpect(actualSerieItem2.object.boundingPoly[2].y).to.equal(0.9);
    chaiExpect(actualSerieItem2.object.boundingPoly[3].x).to.equal(0.1);
    chaiExpect(actualSerieItem2.object.boundingPoly[3].y).to.equal(0.9);
  });

  it('should convert face detection task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5000,
            end: 8000,
            originalImage: 'veritone/originalImage2.png'
          },
          {
            start: 0,
            end: 3000,
            originalImage: 'veritone/originalImage1.png',
            boundingPoly: [
              {
                x: 0.1,
                y: 0.2
              },
              {
                x: 0.3,
                y: 0.4
              },
              {
                x: 0.5,
                y: 0.6
              },
              {
                x: 0.7,
                y: 0.8
              }
            ]
          }
        ]
      }
    };
    const engine = {
      name: 'face detection engine',
      id: 'engineId',
      categoryId: '6faad6b7-0837-45f9-b161-2f6bf31b7a07'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object).to.be.an('object');
    chaiExpect(actualSerieItem1.object.type).to.equal('face');
    chaiExpect(actualSerieItem1.object.uri).to.equal(
      'veritone/originalImage1.png'
    );
    chaiExpect(actualSerieItem1.object.boundingPoly).to.be.an('array');
    chaiExpect(actualSerieItem1.object.boundingPoly.length).to.equal(4);
    chaiExpect(actualSerieItem1.object.boundingPoly[0].x).to.equal(0.1);
    chaiExpect(actualSerieItem1.object.boundingPoly[0].y).to.equal(0.2);
    chaiExpect(actualSerieItem1.object.boundingPoly[1].x).to.equal(0.3);
    chaiExpect(actualSerieItem1.object.boundingPoly[1].y).to.equal(0.4);
    chaiExpect(actualSerieItem1.object.boundingPoly[2].x).to.equal(0.5);
    chaiExpect(actualSerieItem1.object.boundingPoly[2].y).to.equal(0.6);
    chaiExpect(actualSerieItem1.object.boundingPoly[3].x).to.equal(0.7);
    chaiExpect(actualSerieItem1.object.boundingPoly[3].y).to.equal(0.8);

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.object).to.be.an('object');
    chaiExpect(actualSerieItem2.object.type).to.equal('face');
    chaiExpect(actualSerieItem2.object.uri).to.equal(
      'veritone/originalImage2.png'
    );
  });

  it('should convert translation task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        French: 'Dans la dernière semaine',
        Meow: 'In der letzten Woche haben'
      }
    };
    const engine = {
      name: 'translation engine',
      id: 'engineId',
      categoryId: '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923'
    };

    const startOffsetMs = 1000,
      stopOffsetMs = 5000;
    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine,
      startOffsetMs,
      stopOffsetMs
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(startOffsetMs);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(stopOffsetMs);
    chaiExpect(actualSerieItem1.language).to.equal('fr');
    chaiExpect(actualSerieItem1.words).to.be.an('array');
    chaiExpect(actualSerieItem1.words[0].word).to.equal(
      'Dans la dernière semaine'
    );
    chaiExpect(actualSerieItem1.words[0].confidence).to.equal(1);

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(startOffsetMs);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(stopOffsetMs);
    chaiExpect(actualSerieItem2.language).to.equal('Meow');
    chaiExpect(actualSerieItem2.words).to.be.an('array');
    chaiExpect(actualSerieItem2.words[0].word).to.equal(
      'In der letzten Woche haben'
    );
    chaiExpect(actualSerieItem2.words[0].confidence).to.equal(1);
  });

  it('should convert ocr task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5000,
            end: 8000,
            ocrtext: 'matata'
          },
          {
            start: 0,
            end: 3000,
            ocrtext: 'hakuna'
          }
        ]
      }
    };
    const engine = {
      name: 'text recognition engine',
      id: 'engineId',
      categoryId: '3b4ac603-9bfa-49d3-96b3-25ca3b502325'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object).to.be.an('object');
    chaiExpect(actualSerieItem1.object.text).to.equal('hakuna');

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.object).to.be.an('object');
    chaiExpect(actualSerieItem2.object.text).to.equal('matata');
  });

  it('should convert logo task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5000,
            end: 8000,
            found: 'logo2',
            salience: 0.24
          },
          {
            start: 0,
            end: 3000,
            found: 'logo1',
            salience: 0.3
          }
        ]
      }
    };
    const engine = {
      name: 'logo recognition engine',
      id: 'engineId',
      categoryId: '5a511c83-2cbd-4f2d-927e-cd03803a8a9c'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object).to.be.an('object');
    chaiExpect(actualSerieItem1.object.label).to.equal('logo1');
    chaiExpect(actualSerieItem1.object.confidence).to.be.an('number');
    chaiExpect(actualSerieItem1.object.confidence).to.equal(0.3);

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.object).to.be.an('object');
    chaiExpect(actualSerieItem2.object.label).to.equal('logo2');
    chaiExpect(actualSerieItem2.object.confidence).to.be.an('number');
    chaiExpect(actualSerieItem2.object.confidence).to.equal(0.24);
  });

  it('should convert fingerprint task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5000,
            end: 5001,
            durationMs: 3000,
            entityId: 'entityId_2',
            libraryId: 'libraryId'
          },
          {
            start: 0,
            end: 3000,
            entityId: 'entityId_1',
            libraryId: 'libraryId'
          }
        ]
      }
    };
    const engine = {
      name: 'fingerprint recognition engine',
      id: 'engineId',
      categoryId: '17d62b84-8b49-465b-a6be-fe3ea3bc8f05'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object).to.be.an('object');
    chaiExpect(actualSerieItem1.object.type).to.equal('fingerprint');
    chaiExpect(actualSerieItem1.object.entityId).to.equal('entityId_1');
    chaiExpect(actualSerieItem1.object.libraryId).to.equal('libraryId');

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.object).to.be.an('object');
    chaiExpect(actualSerieItem2.object.type).to.equal('fingerprint');
    chaiExpect(actualSerieItem2.object.entityId).to.equal('entityId_2');
    chaiExpect(actualSerieItem2.object.libraryId).to.equal('libraryId');
  });

  it('should convert geo task output series to sorted engine output series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 5,
            end: 8,
            location: '42.166,-88.3446'
          },
          {
            start: 0,
            end: 3,
            location: '42.165,-88.3445'
          }
        ]
      }
    };
    const engine = {
      name: 'geolocation engine',
      id: 'engineId',
      categoryId: '203ad7c2-3dbd-45f9-95a6-855f911563d0'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(2);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object.gps).to.be.an('array');
    chaiExpect(actualSerieItem1.object.gps.length).to.equal(1);
    chaiExpect(actualSerieItem1.object.gps[0].latitude).to.be.an('number');
    chaiExpect(actualSerieItem1.object.gps[0].latitude).to.equal(42.165);
    chaiExpect(actualSerieItem1.object.gps[0].longitude).to.be.an('number');
    chaiExpect(actualSerieItem1.object.gps[0].longitude).to.equal(-88.3445);

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.object.gps).to.be.an('array');
    chaiExpect(actualSerieItem2.object.gps.length).to.equal(1);
    chaiExpect(actualSerieItem2.object.gps[0].latitude).to.be.an('number');
    chaiExpect(actualSerieItem2.object.gps[0].latitude).to.equal(42.166);
    chaiExpect(actualSerieItem2.object.gps[0].longitude).to.be.an('number');
    chaiExpect(actualSerieItem2.object.gps[0].longitude).to.equal(-88.3446);
  });

  it('should fail to call converter for transcript ttml snippets', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId'
    };
    const engine = {
      name: 'transcript engine',
      id: 'engineId',
      categoryId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
    };
    chaiExpect(function foo() {
      util.convertTaskOutputToStandardOutput(task, engine);
    }).to.throw(InvalidInput);
  });

  it('should convert transcript ttml snippets to sorted engine output series', function () {
    const TRANSCRIPT_ENGINE_CATEGORY_ID =
      '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
    const transcriptJsonSnippets = [
      {
        start: 5,
        end: 8,
        text: 'text 2'
      },
      {
        start: 0,
        end: 3,
        text: 'text 1'
      }
    ];
    const converter =
      util.taskOutputSeriesConverterByEngineCategoryId[
        TRANSCRIPT_ENGINE_CATEGORY_ID
      ];

    const actualSeries = converter(transcriptJsonSnippets, 'transcript');
    chaiExpect(actualSeries.length).to.equal(2);

    const actualSerieItem1 = actualSeries[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.words.length).to.equal(1);
    chaiExpect(actualSerieItem1.words[0].word).to.equal('text 1');

    const actualSerieItem2 = actualSeries[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.words.length).to.equal(1);
    chaiExpect(actualSerieItem2.words[0].word).to.equal('text 2');
  });

  it('should convert transcript vlf snippets to sorted engine output series', function () {
    const TRANSCRIPT_ENGINE_CATEGORY_ID =
      '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
    const vlfJsonSnippets = [
      {
        startTimeMs: 5000,
        stopTimeMs: 8000,
        words: [
          {
            bestPathForward: true,
            bestPathBackward: true,
            word: 'word_2',
            confidence: 934
          },
          {
            bestPathForward: false,
            bestPathBackward: false,
            word: 'word_2_1',
            confidence: 46
          }
        ]
      },
      {
        startTimeMs: 0,
        stopTimeMs: 3000,
        words: [
          {
            bestPathForward: true,
            bestPathBackward: true,
            word: 'word_1',
            confidence: 934
          }
        ]
      }
    ];
    const converter =
      util.taskOutputSeriesConverterByEngineCategoryId[
        TRANSCRIPT_ENGINE_CATEGORY_ID
      ];

    const actualSeries = converter(vlfJsonSnippets, 'v-vlf');
    chaiExpect(actualSeries.length).to.equal(2);

    const actualSerieItem1 = actualSeries[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.words.length).to.equal(1);
    chaiExpect(actualSerieItem1.words[0].word).to.equal('word_1');
    chaiExpect(actualSerieItem1.words[0].confidence).to.equal(0.934);
    chaiExpect(actualSerieItem1.words[0].bestPath).to.equal(true);

    const actualSerieItem2 = actualSeries[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(5000);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(8000);
    chaiExpect(actualSerieItem2.words.length).to.equal(2);
    chaiExpect(actualSerieItem2.words[0].word).to.equal('word_2');
    chaiExpect(actualSerieItem2.words[0].confidence).to.equal(0.934);
    chaiExpect(actualSerieItem2.words[0].bestPath).to.equal(true);
    chaiExpect(actualSerieItem2.words[1].word).to.equal('word_2_1');
    chaiExpect(actualSerieItem2.words[1].confidence).to.equal(0.046);
  });

  it('should keep sorted order for series', function () {
    const task = {
      id: 'taskId',
      engineId: 'engineId',
      output: {
        series: [
          {
            start: 0,
            end: 3000,
            ocrtext: 'keep'
          },
          {
            start: 0,
            end: 3000,
            ocrtext: 'the'
          },
          {
            start: 0,
            end: 3000,
            ocrtext: 'order'
          }
        ]
      }
    };
    const engine = {
      name: 'text recognition engine',
      id: 'engineId',
      categoryId: '3b4ac603-9bfa-49d3-96b3-25ca3b502325'
    };

    const actualEngineOutput = util.convertTaskOutputToStandardOutput(
      task,
      engine
    );
    chaiExpect(actualEngineOutput.taskId).to.equal(task.id);
    chaiExpect(actualEngineOutput.sourceEngineId).to.equal(task.engineId);
    chaiExpect(actualEngineOutput.sourceEngineName).to.equal(engine.name);
    chaiExpect(actualEngineOutput.series).to.be.an('array');
    chaiExpect(actualEngineOutput.series.length).to.equal(3);

    const actualSerieItem1 = actualEngineOutput.series[0];
    chaiExpect(actualSerieItem1.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem1.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem1.object).to.be.an('object');
    chaiExpect(actualSerieItem1.object.text).to.equal('keep');

    const actualSerieItem2 = actualEngineOutput.series[1];
    chaiExpect(actualSerieItem2.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem2.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem2.object).to.be.an('object');
    chaiExpect(actualSerieItem2.object.text).to.equal('the');

    const actualSerieItem3 = actualEngineOutput.series[2];
    chaiExpect(actualSerieItem3.startTimeMs).to.equal(0);
    chaiExpect(actualSerieItem3.stopTimeMs).to.equal(3000);
    chaiExpect(actualSerieItem3.object).to.be.an('object');
    chaiExpect(actualSerieItem3.object.text).to.equal('order');
  });
});
