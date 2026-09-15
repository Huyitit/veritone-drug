module.exports = function createFunction(config) {
  const errors = require('../error')(config);
  const languageUtil = require('./languageUtil.js')();
  const _ = require('lodash');

  const TRANSCRIPT_ENGINE_CATEGORY_ID = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

  /**
   * Converts task.output series to engine output.
   * Does not support transcript asset task - use converter directly.
   * @param task with output
   * @param engine with categoryId to find converter
   * @param startOffsetMs to set on series item if start value is missing on task output series
   * @param stopOffsetMs to set on series item if end value is missing on task output series
   * @throws InvalidInput when passed transcription engine.
   * @returns {*}
   */
  function convertTaskOutputToStandardOutput(
    task,
    engine,
    startOffsetMs,
    stopOffsetMs
  ) {
    if (
      (task.engineId !== engine.id && task.engineId !== engine.internalId) ||
      !engine.categoryId ||
      !taskOutputSeriesConverterByEngineCategoryId[engine.categoryId]
    ) {
      console.warn('No series converter for task ' + task.taskId);
      return;
    }
    if (engine.categoryId === TRANSCRIPT_ENGINE_CATEGORY_ID) {
      throw new errors.InvalidInput({
        message: 'To convert transcript asset - use converter directly',
        data: {
          value: TRANSCRIPT_ENGINE_CATEGORY_ID,
          field: 'categoryId'
        }
      });
    }
    const seriesConverter =
      taskOutputSeriesConverterByEngineCategoryId[engine.categoryId];
    const standardOutput = {
      tdoId: task.targetId,
      taskId: task.id,
      modifiedDateTime: task.modifiedDateTime,
      sourceEngineId: task.engineId,
      sourceEngineName: engine.name
    };
    const standardOutputSeries = seriesConverter(
      task,
      startOffsetMs,
      stopOffsetMs
    );
    // accumulate result even if series is empty. Empty series means no data for requested date range
    if (standardOutputSeries) {
      standardOutput.series = standardOutputSeries;
    }
    return standardOutput;
  }

  /**
   * Task output series and transcript ttml snippet conversion functions per engine category id.
   * @type {*} converter function
   */
  const taskOutputSeriesConverterByEngineCategoryId = {
    '088a31be-9bd6-4628-a6f0-e4004e362ea0': function objectTaskSeries(task) {
      /* Converting
      {
        "end": 20000,
        "found": "newsreader",
        "start": 0,
        "salience": 0.9074386358261108
      }*/
      const outputSeries = [];
      task.output.series.forEach((item) => {
        const newSeriesItem = {
          startTimeMs: item.start,
          stopTimeMs: item.end,
          object: {
            label: item.found,
            type: 'object',
            confidence: item.salience,
            objectCategory: [
              {
                class: item.found
              }
            ]
          }
        };
        if (item.boundingPoly && Array.isArray(item.boundingPoly)) {
          newSeriesItem.object.boundingPoly = item.boundingPoly;
        } else if (item.boundingBox) {
          newSeriesItem.object.boundingPoly = boundingBoxToPoly(
            item.boundingBox
          );
        }
        outputSeries.push(newSeriesItem);
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    'f2554098-f14b-4d81-9be1-41d0f992a22f': function sentimentTaskSeries(task) {
      /* Converting
      {
        "end": 6080,
        "score": 0.86,
        "start": 950
      }*/
      const outputSeries = [];
      task.output.series.forEach((item) => {
        outputSeries.push({
          startTimeMs: item.start,
          stopTimeMs: item.end,
          sentiment: {
            positiveValue: item.score,
            positiveConfidence: 1
          }
        });
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    '6faad6b7-0837-45f9-b161-2f6bf31b7a07': function faceTaskSeries(task) {
      /*
        Face Detection
        {
          "end": 17200,
          "start": 9800,
          "status": "pending",
          "faceSetId": "c8b470d9-324a-48b3-bdd1-b8b225d67673",
          "originalImage": "aedae542-97d0-46f1-89f9-48df4ba0ace2/52108807/b368891c-1d1e-4f10-99d2-48805d86cf48/setId-0_frame-294.png",
          "trainingImage": "aedae542-97d0-46f1-89f9-48df4ba0ace2/52108807/b368891c-1d1e-4f10-99d2-48805d86cf48/setId-0_frame-294_train.png"
        },
        Face Recognition
        {
          "end": 53000,
          "start": 52000,
          "entityId": "11a14999-0531-4d3e-9a44-68cdd4f93659",
          "libraryId": "13e6f4a3-0d5c-4e11-9a30-913e981cb9ad",
          "confidence": 97.72560119628906,
          "similarity": 95.474365234375,
          "boundingBox": {
          "top": 119.00000095367432,
          "left": 482.99999237060547,
          "width": 131.00000381469727,
          "height": 132.00000286102295,
          "imageWidth": 1280,
          "imageHeight": 720,
          "externalImageId": "11a14999-0531-4d3e-9a44-68cdd4f93659_351a7b0c-e82d-4467-abd9-65cfaf0c550d",
          "entityIdentifierId": "351a7b0c-e82d-4467-abd9-65cfaf0c550d"
        }
       */
      const outputSeries = [];
      task.output.series.forEach((item) => {
        const newSeriesItem = {
          startTimeMs: item.start,
          stopTimeMs: item.end,
          object: {
            type: 'face'
          }
        };
        if (Object.prototype.hasOwnProperty.call(item, 'originalImage')) {
          newSeriesItem.object.uri = item.originalImage;
        } else if (Object.prototype.hasOwnProperty.call(item, 'sourceUri')) {
          // Some newer engines will use sourceUri instead of originalImage
          newSeriesItem.object.uri = item.sourceUri;
        }
        if (Object.prototype.hasOwnProperty.call(item, 'entityId')) {
          newSeriesItem.object.entityId = item.entityId;
        }
        if (Object.prototype.hasOwnProperty.call(item, 'libraryId')) {
          newSeriesItem.object.libraryId = item.libraryId;
        }
        if (Object.prototype.hasOwnProperty.call(item, 'confidence')) {
          let confidenceValue = item.confidence;
          if (confidenceValue > 1) {
            confidenceValue /= 100;
          }
          newSeriesItem.object.confidence = confidenceValue;
        }
        if (item.boundingPoly && Array.isArray(item.boundingPoly)) {
          newSeriesItem.object.boundingPoly = item.boundingPoly;
        } else if (item.boundingBox) {
          newSeriesItem.object.boundingPoly = boundingBoxToPoly(
            item.boundingBox
          );
        }
        outputSeries.push(newSeriesItem);
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923': function translationTaskSeries(
      task,
      startTimeMs,
      stopTimeMs
    ) {
      /* Converting
      task.output {
        "French": "Dans la dernière semaine",
        "German": "In der letzten Woche haben"
      }
      */
      const outputSeries = [];
      for (let languageKey in task.output) {
        if (
          Object.prototype.hasOwnProperty.call(task.output, languageKey) &&
          task.output[languageKey] &&
          typeof task.output[languageKey] === 'string'
        ) {
          const language =
            languageUtil.languageStringToIsoCode(languageKey) || languageKey;
          outputSeries.push({
            startTimeMs: startTimeMs,
            stopTimeMs: stopTimeMs,
            language: language,
            words: [
              {
                word: task.output[languageKey],
                confidence: 1
              }
            ]
          });
        }
      }
      return outputSeries;
    },
    '3b4ac603-9bfa-49d3-96b3-25ca3b502325': function ocrTaskSeries(task) {
      /* Converting
        {
        "end": 2000,
        "start": 1000,
        "ocrtext": "mR H|79° L064” 9-07A"
        }
       */
      const outputSeries = [];
      task.output.series.forEach((item) => {
        const newSeriesItem = {
          startTimeMs: item.start,
          stopTimeMs: item.end,
          object: {
            text: item.ocrtext
          }
        };
        if (item.boundingPoly && Array.isArray(item.boundingPoly)) {
          newSeriesItem.object.boundingPoly = item.boundingPoly;
        } else if (item.boundingBox) {
          newSeriesItem.object.boundingPoly = boundingBoxToPoly(
            item.boundingBox
          );
        }
        outputSeries.push(newSeriesItem);
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    '5a511c83-2cbd-4f2d-927e-cd03803a8a9c': function logoTaskSeries(task) {
      /* Converting
        {
        "end": 16000,
        "found": "President of the United States",
        "start": 11000,
        "salience": 0.2406960129737854
        }
       */
      const outputSeries = [];
      task.output.series.forEach((item) => {
        const newSeriesItem = {
          startTimeMs: item.start,
          stopTimeMs: item.end,
          object: {
            label: item.found,
            confidence: item.salience
          }
        };
        if (item.boundingPoly && Array.isArray(item.boundingPoly)) {
          newSeriesItem.object.boundingPoly = item.boundingPoly;
        } else if (item.boundingBox) {
          newSeriesItem.object.boundingPoly = boundingBoxToPoly(
            item.boundingBox
          );
        }
        outputSeries.push(newSeriesItem);
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    '17d62b84-8b49-465b-a6be-fe3ea3bc8f05': function fingerprintTaskSeries(
      task
    ) {
      /* Converting
        {
        "end": 817001,
        "score": 0.002928053541550474,
        "start": 817000,
        "entityId": "e4f95344-622b-42bb-8e82-514d96d2df88",
        "libraryId": "0fb79432-dcb1-40b0-bb6a-3f7e481aae3e",
        "durationMs": 28000,
        "entityIdentifierId": "b123077a-af75-4cc7-b7f0-79a645cddcc0"
        }
       */
      const outputSeries = [];
      task.output.series.forEach((item) => {
        const newSeriesItem = {
          object: {
            type: 'fingerprint',
            entityId: item.entityId,
            libraryId: item.libraryId,
            confidence: item.score
          }
        };
        const durationMs = parseInt(item.durationMs);
        const startTimeMs = parseInt(item.start);
        let stopTimeMs = parseInt(item.end);
        if (durationMs && stopTimeMs - startTimeMs <= 1) {
          stopTimeMs = startTimeMs + durationMs;
        }
        newSeriesItem.startTimeMs = startTimeMs;
        newSeriesItem.stopTimeMs = stopTimeMs;
        outputSeries.push(newSeriesItem);
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    '203ad7c2-3dbd-45f9-95a6-855f911563d0': function geoTaskSeries(task) {
      /* Converting
        {
        "start": 0,
        "end": 5,
        "location": "42.165,-88.3445"
        }
       */
      const outputSeries = [];
      task.output.series.forEach((item) => {
        if (!item.location) {
          return;
        }
        const coordinates = item.location.split(',');
        outputSeries.push({
          startTimeMs: item.start * 1000,
          stopTimeMs: item.end * 1000,
          object: {
            gps: [
              {
                latitude: Number(coordinates[0]),
                longitude: Number(coordinates[1])
              }
            ]
          }
        });
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    '67cd4dd0-2f75-445d-a6f0-2f297d6cd182': function transcriptSeries(
      transcriptJsonSnippets,
      type
    ) {
      const outputSeries = [];
      if (type === 'transcript') {
        /* Converting ttml
              {
                "start": 0,
                "end": 300,
                "text": 'this is ttml snippet text'
              }
            */
        transcriptJsonSnippets.forEach((item) => {
          outputSeries.push({
            startTimeMs: parseInt(Number(item.start) * 1000),
            stopTimeMs: parseInt(Number(item.end) * 1000),
            words: [
              {
                word: item.text,
                confidence: 1
              }
            ]
          });
        });
      }
      if (type === 'v-vlf') {
        /* Converting vlf
			  {
                startTimeMs: 780,
                stopTimeMs: 954,
                durationMs: 174,
                index: 0,
                words: [
                  {
                    bestPathForward: true,
                    bestPathBackword: true, // bestPathBackward
                    word: "and",
                    confidence: 934,
                    spanningBackward: false,
                    spanningForward: false,
                    spanningLength: 1
                  },
                  {
                    bestPathForward: false,
                    bestPathBackword: false, // bestPathBackward
                    word: "it",
                    confidence: 46,
                    spanningBackward: false,
                    spanningForward: false,
                    spanningLength: 1
                  }
                ]
              }
			*/
        transcriptJsonSnippets.forEach((vlfItem) => {
          const seriesItem = {
            startTimeMs: parseInt(Number(vlfItem.startTimeMs)),
            stopTimeMs: parseInt(Number(vlfItem.stopTimeMs)),
            words: []
          };
          vlfItem.words.forEach((vlfWord) => {
            const wordItem = {};
            if (!Object.prototype.hasOwnProperty.call(vlfWord, 'word')) {
              return;
            }
            wordItem.word = vlfWord.word.trim();
            if (Object.prototype.hasOwnProperty.call(vlfWord, 'confidence')) {
              wordItem.confidence = Number(vlfWord.confidence) / 1000;
            }
            if (
              vlfWord.bestPathForward &&
              (vlfWord.bestPathBackword || vlfWord.bestPathBackward)
            ) {
              wordItem.bestPath = true;
            }
            seriesItem.words.push(wordItem);
          });
          if (seriesItem.words.length) {
            outputSeries.push(seriesItem);
          }
        });
      }
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    },
    // For unit test purposes only
    'b3fa5950-c3b4-47eb-9808-10ed295d2696': function testTaskSeries(task) {
      /* Converting
        {
        "end": 817001,
        "start": 817000,
        "entityId": "e4f95344-622b-42bb-8e82-514d96d2df88",
        "libraryId": "0fb79432-dcb1-40b0-bb6a-3f7e481aae3e"
        }
       */
      const outputSeries = [];
      task.output.series.forEach((item) => {
        const newSeriesItem = {
          object: {
            entityId: item.entityId,
            libraryId: item.libraryId
          }
        };
        const startTimeMs = parseInt(item.start);
        let stopTimeMs = parseInt(item.end);
        newSeriesItem.startTimeMs = startTimeMs;
        newSeriesItem.stopTimeMs = stopTimeMs;
        outputSeries.push(newSeriesItem);
      });
      return _.sortBy(outputSeries, ['startTimeMs', 'stopTimeMs']);
    }
  };

  /**
   * Converts
   *  "boundingBox": {
   *    "top": 119.00000095367432,
   *    "left": 482.99999237060547,
   *    "width": 131.00000381469727,
   *    "height": 132.00000286102295,
   *    "imageWidth": 1280,
   *    "imageHeight": 720
   *  },
   * to ordered array of (x,y) coords in percentage of axis.  Implicit line from last to first.
   *  "boundingPoly": [{
   *    'x': 0.1,
   *    'y': 0.2
   *  }]
   * @param boundingBox
   * @returns {Array}
   */
  function boundingBoxToPoly(boundingBox) {
    if (!boundingBox.imageHeight || !boundingBox.imageWidth) {
      return [];
    }
    const boundingPoly = [];
    const point1X = boundingBox.left / boundingBox.imageWidth;
    const point1Y = boundingBox.top / boundingBox.imageHeight;
    boundingPoly.push({ x: point1X, y: point1Y });
    const point2X =
      (boundingBox.left + boundingBox.width) / boundingBox.imageWidth;
    const point2Y = boundingBox.top / boundingBox.imageHeight;
    boundingPoly.push({ x: point2X, y: point2Y });
    const point3X =
      (boundingBox.left + boundingBox.width) / boundingBox.imageWidth;
    const point3Y =
      (boundingBox.top + boundingBox.height) / boundingBox.imageHeight;
    boundingPoly.push({ x: point3X, y: point3Y });
    const point4X = boundingBox.left / boundingBox.imageWidth;
    const point4Y =
      (boundingBox.top + boundingBox.height) / boundingBox.imageHeight;
    boundingPoly.push({ x: point4X, y: point4Y });
    return boundingPoly;
  }

  return {
    convertTaskOutputToStandardOutput,
    taskOutputSeriesConverterByEngineCategoryId
  };
};
