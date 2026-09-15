'use strict';

const Library = require('./library');
const LibraryType = require('./library-type');
const LibraryTypeEntityIdentifierTypeLink = require('./library-type-entity-identifier-type-link');
const LibrarySummary = require('./library-summary');
const LibraryCollaborator = require('./library-collaborator');
const LibraryEngineModel = require('./library-engine-model');
const Entity = require('./entity');
const EntitySummary = require('./entity-summary');
const EntityType = require('./entity-type');
const EntityIdentifier = require('./entity-identifier');
const EntityIdentifierType = require('./entity-identifier-type');
const Organization = require('./organization');
const models = require('./index');

var UUID_A = 'a1b2c3d4-1234-1234-1234-abcdef123456';
var UUID_B = 'b2c3d4e5-2345-2345-2345-bcdef1234567';

// row #1 — Library model
describe('Library (row #1)', function () {
  it('constructs with expected fields', function () {
    var lib = new Library({ libraryId: UUID_A, name: 'TestLib', ownerOrgId: 10, libraryTypeId: 'face' });
    expect(lib.libraryId).toBe(UUID_A);
    expect(lib.name).toBe('TestLib');
    expect(lib.ownerOrgId).toBe(10);
    expect(lib.libraryTypeId).toBe('face');
  });

  it('validate() returns null for valid data', function () {
    var lib = new Library({ libraryId: UUID_A, name: 'TestLib', ownerOrgId: 10, libraryTypeId: 'face' });
    expect(lib.validate()).toBeNull();
  });

  it('validate() returns errors when required fields are missing', function () {
    var lib = new Library({});
    var errs = lib.validate();
    expect(errs).not.toBeNull();
    expect(errs.libraryId).toBeTruthy();
    expect(errs.name).toBeTruthy();
    expect(errs.ownerOrgId).toBeTruthy();
    expect(errs.libraryTypeId).toBeTruthy();
  });

  it('isOwner() matches ownerOrgId', function () {
    var lib = new Library({ libraryId: UUID_A, name: 'x', ownerOrgId: 42, libraryTypeId: 'face' });
    expect(lib.isOwner(42)).toBe(true);
    expect(lib.isOwner(99)).toBe(false);
  });

  it('checkOrgAccess() returns true for owner without collaborator', function () {
    var lib = new Library({ libraryId: UUID_A, name: 'x', ownerOrgId: 5, libraryTypeId: 'face' });
    expect(lib.checkOrgAccess(5, 'view')).toBe(true);
  });

  it('checkOrgAccess() returns false for non-owner with no collaborator', function () {
    var lib = new Library({ libraryId: UUID_A, name: 'x', ownerOrgId: 5, libraryTypeId: 'face' });
    expect(lib.checkOrgAccess(99, 'view')).toBe(false);
  });

  it('normalize() extracts libraryTypeId from nested libraryType', function () {
    var lib = Library.normalize({ libraryId: UUID_A, name: 'x', ownerOrgId: 1, libraryType: { libraryTypeId: 'face' } });
    expect(lib instanceof Library).toBe(true);
    expect(lib.libraryTypeId).toBe('face');
  });
});

