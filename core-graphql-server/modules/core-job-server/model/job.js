'use strict';

const validatejs = require('validate.js');
const Task = require('./task');
const async = require('async');
const _ = require('lodash');
const Engine = require('./engine')();

function Job(data) {
  if (data) {
    var keys = Object.keys(data),
      self = this;
    keys.forEach(function forEachKey(key) {
      self[key] = data[key];
    });
  }

  // default values
  this.status = this.status || 'accepted';
  this.tasks = this.tasks || [];
  this.tasks = this.tasks.map(function mapTasks(task) {
    return new Task(task);
  });
  this.retries = this.retries || 0;
}

Job._validation = {
  applicationId: {
    presence: true
  },
  tasks: {
    presence: false
  }
};

Job.prototype.validate = function validate(
  context,
  dalEngine,
  taskValidators,
  callback
) {
  if (typeof dalEngine !== 'object') {
    throw new Error('Missing dalEngine!');
  }
  if (typeof callback !== 'function') {
    throw new Error('Missing callback!');
  }

  // Validate job
  var job = this,
    validationErrors = validatejs(job, Job._validation);

  // Validate each task
  var functions = [],
    createsRecording = false,
    hasTrainTask = false;

  if (job.tasks && job.tasks.length) {
    job.tasks.forEach(function forEachTask(task, index) {
      var t = task,
        i = index;
      functions.push(function validateTask(cb) {
        var returnObject = {};

        if (!t.engineId) {
          returnObject['task[' + i + ']'] = 'Missing engineId!';
          return cb(null, returnObject);
        }

        dalEngine
          .getEngine(context, { id: t.engineId }, true)
          .then((engine) => {
            if (!engine) {
              returnObject[`task[${i}]`] = `Invalid engine id: ${t.engineId}`;
              return cb(null, returnObject);
            }

            createsRecording = createsRecording || !!engine.createsRecording;

            if (t.isTrainingTask()) {
              hasTrainTask = true;
            }

            engine.deploymentModel = engine.deploymentModelNum;
            engine = new Engine(engine);
            t.engine = engine;

            // run additional validators asynchronously and aggregate validation errors, if any
            const validators = [engine.validateTask.bind(engine)].concat(
              taskValidators || []
            );
            const validationTasks = validators.map((validator) => {
              return (cb) => validator(t, cb);
            });

            async.parallel(validationTasks, (err, results) => {
              const taskValidationErrs = {};

              if (!err && Array.isArray(results)) {
                results = results.filter(_.isObject);

                if (results.length) {
                  // combine validation errors
                  Object.assign(taskValidationErrs, ...results);
                }

                if (Object.keys(taskValidationErrs).length) {
                  returnObject[`task[${i}]`] = taskValidationErrs;
                }

                cb(err, returnObject);
              }
            });
          })
          .catch((err) => {
            return cb(err);
          });
      });
    });
  }

  if (!functions.length) {
    return callback(null, validationErrors);
  }

  validationErrors = validationErrors || {};

  async.parallelLimit(functions, 5, function parallelCallback(err, results) {
    if (err) {
      return callback(err);
    }

    if (!createsRecording && !hasTrainTask) {
      if (typeof job.recordingId !== 'string' && _.isUndefined(job.routes)) {
        validationErrors.recordingId = 'Missing recordingId!';
      }
    }

    // combine the results
    if (results && results.length) {
      results = results.filter(_.isObject);

      if (results.length) {
        // combine validation errors
        Object.assign(validationErrors, ...results);
      }
    }

    callback(
      null,
      Object.keys(validationErrors).length ? validationErrors : undefined
    );
  });
};

module.exports = Job;
