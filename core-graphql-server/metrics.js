const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const prometheus = serviceContext.metricsCounters;

  function incrementCounter(name, labels) {
    check(name);
    prometheus[name].inc(labels);
  }

  function resetCounter(name) {
    check(name);
    prometheus[name].reset();
  }

  function incrementGauge(name, labels) {
    check(name);
    prometheus[name].inc(labels);
  }

  function decrementGauge(name, labels) {
    check(name);
    prometheus[name].dec(labels);
  }

  function resetGauge(name, labels, value) {
    check(name);
    prometheus[name].set(value || 0);
  }

  function observeHistogram(name, value, labels) {
    check(name);
    prometheus[name].observe(labels, value);
  }

  function incrementCounterBy(name, labels, value) {
    check(name);
    prometheus[name].inc(labels, value);
  }

  function check(name) {
    if (!prometheus[name]) {
      throw new Error(
        'unknown prometheus metric ' +
          name +
          '. known metrics include:  ' +
          Object.keys(prometheus)
      );
    }
  }

  function getValue(name, labelName = null, labelValue = null) {
    check(name);
    const values = prometheus[name].get().values || [];
    let res = 0;
    /*
    sample values object:
    [
  {
    "value": 15,
    "labels": {
      "type": "mutation"
    }
  },
  {
    "value": 373,
    "labels": {
      "type": "field"
    }
  },
  {
    "value": 22,
    "labels": {
      "type": "query"
    }
  }
]
    */
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      // if we're matching on label name, check if label
      // exists in the value object
      if (!_.isNil(labelName) && !_.isNil(val.labels[labelName])) {
        // value exists in object.
        // if we're also matching on label value, check that here.
        if (!_.isNil(labelValue)) {
          // take value for this label only if label value matches
          if (labelValue === val.labels[labelName]) {
            res = val.value;
            break;
          }
        } else {
          // otherwise just take the value for this label
          res = val.value;
          break;
        }
      } else {
        // otherwise, if not matching on label,
        // increment count with this value. we're adding up all of them.
        res += val.value;
      }
    }
    return res;
  }

  return {
    getValue,
    incrementCounter,
    incrementCounterBy,
    resetCounter,
    incrementGauge,
    decrementGauge,
    resetGauge,
    observeHistogram
  };
};