// row #2 — LibraryType + LibraryTypeEntityIdentifierTypeLink
describe('LibraryType and LibraryTypeEntityIdentifierTypeLink (row #2)', function () {
  it('LibraryTypeEntityIdentifierTypeLink constructs with entityIdentifierTypeId', function () {
    var link = new LibraryTypeEntityIdentifierTypeLink({ libraryTypeId: 'face', entityIdentifierTypeId: 'face-recognition', minItems: 1, maxItems: 10 });
    expect(link.entityIdentifierTypeId).toBe('face-recognition');
    expect(link.minItems).toBe(1);
    expect(link.maxItems).toBe(10);
  });

  it('LibraryTypeEntityIdentifierTypeLink requires entityIdentifierTypeId', function () {
    var link = new LibraryTypeEntityIdentifierTypeLink({});
    var errs = link.validate();
    expect(errs).not.toBeNull();
    expect(errs.entityIdentifierTypeId).toBeTruthy();
  });

  it('LibraryType constructs with required fields and a link array', function () {
    var lt = new LibraryType({ libraryTypeId: 'face', label: 'Face', entityIdentifierTypes: [{ entityIdentifierTypeId: 'face-recognition' }], entityType: { name: 'Person', namePlural: 'People', schema: {} } });
    expect(lt.libraryTypeId).toBe('face');
    expect(lt.label).toBe('Face');
  });

  it('supportsIdentifierType() returns false when entityIdentifierTypes is empty', function () {
    var lt = new LibraryType({ libraryTypeId: 'face', label: 'Face', entityIdentifierTypes: [], entityType: { name: 'Person', namePlural: 'People', schema: {} } });
    expect(lt.supportsIdentifierType('face-recognition')).toBe(false);
  });

  it('supportsIdentifierType() returns true when EntityIdentifierTypeLink matches', function () {
    var lt = new LibraryType({ libraryTypeId: 'face', label: 'Face', entityIdentifierTypes: [{ entityIdentifierTypeId: 'face-recognition' }, { entityIdentifierTypeId: 'other' }], entityType: { name: 'Person', namePlural: 'People', schema: {} } });
    expect(lt.supportsIdentifierType('face-recognition')).toBe(true);
    expect(lt.supportsIdentifierType('unknown')).toBe(false);
  });
});

// row #3 — LibrarySummary, LibraryCollaborator, LibraryEngineModel
describe('Library association models (row #3)', function () {
  describe('LibrarySummary', function () {
    it('constructs and exposes ownershipTypeEnum', function () {
      var summary = new LibrarySummary({ libraryId: UUID_A, entityCount: 5, ownershipType: 'owner' });
      expect(summary.entityCount).toBe(5);
      expect(summary.ownershipType).toBe('owner');
      expect(LibrarySummary.ownershipTypeEnum.owner).toBe('owner');
      expect(LibrarySummary.ownershipTypeEnum.collaborator).toBe('collaborator');
    });
  });

  describe('LibraryCollaborator', function () {
    it('hasPermission() returns true when permission is in the array', function () {
      var collab = new LibraryCollaborator({ libraryId: UUID_A, collaboratorOrgId: 7, permissions: ['view', 'edit'], status: 'active' });
      expect(collab.hasPermission('view')).toBe(true);
      expect(collab.hasPermission('share')).toBe(false);
    });

    it('hasPermission() returns false when permissions is not an array', function () {
      var collab = new LibraryCollaborator({ libraryId: UUID_A, collaboratorOrgId: 7, permissions: null, status: 'active' });
      expect(collab.hasPermission('view')).toBe(false);
    });

    it('exports statusEnum and permissionTypeEnum', function () {
      expect(LibraryCollaborator.statusEnum.active).toBe('active');
      expect(LibraryCollaborator.statusEnum.rejected).toBe('rejected');
      expect(LibraryCollaborator.permissionTypeEnum.view).toBe('view');
      expect(LibraryCollaborator.permissionTypeEnum.edit).toBe('edit');
    });

    it('normalize() extracts libraryId from nested library', function () {
      var collab = LibraryCollaborator.normalize({ library: { libraryId: UUID_A }, collaboratorOrgId: 7, permissions: ['view'], status: 'active' });
      expect(collab instanceof LibraryCollaborator).toBe(true);
      expect(collab.libraryId).toBe(UUID_A);
    });
  });

  describe('LibraryEngineModel', function () {
    it('exposes statusEnum', function () {
      expect(LibraryEngineModel.statusEnum.pending).toBe('pending');
      expect(LibraryEngineModel.statusEnum.complete).toBe('complete');
      expect(LibraryEngineModel.statusEnum.failed).toBe('failed');
    });

    it('getContentType() returns null when metadata has no contentType', function () {
      var lem = new LibraryEngineModel({ libraryEngineModelId: UUID_A, libraryId: UUID_B, engineId: 'eng-1', trainStatus: 'pending', metadata: {} });
      expect(lem.getContentType()).toBeNull();
    });

    it('setContentType() stores contentType in metadata', function () {
      var lem = new LibraryEngineModel({ libraryEngineModelId: UUID_A, libraryId: UUID_B, engineId: 'eng-1', trainStatus: 'pending' });
      lem.setContentType('image/jpeg');
      expect(lem.getContentType()).toBe('image/jpeg');
    });
  });
});

