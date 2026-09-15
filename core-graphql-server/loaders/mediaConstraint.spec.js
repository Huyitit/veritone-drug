'use strict';

const chaiExpect = require('chai').expect;

// VE-26450 — the loader exists to make `destinationTypes { mediaConstraints }` one query instead of one per
// type. What has to hold is the DataLoader contract: one entry per key, in key order, never a hole.
describe('loaders/mediaConstraint.js (VE-26450)', function () {
  let getMediaConstraints;
  let loader;

  beforeEach(function () {
    getMediaConstraints = jest.fn().mockResolvedValue([
      { id: 'mc-1', destinationTypeId: 'dt-1', postType: 'reels' },
      { id: 'mc-2', destinationTypeId: 'dt-3', postType: 'stories' },
      { id: 'mc-3', destinationTypeId: 'dt-1', postType: 'stories' }
    ]);
    loader = require('./mediaConstraint.js')({
      dal: { destinationMediaConstraint: { getMediaConstraints } }
    });
  });

  it('reads every key in ONE call to the DAL', async function () {
    const context = { reqId: 'r1' };

    await loader.batchMediaConstraintsByDestinationTypeIds(context, [
      'dt-1',
      'dt-2',
      'dt-3'
    ]);

    expect(getMediaConstraints).toHaveBeenCalledTimes(1);
    expect(getMediaConstraints).toHaveBeenCalledWith(context, {
      destinationTypeIds: ['dt-1', 'dt-2', 'dt-3']
    });
  });

  it('returns one grouped entry per key, in key order', async function () {
    const result = await loader.batchMediaConstraintsByDestinationTypeIds({}, [
      'dt-3',
      'dt-1'
    ]);

    chaiExpect(result).to.have.length(2);
    chaiExpect(result[0].map((r) => r.id)).to.deep.equal(['mc-2']);
    chaiExpect(result[1].map((r) => r.id)).to.deep.equal(['mc-1', 'mc-3']);
  });

  // A hole would surface to the resolver as `undefined` and read as an error rather than "declares nothing",
  // which is the state the whole check treats as "allow".
  it('gives a type that declares nothing an empty list, never a hole', async function () {
    const result = await loader.batchMediaConstraintsByDestinationTypeIds({}, [
      'dt-2'
    ]);

    chaiExpect(result).to.deep.equal([[]]);
  });

  it('matches keys to rows by value, not by identity of the id type', async function () {
    // destination_type_id can arrive from pg as something other than the string the client sent.
    getMediaConstraints.mockResolvedValue([
      { id: 'mc-9', destinationTypeId: 7, postType: 'video' }
    ]);

    const result = await loader.batchMediaConstraintsByDestinationTypeIds({}, ['7']);

    chaiExpect(result[0].map((r) => r.id)).to.deep.equal(['mc-9']);
  });
});
