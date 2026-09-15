'use strict';

const EngineUpdate = require('./engine-update')();

// All required fields present so validate() surfaces only jwtRights issues.
const base = {
  engineName: 'Engine',
  engineCategoryId: 'cat1',
  engineDescription: 'desc',
  deploymentModel: 1,
  isPublic: false
};

describe('core-job-server engine-update model — validateJWTRights', () => {
  it('reports no error for well-formed jwtRights on a non-public engine', () => {
    const inst = new EngineUpdate({
      ...base,
      jwtRights: { roles: [{ roleName: 'r1', taskRights: ['t:read'], assetRights: ['a:read'] }] }
    });
    expect(inst.validate()).toBeNull();
  });

  it('reports no error when jwtRights is absent', () => {
    expect(new EngineUpdate({ ...base }).validate()).toBeNull();
  });

  it('rejects jwtRights on a public engine', () => {
    const inst = new EngineUpdate({ ...base, isPublic: true, jwtRights: { roles: [{ roleName: 'r1' }] } });
    expect(inst.validate()).toEqual({
      jwtRights: { message: 'cannot update jwtRights for public engines' }
    });
  });

  it('requires a roles array', () => {
    const inst = new EngineUpdate({ ...base, jwtRights: { notRoles: true } });
    expect(inst.validate()).toEqual({ jwtRights: { message: 'should have roles array' } });
  });

  it('requires each role to have a roleName', () => {
    const inst = new EngineUpdate({ ...base, jwtRights: { roles: [{ taskRights: ['t'] }] } });
    expect(inst.validate()).toEqual({ jwtRights: { message: 'roles[0] should have roleName' } });
  });

  it('requires roleName to be a string', () => {
    const inst = new EngineUpdate({ ...base, jwtRights: { roles: [{ roleName: 123 }] } });
    expect(inst.validate()).toEqual({ jwtRights: { message: 'roles[0].roleName should be a string' } });
  });
});

describe('core-job-server engine-update model — field conversion', () => {
  it('strips HTML tags from engineName without entity-escaping (stripHtmlTags convert, not the default sanitizer)', () => {
    // striptags removes tags but leaves "&" intact; the default sanitize-html convert would escape it to "&amp;"
    expect(new EngineUpdate({ ...base, engineName: '<b>A & B</b>' }).engineName).toBe('A & B');
  });
});