// row #4 — Entity family
describe('Entity family (row #4)', function () {
  describe('Entity', function () {
    it('generateId() sets entityId as a UUID string', function () {
      var entity = new Entity({ libraryId: UUID_A, name: 'Alice' });
      var id = entity.generateId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(entity.entityId).toBe(id);
    });

    it('normalize() extracts libraryId from nested library', function () {
      var entity = Entity.normalize({ library: { libraryId: UUID_A }, name: 'Bob' });
      expect(entity instanceof Entity).toBe(true);
      expect(entity.libraryId).toBe(UUID_A);
    });
  });

  describe('EntitySummary', function () {
    it('constructs with entityId and identifierCountsByType', function () {
      var summary = new EntitySummary({ entityId: UUID_A, identifierCountsByType: { face: 2 } });
      expect(summary.entityId).toBe(UUID_A);
      expect(summary.identifierCountsByType).toEqual({ face: 2 });
    });
  });

  describe('EntityType', function () {
    it('constructs and _libraryType is non-enumerable', function () {
      var et = new EntityType({ name: 'Person', namePlural: 'People', schema: {} });
      expect(et.name).toBe('Person');
      expect(Object.keys(et)).not.toContain('_libraryType');
      expect(et._libraryType).toBeNull();
    });

    it('validate() returns errors when required fields are missing', function () {
      var et = new EntityType({});
      var errs = et.validate();
      expect(errs).not.toBeNull();
      expect(errs.name).toBeTruthy();
      expect(errs.namePlural).toBeTruthy();
    });
  });

  describe('EntityIdentifierType', function () {
    it('exposes dataTypeEnum', function () {
      expect(EntityIdentifierType.dataTypeEnum.text).toBe('text');
      expect(EntityIdentifierType.dataTypeEnum.image).toBe('image');
      expect(EntityIdentifierType.dataTypeEnum.audio).toBe('audio');
      expect(EntityIdentifierType.dataTypeEnum.video).toBe('video');
    });

    it('constructs with required fields', function () {
      var eit = new EntityIdentifierType({ entityIdentifierTypeId: 'face-recognition', label: 'Face', labelPlural: 'Faces', dataType: 'image' });
      expect(eit.entityIdentifierTypeId).toBe('face-recognition');
      expect(eit.dataType).toBe('image');
    });
  });
});

// row #5 — Organization (org-scope field)
describe('Organization (row #5)', function () {
  it('constructs with organizationId and organizationName', function () {
    var org = new Organization({ organizationId: '100', organizationName: 'Acme Corp' });
    expect(org.organizationId).toBe('100');
    expect(org.organizationName).toBe('Acme Corp');
  });

  it('validate() returns null for valid data', function () {
    var org = new Organization({ organizationId: '100', organizationName: 'Acme' });
    expect(org.validate()).toBeNull();
  });

  it('only copies declared fields (org-scope isolation)', function () {
    var org = new Organization({ organizationId: '100', organizationName: 'Acme', secretToken: 'x' });
    expect(org).not.toHaveProperty('secretToken');
  });
});

// row #6 — index.js re-exports
describe('index.js re-exports (row #6)', function () {
  it('exports all 12 model constructors', function () {
    var expected = ['Library', 'LibraryType', 'LibraryTypeEntityIdentifierTypeLink', 'LibraryEngineModel', 'LibraryCollaborator', 'LibrarySummary', 'Entity', 'EntityIdentifier', 'EntityIdentifierType', 'EntitySummary', 'EntityType', 'Organization'];
    expected.forEach(function (name) {
      expect(typeof models[name]).toBe('function');
    });
  });

  it('re-exports are the same references as direct requires', function () {
    expect(models.Library).toBe(Library);
    expect(models.Organization).toBe(Organization);
    expect(models.EntityType).toBe(EntityType);
  });
});
