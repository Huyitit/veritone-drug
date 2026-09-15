const setupConstants = require('./appConstants.js');

const LEGACY_SA = '3459c3de-493f-443a-8ad0-ddb9f3f6c76d';
const LEGACY_ADMIN = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
const LEGACY_FINANCE_ADMIN = '37b18322-74bf-4ae4-a46f-2cc407a9966c';
const DESKTOP_SA = 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e';
const DESKTOP_ADMIN = '032218c3-d47e-4287-9d16-7bb867c01266';
const DESKTOP_FINANCE_ADMIN = '79ebbe4e-3837-4e9a-863d-8dd2d181af07';

describe('appConstants', () => {
  describe('LEGACY_TO_DESKTOP_ROLE_MAP', () => {
    describe('when enableDefaultDesktopApp is true', () => {
      let constants;
      beforeEach(() => {
        constants = setupConstants({ config: { featureFlags: { enableDefaultDesktopApp: true } } });
      });

      it('should have 3 entries', () => {
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.size).toBe(3);
      });

      it('should map all three legacy role IDs to their Desktop equivalents', () => {
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.get(LEGACY_SA)).toBe(DESKTOP_SA);
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.get(LEGACY_ADMIN)).toBe(DESKTOP_ADMIN);
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.get(LEGACY_FINANCE_ADMIN)).toBe(DESKTOP_FINANCE_ADMIN);
      });

      it('should resolve ROLES.ADMIN to the desktop admin role', () => {
        expect(constants.ROLES.ADMIN).toBe(DESKTOP_ADMIN);
      });

      it('should resolve ROLES.FINANCE_ADMIN to the desktop finance admin role', () => {
        expect(constants.ROLES.FINANCE_ADMIN).toBe(DESKTOP_FINANCE_ADMIN);
      });

      it('should resolve ROLES.SUPER_ADMIN to the desktop super admin role', () => {
        expect(constants.ROLES.SUPER_ADMIN).toBe(DESKTOP_SA);
      });
    });

    describe('when enableDefaultDesktopApp is false', () => {
      let constants;
      beforeEach(() => {
        constants = setupConstants({ config: { featureFlags: { enableDefaultDesktopApp: false } } });
      });

      it('should be empty', () => {
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.size).toBe(0);
      });

      it('should not remap any legacy role ID', () => {
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.get(LEGACY_ADMIN)).toBeUndefined();
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.get(LEGACY_SA)).toBeUndefined();
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.get(LEGACY_FINANCE_ADMIN)).toBeUndefined();
      });

      it('should resolve ROLES.ADMIN to the legacy admin role', () => {
        expect(constants.ROLES.ADMIN).toBe(LEGACY_ADMIN);
      });

      it('should resolve ROLES.FINANCE_ADMIN to the legacy finance admin role', () => {
        expect(constants.ROLES.FINANCE_ADMIN).toBe(LEGACY_FINANCE_ADMIN);
      });
    });

    describe('when config is absent (defaults to false)', () => {
      it('should be empty', () => {
        const constants = setupConstants({});
        expect(constants.LEGACY_TO_DESKTOP_ROLE_MAP.size).toBe(0);
      });
    });
  });
});
