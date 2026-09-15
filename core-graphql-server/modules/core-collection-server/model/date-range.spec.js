'use strict';

var DateRange = require('./date-range');

describe('DateRange model', function () {
  describe('field shape (row #2)', function () {
    it('exposes startDate and endDate as date-typed fields', function () {
      var fieldKeys = DateRange.allFields.map(function (f) {
        return f.key;
      });
      expect(fieldKeys).toContain('startDate');
      expect(fieldKeys).toContain('endDate');

      DateRange.allFields.forEach(function (f) {
        expect(f.type).toBe('date');
      });
    });

    it('returns null validation for a valid past date range', function () {
      var past1 = new Date(2020, 0, 1);
      var past2 = new Date(2020, 0, 10);
      var instance = new DateRange({ startDate: past1, endDate: past2 });

      expect(instance.validate()).toBeNull();
    });
  });

  describe('validateDateRangeStartDate', function () {
    it('returns a validation error when startDate is in the future (row #6)', function () {
      var futureDate = new Date(2099, 0, 1);
      var instance = new DateRange({ startDate: futureDate });

      var errors = instance.validate();

      expect(errors).not.toBeNull();
      expect(errors.startDate.message).toBe('should be before the current date/time');
    });

    it('returns a validation error when startDate is after endDate (row #7)', function () {
      var startDate = new Date(2020, 5, 15);
      var endDate = new Date(2020, 5, 10);
      var instance = new DateRange({ startDate: startDate, endDate: endDate });

      var errors = instance.validate();

      expect(errors).not.toBeNull();
      expect(errors.startDate.message).toBe('should be before or equal to endDate');
    });
  });
});
