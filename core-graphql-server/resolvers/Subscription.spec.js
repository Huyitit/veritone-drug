'use strict';
const chaiExpect = require('chai').expect;

const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

const frequencyMap = {
  toKey: {
    1: 'DAILY',
    2: 'WEEKLY',
    3: 'MONTHLY'
  }
};

const dayOfWeekMap = {
  toKey: {
    1: 'MONDAY',
    2: 'TUESDAY',
    7: 'SUNDAY'
  }
};

serviceContext.dal.watchlist = {
  getFrequencyMap: jest.fn().mockReturnValue(frequencyMap),
  getDayOfWeekMap: jest.fn().mockReturnValue(dayOfWeekMap)
};

const Subscription = require('./Subscription.js')(serviceContext);

describe('#Subscription field resolvers', () => {
  describe('#frequency', () => {
    it('maps frequencyId to the display key via watchlist frequencyMap', () => {
      chaiExpect(Subscription.frequency({ frequencyId: 1 })).to.equal('DAILY');
    });

    it('maps a different frequencyId to its display key', () => {
      chaiExpect(Subscription.frequency({ frequencyId: 2 })).to.equal('WEEKLY');
    });
  });

  describe('#contact', () => {
    it('maps object fields to the contact shape with correct key renames', () => {
      const obj = {
        emailAddress: 'alert@example.com',
        mobileNumber: '555-0199',
        webHookUri: 'https://hooks.example.com/notify',
        userId: 'user-abc'
      };

      const result = Subscription.contact(obj);

      chaiExpect(result).to.deep.equal({
        emailAddress: 'alert@example.com',
        phoneNumber: '555-0199',
        webhookUri: 'https://hooks.example.com/notify',
        userId: 'user-abc'
      });
    });

    it('preserves null fields in the contact shape', () => {
      const obj = {
        emailAddress: null,
        mobileNumber: null,
        webHookUri: null,
        userId: null
      };

      const result = Subscription.contact(obj);

      chaiExpect(result.emailAddress).to.be.null;
      chaiExpect(result.phoneNumber).to.be.null;
    });
  });

  describe('#scheduledDay', () => {
    it('maps scheduledDay integer to the day-of-week key', () => {
      chaiExpect(Subscription.scheduledDay({ scheduledDay: 1 })).to.equal('MONDAY');
    });

    it('maps the last day-of-week to its key', () => {
      chaiExpect(Subscription.scheduledDay({ scheduledDay: 7 })).to.equal('SUNDAY');
    });
  });

  describe('#unsubscribeHash', () => {
    it('returns the unsubscribeHash from obj.jsondata', () => {
      const obj = { jsondata: { unsubscribeHash: 'tok_abc123' } };
      chaiExpect(Subscription.unsubscribeHash(obj)).to.equal('tok_abc123');
    });
  });

  describe('#scheduledTime', () => {
    it('returns the scheduledTime when present', () => {
      const obj = { scheduledTime: '14:30:00+00:00' };
      chaiExpect(Subscription.scheduledTime(obj)).to.equal('14:30:00+00:00');
    });

    it('returns null when scheduledTime is null', () => {
      chaiExpect(Subscription.scheduledTime({ scheduledTime: null })).to.be.null;
    });

    it('returns null when scheduledTime is undefined', () => {
      chaiExpect(Subscription.scheduledTime({})).to.be.null;
    });
  });
});
