// Smoke test: verify createModule() returns correct module shape including
// ProcessingProject and ProcessingDeliverable resolvers added 2026-06-23.
// All DAL/BLL/loader/resolver factories are stubbed; only wiring is under test.

const STUB_FACTORY = () => ({});

function makeServiceContext() {
	return {
		storage: {},
		logger: {
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		},
		pg: {},
		blls3: {},
		config: {},
		app: { messaging: {} },
		librariesService: {},
		dbConnections: {},
		jobBll: {},
	};
}

describe("createModule(serviceContext)", () => {
	let createModule;

	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();

		jest.mock("fs", () => ({
			readFileSync: jest.fn(() => "type Query { _: Boolean }"),
		}));

		jest.mock("../../localCache.js", () => STUB_FACTORY);

		var dalMods = [
			"../../dal/asset.js",
			"../../dal/structureddata.js",
			"../../dal/tdo.js",
			"../../dal/dalEngine.js",
			"../../dal/engineCategory.js",
			"../../dal/dalEngineResult.js",
			"../../dal/dalFlowTemplate.js",
			"../../dal/dalFlow.js",
			"../../dal/dalFlowRevision.js",
			"../../dal/dalFlowExecution.js",
			"../../dal/savedSearch.js",
			"../../dal/dalSearch.js",
			"../../dal/organization.js",
			"../../dal/dalAdmin.js",
			"../../dal/library.js",
			"../../dal/dalFolder.js",
			"../../dal/dalFolderV2.js",
			"../../dal/dalPlatform.js",
			"../../dal/mention.js",
			"../../dal/dalCollection.js",
			"../../dal/share.js",
			"../../dal/watchlist.js",
			"../../dal/trigger.js",
			"../../dal/notification.js",
			"../../dal/event.js",
			"../../dal/eventCustomRule.js",
			"../../dal/exportRequest.js",
			"../../dal/auditLog.js",
			"../../dal/instanceAuditLog.js",
			"../../dal/task.js",
			"../../dal/job.js",
			"../../dal/dalV3Job.js",
			"../../dal/workflow.js",
			"../../dal/creative.js",
			"../../dal/dalApplication.js",
			"../../dal/engineClass.js",
			"../../dal/entityTags.js",
			"../../dal/package.js",
			"../../dal/applicationViewer.js",
			"../../dal/role.js",
			"../../dal/processTemplate.js",
			"../../dal/storage.js",
			"../../dal/customDashboard.js",
			"../../dal/dataset.js",
			"../../dal/mailbox.js",
			"../../dal/dalStaticAppConfig.js",
			"../../dal/openidConnect.js",
			"../../dal/organizationInvite.js",
			"../../dal/dalAlwaysUpFlow.js",
			"../../dal/dalOrganizationRegistration.js",
			"../../dal/externalCredential",
			"../../dal/emailTemplate.js",
			"../../dal/ingestSlug.js",
			"../../dal/processingDeliverables.js",
			"../../dal/user.js",
			"../../dal/treeObject.js",
		];
		dalMods.forEach((m) => {
			jest.mock(m, () => STUB_FACTORY);
		});

		var bllMods = [
			"../../bll/asset.js",
			"../../bll/dagTemplate.js",
			"../../bll/engine.js",
			"../../bll/job.js",
			"../../bll/task.js",
			"../../bll/cluster.js",
			"../../bll/mailbox.js",
			"../../bll/notification.js",
			"../../bll/application.js",
			"../../bll/openidConnect.js",
			"../../bll/organizationInvite.js",
			"../../bll/user.js",
			"../../bll/organizationRegistration.js",
			"../../bll/emailProvider.js",
		];
		bllMods.forEach((m) => {
			jest.mock(m, () => STUB_FACTORY);
		});

		var loaderMods = [
			"../../loaders/task.js",
			"../../loaders/user.js",
			"../../loaders/dagTemplate.js",
		];
		loaderMods.forEach((m) => {
			jest.mock(m, () => STUB_FACTORY);
		});

		var resolverMods = [
			"../../resolvers/Application.js",
			"../../resolvers/ApplicationComponent.js",
			"../../resolvers/ApplicationConfig.js",
			"../../resolvers/ApplicationConfigDefinition.js",
			"../../resolvers/ApplicationViewer.js",
			"../../resolvers/Asset.js",
			"../../resolvers/AssetScrollList.js",
			"../../resolvers/AssetSourceData.js",
			"../../resolvers/AuditEvent.js",
			"../../resolvers/BasicUserInfo.js",
			"../../resolvers/Build.js",
			"../../resolvers/CloneData.js",
			"../../resolvers/CloneRequest.js",
			"../../resolvers/CognitiveSearch.js",
			"../../resolvers/CognitiveSearchProfile.js",
			"../../resolvers/Collection.js",
			"../../resolvers/CollectionMention.js",
			"../../resolvers/CustomDashboard.js",
			"../../resolvers/DataRegistry.js",
			"../../resolvers/Engine.js",
			"../../resolvers/EngineCategory.js",
			"../../resolvers/EngineDependency.js",
			"../../resolvers/EngineOverview.js",
			"../../resolvers/EngineResult.js",
			"../../resolvers/Entity.js",
			"../../resolvers/EntityIdentifier.js",
			"../../resolvers/EntityIdentifierType.js",
			"../../resolvers/ExportRequest.js",
			"../../resolvers/Folder.js",
			"../../resolvers/FolderContentTemplate.js",
			"../../resolvers/FolderSummaryDetail.js",
			"../../resolvers/GraphQLServiceInfo.js",
			"../../resolvers/IngestSlug.js",
			"../../resolvers/Job.js",
			"../../resolvers/Library.js",
			"../../resolvers/LibraryEngineModel.js",
			"../../resolvers/LibrarySummary.js",
			"../../resolvers/LibraryType.js",
			"../../resolvers/LoginInfo.js",
			"../../resolvers/Mention.js",
			"../../resolvers/MentionComment.js",
			"../../resolvers/MentionRating.js",
			"../../resolvers/Mutation.js",
			"../../resolvers/NotificationMailbox.js",
			"../../resolvers/OpenIdProvider.js",
			"../../resolvers/Organization.js",
			"../../resolvers/OrganizationInfo.js",
			"../../resolvers/OrganizationInvite.js",
			"../../resolvers/Package.js",
			"../../resolvers/PackageGrant.js",
			"../../resolvers/PackageResource.js",
			"../../resolvers/PlatformInfo.js",
			"../../resolvers/ProcessingDeliverables.js",
			"../../resolvers/ProcessingProject.js",
			"../../resolvers/Query.js",
			"../../resolvers/RegistrationConfiguration.js",
			"../../resolvers/RegistrationConfigurationInfo.js",
			"../../resolvers/Role.js",
			"../../resolvers/SavedSearch.js",
			"../../resolvers/Schema.js",
			"../../resolvers/SchemaProperty.js",
			"../../resolvers/Share.js",
			"../../resolvers/SharedCollection.js",
			"../../resolvers/SharedMention.js",
			"../../resolvers/StructuredData.js",
			"../../resolvers/Subscription.js",
			"../../resolvers/SubscriptionService.js",
			"../../resolvers/TDOSourceData.js",
			"../../resolvers/Task.js",
			"../../resolvers/TaskLog.js",
			"../../resolvers/TemporalDataObject.js",
			"../../resolvers/Trigger.js",
			"../../resolvers/User.js",
			"../../resolvers/UserACL.js",
			"../../resolvers/Watchlist.js",
			"../../resolvers/Widget.js",
		];
		resolverMods.forEach((m) => {
			jest.mock(m, () => STUB_FACTORY);
		});

		createModule = require("./index.js");
	});

	it("returns an object with resolvers and typeDefs", () => {
		var mod = createModule(makeServiceContext());
		expect(mod).toHaveProperty("resolvers");
		expect(mod).toHaveProperty("typeDefs");
		expect(Array.isArray(mod.typeDefs)).toBe(true);
		expect(mod.typeDefs.length).toBeGreaterThan(0);
	});

	it("resolvers include ProcessingProject and ProcessingDeliverable", () => {
		var resolvers = createModule(makeServiceContext()).resolvers;
		expect(resolvers).toHaveProperty("ProcessingProject");
		expect(resolvers).toHaveProperty("ProcessingDeliverable");
	});

	it("resolvers include Query and Mutation", () => {
		var resolvers = createModule(makeServiceContext()).resolvers;
		expect(resolvers).toHaveProperty("Query");
		expect(resolvers).toHaveProperty("Mutation");
	});
});
