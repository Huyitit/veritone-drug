class MockRedLock {
  constructor(settings) {
    this.locks = {};
  }
  async lock(key, ttl) {
    let timeStamp = this.locks[key];
    if (!timeStamp || timeStamp < Date.now()) {
      this.locks[key] = Date.now() + ttl;
      return {
        unlock: async () => {
          delete this.locks['key'];
        }
      };
    }
    throw new Error('MOCK_LOCK: failed to acquire lock');
  }
}

module.exports = function (settings) {
  return new MockRedLock();
};
