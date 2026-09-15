'use strict';

// VE-24944: coverage for the RBACAuthGroup type resolver factory. Each cache-keyed resolver calls
// cache.get(context, params, '<CacheKey>', fallback); the cache-key string + params wiring is
// security-relevant (a wrong key collides/leaks across RBAC data types). We mock cache.js so get()
// echoes { objectType, params } WITHOUT invoking the fallback (no bll/db). cgql has transform:{} so
// jest.mock is NOT hoisted — keep it above the require of the module under test.
jest.mock('../../resolvers/cache.js', () => () => ({
	get: (requestContext, params, objectType) => ({ objectType: objectType, params: params }),
}));

const serviceContext = require('../../test/serviceContext.mock.js')({ throwOnNoResultInQueue: false });
const RBACAuthGroup = require('./RBACAuthGroup.js')(serviceContext);

const ctx = {};

describe('#RBACAuthGroup resolver — cache-key + arg wiring', () => {
	it('members → RBACAuthGroups keyed by authGroupId', () => {
		const r = RBACAuthGroup.members({ id: 'g1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthGroups');
		expect(r.params.authGroupId).toBe('g1');
	});

	it('organizationACEs → RBACAuthOrgACEs keyed by authGroupId + orgId', () => {
		const r = RBACAuthGroup.organizationACEs({ id: 'g1', organizationId: 'o1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthOrgACEs');
		expect(r.params.authGroupId).toBe('g1');
		expect(r.params.orgId).toBe('o1');
	});

	it('referencedACEs → RBACAuthACEs keyed by authGroupId + organizationId', () => {
		const r = RBACAuthGroup.referencedACEs({ id: 'g1', organizationId: 'o1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthACEs');
		expect(r.params.authGroupId).toBe('g1');
		expect(r.params.organizationId).toBe('o1');
	});

	it('parentGroups → RBACAuthGroups with ownerOrganization from organizationGuid', async () => {
		const r = await RBACAuthGroup.parentGroups({ id: 'g1', organizationGuid: 'og1', organizationId: 'o1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthGroups');
		expect(r.params.ownerOrganization).toBe('og1');
	});

	it('parentGroups falls back to organizationId for ownerOrganization when guid is absent', async () => {
		const r = await RBACAuthGroup.parentGroups({ id: 'g1', organizationId: 'o1' }, {}, ctx);
		expect(r.params.ownerOrganization).toBe('o1');
	});

	it('referencedTDOs → RBACAuthGroupTDOs keyed by authGroupId + organizationId', () => {
		const r = RBACAuthGroup.referencedTDOs({ id: 'g1', organizationId: 'o1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthGroupTDOs');
		expect(r.params.authGroupId).toBe('g1');
		expect(r.params.organizationId).toBe('o1');
	});

	it('referencedFolders → RBACAuthGroupFolders keyed by authGroupId', () => {
		const r = RBACAuthGroup.referencedFolders({ id: 'g1', organizationId: 'o1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthGroupFolders');
		expect(r.params.authGroupId).toBe('g1');
	});

	it('memberCount → RBACAuthGroupMemberCount keyed by authGroupId', () => {
		const r = RBACAuthGroup.memberCount({ id: 'g1', organizationId: 'o1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthGroupMemberCount');
		expect(r.params.authGroupId).toBe('g1');
	});

	it('permissionSet → RBACAuthGroupPermissionSets keyed by authGroupId', () => {
		const r = RBACAuthGroup.permissionSet({ id: 'g1', organizationId: 'o1' }, {}, ctx);
		expect(r.objectType).toBe('RBACAuthGroupPermissionSets');
		expect(r.params.authGroupId).toBe('g1');
	});
});
