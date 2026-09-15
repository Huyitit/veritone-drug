'use strict';

const NodeMetrics = require('./node-metrics')();

const valid = { cpuCount: 2, mbRam: 4, mbDisk: 100 };

describe('core-job-server node-metrics model — required fields', () => {
  it('marks cpuCount, mbRam and mbDisk as required', () => {
    // Regression: mbRam was previously misspelled "requred" and silently optional.
    expect(NodeMetrics.requiredFields).toEqual({
      cpuCount: true,
      mbRam: true,
      mbDisk: true
    });
  });

  it('validates a well-formed instance with no errors', () => {
    expect(new NodeMetrics(valid).validate()).toBeNull();
  });

  it('requires mbRam to be present as a Number', () => {
    // Regression guard for the "requred" typo: omitting mbRam must be an error.
    expect(new NodeMetrics({ cpuCount: 2, mbDisk: 100 }).validate()).toEqual({
      mbRam: { message: 'should be a Number' }
    });
  });

  it('requires cpuCount to be present as a Number', () => {
    expect(new NodeMetrics({ mbRam: 4, mbDisk: 100 }).validate()).toEqual({
      cpuCount: { message: 'should be a Number' }
    });
  });
});

describe('core-job-server node-metrics model — optional field types', () => {
  it('rejects a non-string ipExternal', () => {
    expect(new NodeMetrics({ ...valid, ipExternal: 5 }).validate()).toEqual({
      ipExternal: { message: 'should be a String' }
    });
  });

  it('rejects a non-object/array loadAverage', () => {
    expect(new NodeMetrics({ ...valid, loadAverage: 'x' }).validate()).toEqual({
      loadAverage: { message: 'should be an Object or Array' }
    });
  });
});
