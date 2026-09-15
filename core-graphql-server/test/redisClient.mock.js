const _ = require('lodash');

let cache = {};
let counter = 0;

function multi() {
  const functions = [];
  const results = [];
  return {
    expire: (key, ttl) =>
      functions.push(() => expire(key, ttl, (err, res) => results.push(res))),
    incrby: (key, value) =>
      functions.push(() => incrby(key, value, (err, res) => results.push(res))),
    incr: (key) =>
      functions.push(() => incr(key, (err, res) => results.push(res))),
    decr: (key) =>
      functions.push(() => decr(key, (err, res) => results.push(res))),
    get: (key) =>
      functions.push(() => get(key, (err, res) => results.push(res))),
    set: (key, value, cmd, timeout = 0) =>
      functions.push(() => set(key, value, (err, res) => results.push(res))),
    del: (key) =>
      functions.push(() => del(key, (err, res) => results.push(res))),
    lpush: (key, value) =>
      functions.push(() => lpush(key, value, (err, res) => results.push(res))),
    lrange: (key, start, stop) =>
      functions.push(() =>
        lrange(key, start, stop, (err, res) => results.push(res))
      ),
    exec: (cb) => {
      functions.forEach((fun) => {
        fun();
      });
      if (cb) cb(null, results);
    }
  };
}

function del(...args) {
  // check if the last argument is a function (the callback)
  const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;

  // the rest of the arguments are the keys
  const keys = args;

  // if no keys are provided, return an error or exit
  if (keys.length === 0) {
    if (cb) cb(new Error('No keys provided'));
    return;
  }

  counter++;
  for (const k of keys) {
    delete cache[k];
  }

  if (cb) cb();
}

function expire(key, ttl, cb) {
  counter++;
  if (cb) cb(null, 1);
}

function exists(key, cb) {
  cb(null, cache[key]);
}

function setex(key, ttl, value, cb) {
  set(key, value, ttl, cb);
}

function decrby(key, value, cb) {
  incrby(key, -value, cb);
}

function incrby(key, value, cb) {
  if (!key) throw new Error('no key');
  if (_.isNil(value)) throw new Error('no value');
  if (!_.isNumber(value))
    throw new Error('non-number value ' + typeof value + ' ' + value);
  counter++;
  const v = cache[key] || 0;
  cache[key] = v + (value || 0);
  if (cb) cb(null, cache[key]);
}

function incrbyfloat(key, value, cb) {
  if (!key) throw new Error('no key');
  if (_.isNil(value)) throw new Error('no value');
  if (!_.isNumber(value))
    throw new Error('non-number value ' + typeof value + ' ' + value);
  counter++;
  const v = cache[key] || 0;
  cache[key] = v + (value || 0);
  if (cb) cb(null, cache[key]);
}

function incr(key, cb) {
  incrby(key, 1, cb);
}

function decr(key, cb) {
  incrby(key, -1, cb);
}

function get(key, cb) {
  counter++;
  if (cb) cb(null, cache[key]);
}

function set(key, value, exp, ttl, cb) {
  counter++;
  cache[key] = value;
  if (cb) cb(null, value);
}

function lpush(key, value, cb) {
  counter++;
  if (!cache[key]) cache[key] = [];
  cache[key].push(value);
  if (cb) cb(null, cache[key].length);
}
function sadd(key, value, cb) {
  if (!cache[key]) cache[key] = new Set();
  const result = cache[key].has(value) ? 0 : 1;
  cache[key].add(value);
  if (cb) cb(null, result);
}

function lrange(key, start, stop, cb) {
  counter++;
  if (cb) cb(null, cache[key]);
}

module.exports = {
  multi,
  expire,
  exists,
  incrbyfloat,
  incrby,
  incr,
  decr,
  decrby,
  get,
  set,
  setex,
  del,
  sadd,
  connected: true,
  _clear: () => (cache = {}),
  _counter: () => counter,
  _clearCounter: () => (counter = 0)
};
