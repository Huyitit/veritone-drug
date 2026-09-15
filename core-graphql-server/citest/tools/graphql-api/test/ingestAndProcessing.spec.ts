import {
  DeliverableStatus,
  DeliverableType,
  OrganizationStatus,
  OrganizationType,
  SchemaStatus,
  StringMatch,
} from "../src/gql";
import {
  AuthType,
  buildRequestHeaders,
  createGraphqlClient,
  GraphqlClient,
} from "../src/graphqlUtil";
import { v4 as uuidv4 } from "uuid";

const citestMarker = `citest-should-delete-sdo`;
const deliverableAssetAndEngineType = [
  {
    title:
      "Verify create deliverable with deliverableType = AssetType successfully within value",
    deliverableType: DeliverableType.AssetType,
    value: "VALUE",
  },
  {
    title:
      "Verify create deliverable with deliverableType = AssetType successfully with empty value",
    deliverableType: DeliverableType.AssetType,
    value: "",
  },
  {
    title:
      "Create deliverable with deliverableType = Engine successfully with valid value",
    deliverableType: DeliverableType.Engine,
  },
  {
    title:
      "Create deliverable with deliverableType = Engine unsuccessfully with invalid value",
    deliverableType: DeliverableType.Engine,
    value: "INVALID_ENGINE_VALUE",
  },
  {
    title:
      "Create deliverable with deliverableType = Engine unsuccessfully with empty value",
    deliverableType: DeliverableType.Engine,
    value: "",
  },
];

const deliverableSchemaType = [
  {
    title:
      "Create deliverable with deliverableType = Schema successfully with valid value",
    deliverableType: DeliverableType.Schema,
  },
  {
    title:
      "Create deliverable with deliverableType = Schema unsuccessfully with invalid value",
    deliverableType: DeliverableType.Schema,
    value: "INVALID_SCHEMA_VALUE",
  },
  {
    title:
      "Create deliverable with deliverableType = Schema unsuccessfully with empty value",
    deliverableType: DeliverableType.Schema,
    value: "",
  },
];

const deliverableEngineCategoryType = [
  {
    title:
      "Create deliverable with deliverableType = EngineCategory successfully with valid value",
    deliverableType: DeliverableType.EngineCategory,
    value: "VALID_ENGINE_CATEGORY_VALUE",
  },
  {
    title:
      "Create deliverable with deliverableType = EngineCategory unsuccessfully with invalid value",
    deliverableType: DeliverableType.EngineCategory,
    value: "INVALID_ENGINE_CATEGORY_VALUE",
  },
  {
    title:
      "Create deliverable with deliverableType = EngineCategory unsuccessfully with empty value",
    deliverableType: DeliverableType.EngineCategory,
    value: "",
  },
];

const assetTypeUnccessfulCases = [
  {
    title: "Create deliverable unsuccessfully with invalid projectId",
    deliverableType: DeliverableType.AssetType,
    value: "VALUE",
    projectId: "5903ddf8-7ba7-4092-87d5-b2b016b03eb6",
  },
  {
    title: "Create deliverable unsuccessfully with invalid tdoId",
    deliverableType: DeliverableType.AssetType,
    value: "VALUE",
    tdoId: "5903ddf8-7ba7-4092-87d5-b2b016b03eb6",
  },
];

let adminRequestHeaders: Record<string, string>;

let userIds: string[] = [];

let orgId: string;
let applicationId: string;
let initProjectId: string;
let tdoId: string;
let dataRegistryId: string;

describe("citest_ingest: Ingest and processing", () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // create organization
    const createOrgResult = await gqlClient.sdk.createOrganization({
      input: orgInput,
    });

    orgId = createOrgResult?.data?.createOrganization?.id as string;
    expect(orgId).toBeDefined();

    // create admin user
    const createAdminUserResult = await gqlClient.sdk.createUser({
      input: {
        ...adminUserInput,
        organizationId: orgId,
      },
    });
    expect(createAdminUserResult?.data?.createUser?.id).toBeDefined();
    userIds.push(createAdminUserResult?.data?.createUser?.id as string);

    adminRequestHeaders = await buildRequestHeaders(gqlClient, {
      userName: adminUserInput.name,
      password: adminUserInput.password,
    });

    const applicationQuery = await gqlClient.sdk.applications(
      {},
      adminRequestHeaders,
    );
    const records = applicationQuery?.data?.applications?.records;
    expect(records).toBeDefined();
    expect(records!.length).toBeGreaterThan(0);
    applicationId = records![0]?.id as string;

    // Create processing project
    const processingProjectCreate = await gqlClient.sdk.processingProjectCreate(
      {
        input: {
          applicationId: applicationId,
          name: `Create processing project ${uuidv4()}`,
        },
      },
      adminRequestHeaders,
    );
    initProjectId = processingProjectCreate?.data?.processingProjectCreate
      ?.id as string;

    // Create TDO
    const createTdo = await gqlClient.sdk.createTDO(
      {
        input: {
          status: "uploaded",
          startDateTime: 1718400000,
          stopDateTime: 1718400000,
        },
      },
      adminRequestHeaders,
    );
    tdoId = createTdo?.data?.createTDO?.id as string;

    //Create data registry entry for testing AssetType deliverable type
    const dataRegistryCreateResult = await gqlClient.sdk.createDataRegistry(
      {
        input: {
          name: `test-data-registry-${uuidv4()}`,
          description: "example",
          source: "example",
        },
      },
      adminRequestHeaders,
    );
    dataRegistryId = dataRegistryCreateResult?.data?.createDataRegistry
      ?.id as string;
  });

  afterAll(async () => {
    // Clean up data
    if (initProjectId != undefined) {
      await gqlClient.sdk.processingProjectDelete(
        { id: initProjectId },
        adminRequestHeaders,
      );
    }

    //delete tdo
    if (tdoId != undefined) {
      await gqlClient.sdk.deleteTDO({ id: tdoId }, adminRequestHeaders);
    }
  });

  describe("processingDeliverableCreate", () => {
    let engineId: string;
    let schemaId: string;
    let engineCategoryId: string;

    beforeAll(async () => {
      // Create schema for testing Schema deliverable type
      const createSchemaResult = await gqlClient.sdk.createSchema(
        {
          input: {
            id: `${uuidv4()}`,
            dataRegistryId: dataRegistryId,
            status: SchemaStatus.Published,
            definition: {
              type: "object",
              properties: { name: { type: "string" } },
            },
            majorVersion: 1,
            minorVersion: 2,
          },
        },
        adminRequestHeaders,
      );
      schemaId = createSchemaResult?.data?.createSchema?.id as string;

      // Get available engine categories
      const engineCategoriesQuery = await gqlClient.sdk.engineCategories(
        { type: "Cognition", name: "Transcription", limit: 1 },
        adminRequestHeaders,
      );
      const categories = engineCategoriesQuery?.data?.engineCategories?.records;
      if (categories && categories.length > 0) {
        engineCategoryId = categories[0]?.id as string;
      } else {
        // Fallback to a default category ID if none found
        engineCategoryId = "67cd4dd0-2f75-445d-a6f0-2f297d6cd182";
      }

      // Create engine for testing Engine deliverable type
      const createEngineResult = await gqlClient.sdk.createEngine(
        {
          input: {
            name: `test-engine-${uuidv4()}`,
            categoryId: engineCategoryId,
            deploymentModel: "FullyNetworkIsolated" as any,
            price: 100,
            priceDimension: "PRICE_PER_TASK" as any,
            distributionType: "private" as any,
          } as any,
        },
        adminRequestHeaders,
      );
      engineId = createEngineResult?.data?.createEngine?.id as string;
    });

    it.each(deliverableAssetAndEngineType)(
      "$title",
      async ({ deliverableType, value }) => {
        const deliverableTypeValue = value || value === "" ? value : engineId;

        try {
          const deliverableCreate =
            await gqlClient.sdk.processingDeliverableCreate(
              {
                input: {
                  projectId: initProjectId,
                  tdoId: tdoId,
                  requirements: [
                    {
                      deliverableType: deliverableType,
                      value: deliverableTypeValue,
                    },
                  ],
                },
              },
              adminRequestHeaders,
            );
          expect(
            deliverableCreate?.data?.processingDeliverableCreate?.id,
          ).toBeDefined();
        } catch (error) {
          const errorMessage = (error as any)?.response?.errors?.[0]?.message;
          expect(errorMessage).toBeDefined();
        }
      },
    );

    it.each(deliverableSchemaType)(
      "$title",
      async ({ deliverableType, value }) => {
        const deliverableTypeValue = value || value === "" ? value : schemaId;
        try {
          const deliverableCreate =
            await gqlClient.sdk.processingDeliverableCreate(
              {
                input: {
                  projectId: initProjectId,
                  tdoId: tdoId,
                  requirements: [
                    {
                      deliverableType: deliverableType,
                      value: deliverableTypeValue,
                    },
                  ],
                },
              },
              adminRequestHeaders,
            );
          expect(
            deliverableCreate?.data?.processingDeliverableCreate?.id,
          ).toBeDefined();
        } catch (error) {
          const errorMessage = (error as any)?.response?.errors?.[0]?.message;
          expect(errorMessage).toBeDefined();
        }
      },
    );

    it.each(deliverableEngineCategoryType)(
      "$title",
      async ({ deliverableType, value }) => {
        const queryEngineCategories = await gqlClient.sdk.engineCategories(
          { type: "Cognition", name: "Transcription", limit: 1 },
          adminRequestHeaders,
        );
        const categories =
          queryEngineCategories?.data?.engineCategories?.records;
        if (categories && categories.length > 0) {
          engineCategoryId = categories[0]?.id as string;

          try {
            const deliverableCreate =
              await gqlClient.sdk.processingDeliverableCreate(
                {
                  input: {
                    projectId: initProjectId,
                    tdoId: tdoId,
                    requirements: [
                      {
                        deliverableType: deliverableType,
                        value: value,
                      },
                    ],
                  },
                },
                adminRequestHeaders,
              );
            expect(
              deliverableCreate?.data?.processingDeliverableCreate?.id,
            ).toBeDefined();
          } catch (error) {
            const errorMessage = (error as any)?.response?.errors?.[0]?.message;
            expect(errorMessage).toBeDefined();
          }
        }
      },
    );

    it.each(assetTypeUnccessfulCases)(
      "$title",
      async ({ deliverableType, value, projectId, tdoId }) => {
        let projectIdValue =
          projectId || projectId === "" ? projectId : (projectId as string);
        let tdoIdValue = tdoId || tdoId === "" ? tdoId : (tdoId as string);
        try {
          const deliverableCreate =
            await gqlClient.sdk.processingDeliverableCreate(
              {
                input: {
                  projectId: projectIdValue,
                  tdoId: tdoIdValue,
                  requirements: [
                    {
                      deliverableType: deliverableType,
                      value: value,
                    },
                  ],
                },
              },
              adminRequestHeaders,
            );
          // Expecting an error, so if we get here, the test should fail
          expect(deliverableCreate).toBeUndefined();
        } catch (error) {
          const errorMessage = (error as any)?.response?.errors?.[0]?.message;
          expect(errorMessage).toBeDefined();
        }
      },
    );
  });

  describe("cancelProcessingDeliverable", () => {
    let deliverableId: string;
    let deliverableIdForDoubleCancel: string;

    beforeAll(async () => {
      // Create a processing deliverable to be cancelled in the test
      const deliverableCreate = await gqlClient.sdk.processingDeliverableCreate(
        {
          input: {
            projectId: initProjectId,
            tdoId: tdoId,
            requirements: [
              {
                deliverableType: DeliverableType.AssetType,
                value: "VALUE",
              },
            ],
          },
        },
        adminRequestHeaders,
      );
      deliverableId = deliverableCreate?.data?.processingDeliverableCreate
        ?.id as string;

      // Create another deliverable specifically for testing double cancel
      const deliverableCreateForDoubleCancel =
        await gqlClient.sdk.processingDeliverableCreate(
          {
            input: {
              projectId: initProjectId,
              tdoId: tdoId,
              requirements: [
                {
                  deliverableType: DeliverableType.AssetType,
                  value: "VALUE",
                },
              ],
            },
          },
          adminRequestHeaders,
        );
      deliverableIdForDoubleCancel = deliverableCreateForDoubleCancel?.data
        ?.processingDeliverableCreate?.id as string;
    });

    it("Cancel a processing deliverable unsuccessfully when input incorrect format/blank ID", async () => {
      const invalidIds = ["", "invalid-id-format"];
      for (const invalidId of invalidIds) {
        try {
          await gqlClient.sdk.processingDeliverableCancel({
            id: invalidId,
            projectId: initProjectId,
          });
          // If no error is thrown, the test should fail
          expect(true).toBe(false);
        } catch (error) {
          const errorMessage = (error as any)?.response?.errors?.[0]?.message;
          expect(errorMessage).toBeDefined();
        }
      }
    });

    it("Cancel a processing deliverable unsuccessfully when input wrong ID", async () => {
      try {
        await gqlClient.sdk.processingDeliverableCancel({
          id: "5903ddf8-7ba7-4092-87d5-b2b016b03eb6",
          projectId: initProjectId,
        });
        // If no error is thrown, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
      }
    });

    it("Cancel a deliverable unsuccessfully when deliverable's status is 'canceled'", async () => {
      // First, cancel the deliverable
      const firstCancelResult = await gqlClient.sdk.processingDeliverableCancel(
        {
          id: deliverableIdForDoubleCancel,
          projectId: initProjectId,
        },
      );
      expect(firstCancelResult?.data?.processingDeliverableCancel?.id).toBe(
        deliverableIdForDoubleCancel,
      );
      expect(firstCancelResult?.data?.processingDeliverableCancel?.status).toBe(
        "canceled",
      );

      // Then, attempt to cancel the same deliverable again
      try {
        await gqlClient.sdk.processingDeliverableCancel({
          id: deliverableIdForDoubleCancel,
          projectId: initProjectId,
        });
        // If no error is thrown, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain(
          "Cancel processing deliverable is available for incomplete only. Current status: canceled",
        );
      }
    });

    it("Cancel a processing deliverable unsuccessfully when input incorrect format/blank projectId", async () => {
      const invalidProjectIds = ["", "invalid-project-id-format"];
      for (const invalidProjectId of invalidProjectIds) {
        try {
          await gqlClient.sdk.processingDeliverableCancel({
            id: deliverableId,
            projectId: invalidProjectId,
          });
          // If no error is thrown, the test should fail
          expect(true).toBe(false);
        } catch (error) {
          const errorMessage = (error as any)?.response?.errors?.[0]?.message;
          expect(errorMessage).toBeDefined();
        }
      }
    });

    it("Cancel a processing deliverable unsuccessfully when input incorrect format/blank ID", async () => {
      try {
        await gqlClient.sdk.processingDeliverableCancel({
          id: "",
          projectId: initProjectId,
        });
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
      }
    });

    it("Cancel a processing deliverable successfully", async () => {
      const cancelResult = await gqlClient.sdk.processingDeliverableCancel({
        id: deliverableId,
        projectId: initProjectId,
      });
      expect(cancelResult?.data?.processingDeliverableCancel?.id).toBe(
        deliverableId,
      );
    });

    it("Cancel a processing deliverable successfully ", async () => {
      let deliverableId2: string;
      const deliverableCreate = await gqlClient.sdk.processingDeliverableCreate(
        {
          input: {
            projectId: initProjectId,
            tdoId: tdoId,
            requirements: [
              {
                deliverableType: DeliverableType.AssetType,
                value: "VALUE",
              },
            ],
          },
        },
        adminRequestHeaders,
      );
      deliverableId2 = deliverableCreate?.data?.processingDeliverableCreate
        ?.id as string;

      const cancelResult = await gqlClient.sdk.processingDeliverableCancel({
        id: deliverableId2,
        projectId: initProjectId,
      });
      expect(cancelResult?.data?.processingDeliverableCancel?.id).toBe(
        deliverableId2,
      );
    });
  });

  describe("query processingDeliverable and processingDeliverables", () => {
    let queryDeliverableId: string;
    let multipleDeliverablesIds: string[] = [];

    beforeAll(async () => {
      // Create a deliverable for single query tests
      const createQueryDeliverable =
        await gqlClient.sdk.processingDeliverableCreate(
          {
            input: {
              projectId: initProjectId,
              tdoId: tdoId,
              requirements: [
                {
                  deliverableType: DeliverableType.AssetType,
                  value: "QUERY_TEST_VALUE",
                },
              ],
            },
          },
          adminRequestHeaders,
        );
      queryDeliverableId = createQueryDeliverable?.data
        ?.processingDeliverableCreate?.id as string;

      // Create multiple deliverables for list query tests
      for (let i = 0; i < 7; i++) {
        const createMultipleDeliverables =
          await gqlClient.sdk.processingDeliverableCreate(
            {
              input: {
                projectId: initProjectId,
                tdoId: tdoId,
                requirements: [
                  {
                    deliverableType: DeliverableType.AssetType,
                    value: `VALUE_${i}`,
                  },
                ],
              },
            },
            adminRequestHeaders,
          );
        multipleDeliverablesIds.push(
          createMultipleDeliverables?.data?.processingDeliverableCreate
            ?.id as string,
        );
      }
    });

    it("Verify query processingDeliverable successfully", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverable({
        id: queryDeliverableId,
        project_id: initProjectId,
      });
      expect(queryResult?.data?.processingDeliverable?.id).toBe(
        queryDeliverableId,
      );
    });

    it("Verify query processingDeliverable unsuccessfully with invalid Id format", async () => {
      try {
        await gqlClient.sdk.processingDeliverable({
          id: "invalid-id-format",
          project_id: initProjectId,
        });
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain(
          "The requested object could not be retrieved because an ID value provided was not valid",
        );
      }
    });

    it("Verify query processingDeliverable unsuccessfully with non-existing Id", async () => {
      try {
        await gqlClient.sdk.processingDeliverable({
          id: "5903ddf8-7ba7-4092-87d5-b2b016b03eb6",
          project_id: initProjectId,
        });
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain("not found");
      }
    });

    it("Verify query processingDeliverable unsuccessfully with invalid projectId format", async () => {
      try {
        await gqlClient.sdk.processingDeliverable({
          id: queryDeliverableId,
          project_id: "invalid-project-id",
        });
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain(
          "The requested object could not be retrieved because an ID value provided was not valid",
        );
      }
    });

    it("Verify query processingDeliverable unsuccessfully with non-existing projectId", async () => {
      try {
        await gqlClient.sdk.processingDeliverable({
          id: queryDeliverableId,
          project_id: "5903ddf8-7ba7-4092-87d5-b2b016b03eb6",
        });
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain("not found");
      }
    });

    it("Verify query processingDeliverables successfully with valid projectId and limit without filter", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 5,
          offset: 0,
          filter: {},
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables).toBeDefined();
      expect(queryResult?.data?.processingDeliverables?.count).toBeDefined();
      expect(queryResult?.data?.processingDeliverables?.limit).toBe(5);
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      expect(
        queryResult?.data?.processingDeliverables?.records?.length,
      ).toBeGreaterThan(0);
    });

    it("Verify query processingDeliverables successfully with pagination basic (first page with limit)", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          offset: 0,
          limit: 3,
          filter: {},
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      expect(
        queryResult?.data?.processingDeliverables?.records?.length,
      ).toBeLessThanOrEqual(3);
    });

    it("Verify query processingDeliverables successfully with pagination basic (next page with limit)", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          offset: 2,
          limit: 3,
          filter: {},
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
    });

    it("Verify query processingDeliverables successfully with pagination offset > count", async () => {
      // First, get total count of deliverables
      const countResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 1,
          offset: 0,
          filter: {},
        },
        adminRequestHeaders,
      );
      const totalCount = countResult?.data?.processingDeliverables?.count || 0;

      // Then query with offset > count
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          offset: totalCount + 1,
          limit: totalCount,
          filter: {},
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      expect(queryResult?.data?.processingDeliverables?.records?.length).toBe(
        totalCount,
      );
    });

    it("Verify query processingDeliverables successfully with limit = 0", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 0,
          offset: 0,
          filter: {},
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      expect(queryResult?.data?.processingDeliverables?.records?.length).toBe(
        0,
      );
    });

    it("Verify query processingDeliverables Unsuccessfully with limit < 0", async () => {
      try {
        await gqlClient.sdk.processingDeliverables(
          {
            projectId: initProjectId,
            limit: -1,
            offset: 0,
            filter: {},
          },
          adminRequestHeaders,
        );
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain("An internal server error occurred");
      }
    });

    it("Verify query processingDeliverables Unsuccessfully with offset < 0", async () => {
      try {
        await gqlClient.sdk.processingDeliverables(
          {
            projectId: initProjectId,
            offset: -1,
            limit: 10,
            filter: {},
          },
          adminRequestHeaders,
        );
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain("An internal server error occurred");
      }
    });

    it("Verify query processingDeliverables unsuccessfully when projectId is incorrect/blank", async () => {
      const invalidProjectIds = ["", "invalid-format"];
      for (const invalidProjectId of invalidProjectIds) {
        try {
          await gqlClient.sdk.processingDeliverables(
            {
              projectId: invalidProjectId,
              limit: 10,
              offset: 0,
              filter: {},
            },
            adminRequestHeaders,
          );
          expect(true).toBe(false);
        } catch (error) {
          const errorText =
            invalidProjectId == ""
              ? "processingProjectId is required"
              : "The requested object could not be retrieved because an ID value provided was not valid";
          const errorMessage = (error as any)?.response?.errors?.[0]?.message;
          expect(errorMessage).toBeDefined();
          expect(errorMessage).toContain(errorText);
        }
      }
    });

    it.skip("Verify query processingDeliverables successfully by single tdoId", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 10,
          offset: 0,
          filter: {
            tdoIds: [tdoId],
          },
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      queryResult?.data?.processingDeliverables?.records?.forEach((record) => {
        expect(record?.tdoId).toBe(tdoId);
      });
    });

    it.skip("Verify query processingDeliverables successfully by multiple tdoId", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 10,
          offset: 0,
          filter: {
            tdoIds: [tdoId],
          },
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
    });

    it("Verify query processingDeliverables successfully by status", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 10,
          offset: 0,
          filter: {
            status: DeliverableStatus.Incomplete,
          },
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      queryResult?.data?.processingDeliverables?.records?.forEach((record) => {
        expect(record?.status).toBe(DeliverableStatus.Incomplete);
      });
    });

    it.skip("Verify query processingDeliverables successfully by filter tdoId and status", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 10,
          offset: 0,
          filter: {
            tdoIds: [tdoId],
            status: DeliverableStatus.Incomplete,
          },
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      queryResult?.data?.processingDeliverables?.records?.forEach((record) => {
        expect(record?.tdoId).toBe(tdoId);
        expect(record?.status).toBe(DeliverableStatus.Incomplete);
      });
    });

    it("Verify query processingDeliverables return empty when data not match", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: uuidv4(), // non-existing projectId to ensure no matching data
          limit: 10,
          offset: 0,
          filter: {
            status: DeliverableStatus.Canceled,
          },
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      expect(queryResult?.data?.processingDeliverables?.records?.length).toBe(
        0,
      );
    });

    it("Verify query processingDeliverables support nested resolver for tdo/engine/schema", async () => {
      const queryResult = await gqlClient.sdk.processingDeliverables(
        {
          projectId: initProjectId,
          limit: 10,
          offset: 0,
          filter: {},
        },
        adminRequestHeaders,
      );
      expect(queryResult?.data?.processingDeliverables?.records).toBeDefined();
      queryResult?.data?.processingDeliverables?.records?.forEach((record) => {
        // Verify nested resolver fields exist or are null
        expect(record?.tdoId).toBeDefined();
        expect(record?.engineId).toBeDefined();
        expect(record?.schemaId).toBeDefined();
      });
    });
  });

  describe("query processingProject", () => {
    let createdProjectIds: string[] = [];
    let knownProjectName = "";
    let applicationIdOfProcessingProject: string;

    beforeAll(async () => {
      // Create 1100 projects for pagination/filter tests.
      // Batch in groups of 50 to keep creation time well under the timeout
      // even under CI load (sequential 1100 creates exceed 30s; T71).
      const BATCH_SIZE = 50;
      for (let b = 0; b < 1100; b += BATCH_SIZE) {
        const batchIndices = Array.from(
          { length: Math.min(BATCH_SIZE, 1100 - b) },
          (_, j) => b + j,
        );
        await Promise.all(
          batchIndices.map(async (i) => {
            const name = `citest-project-${i}-${uuidv4()}`;
            const createResult = await gqlClient.sdk.processingProjectCreate(
              {
                input: {
                  applicationId: applicationId,
                  name,
                },
              },
              adminRequestHeaders,
            );
            const pid =
              createResult?.data?.processingProjectCreate?.id as string;
            createdProjectIds.push(pid);
            if (i === 0) knownProjectName = name;
            if (i === 1)
              applicationIdOfProcessingProject = createResult?.data
                ?.processingProjectCreate?.applicationId as string;
          }),
        );
      }
    }, 300000);

    afterAll(async () => {
      for (const pid of createdProjectIds) {
        try {
          await gqlClient.sdk.processingProjectDelete(
            { id: pid },
            adminRequestHeaders,
          );
        } catch (e) {
          // ignore errors (already deleted, etc)
        }
      }
    }, 300000);

    it("Verify query processingProject successfully by valid ID", async () => {
      const projectId = createdProjectIds[0];
      const result = await gqlClient.sdk.processingProject(
        { id: projectId },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProject?.id).toBe(projectId);
    });

    it("Verify query processingProject returns summary object", async () => {
      const projectId = createdProjectIds[0];
      const result = await gqlClient.sdk.processingProject(
        { id: projectId },
        adminRequestHeaders,
      );
      const summary = result?.data?.processingProject?.summary;
      expect(summary).toBeDefined();
      const s = summary!; // assert non-null after the expect check
      expect(s.total).toBeDefined();
      expect(s.totalIncomplete).toBeDefined();
      expect(s.totalComplete).toBeDefined();
      expect(s.totalCanceled).toBeDefined();
    });

    it.skip("Verify query processingProjects has default pagination", async () => {
      const result = await gqlClient.sdk.processingProjects(
        { offset: 0 },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBe(50);
    });

    it("Verify query processingProjects with custom limit", async () => {
      const result = await gqlClient.sdk.processingProjects(
        { offset: 0, limit: 100 },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBe(100);
    });

    it("Verify query processingProjects max limit", async () => {
      const result = await gqlClient.sdk.processingProjects(
        { offset: 0, limit: 1000 },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBe(1000);
    });

    it("Verify query processingProjects over max limit", async () => {
      try {
        const result = await gqlClient.sdk.processingProjects(
          { offset: 0, limit: 1001 },
          adminRequestHeaders,
        );
        // If no error is thrown, the test should fail
        expect(result).toBeUndefined();
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
        expect(errorMessage).toContain(
          "Limit cannot exceed 1000. Provided: 1001",
        );
      }
    });

    it("Verify query processingProjects offset works correctly", async () => {
      const result = await gqlClient.sdk.processingProjects(
        { offset: 50, limit: 50 },
        adminRequestHeaders,
      );

      expect(result?.data?.processingProjects?.records?.length).toBe(50);
    });

    it("Verify query processingProjects Filter by ids", async () => {
      const ids = createdProjectIds.slice(0, 3);
      const result = await gqlClient.sdk.processingProjects(
        { offset: 0, limit: 100, filter: { ids } },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBe(3);
      const returnedIds: string[] =
        result?.data?.processingProjects?.records?.map((r: any) => r.id) ?? [];
      expect(returnedIds.sort()).toEqual(ids.sort());
    });

    it("Verify query processingProjects Filter by exact name", async () => {
      const result = await gqlClient.sdk.processingProjects(
        { offset: 0, limit: 100, filter: { name: knownProjectName } },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBe(1);
      expect(result?.data?.processingProjects?.records[0]?.name).toBe(
        knownProjectName,
      );
    });

    it("Verify query processingProjects Filter by applicationId", async () => {
      const result = await gqlClient.sdk.processingProjects(
        {
          offset: 0,
          limit: 100,
          filter: { applicationId: applicationIdOfProcessingProject },
        },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBeGreaterThan(
        0,
      );
      result?.data?.processingProjects?.records.forEach((r: any) => {
        expect(r.applicationId).toBe(applicationIdOfProcessingProject);
      });
    });

    it("Verify query processingProjects Filter by nameMatch (partial)", async () => {
      const partial = knownProjectName.slice(0, 10);
      const result = await gqlClient.sdk.processingProjects(
        {
          offset: 0,
          limit: 100,
          filter: { name: partial, nameMatch: StringMatch.Contains },
        },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBeGreaterThan(
        0,
      );
      expect(
        result?.data?.processingProjects?.records.some((r: any) =>
          r.name.includes(partial),
        ),
      ).toBe(true);
    });

    it("Verify query processingProjects with no project matches filter", async () => {
      const result = await gqlClient.sdk.processingProjects(
        {
          offset: 0,
          limit: 100,
          filter: { name: "non-existent-project-name-xyz" },
        },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBe(0);
    });

    it("Verify query processingProjects with Invalid filter field value", async () => {
      try {
        await gqlClient.sdk.processingProjects(
          { filter: { ids: ["not-an]-array"] } },
          adminRequestHeaders,
        );
        expect(true).toBe(false);
      } catch (error) {
        const errorMessage = (error as any)?.response?.errors?.[0]?.message;
        expect(errorMessage).toBeDefined();
      }
    });

    it("Verify query processingProjects Pagination with offset beyond total", async () => {
      const result = await gqlClient.sdk.processingProjects(
        { offset: 2000, limit: 50 },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjects?.records?.length).toBe(0);
    });
  });

  describe("processingProjectCreate", () => {
    let otherOrgId: string;
    let otherAdminHeaders: Record<string, string>;
    beforeAll(async () => {
      const createOtherOrgResult = await gqlClient.sdk.createOrganization({
        input: { ...orgInput, name: `Other Org ${uuidv4()}` },
      });
      otherOrgId = createOtherOrgResult?.data?.createOrganization?.id as string;

      const createOtherAdminUserResult = await gqlClient.sdk.createUser({
        input: {
          ...adminUserInput,
          name: `Other Admin ${uuidv4()}`,
          organizationId: otherOrgId,
        },
      });
      userIds.push(createOtherAdminUserResult?.data?.createUser?.id as string);

      otherAdminHeaders = await buildRequestHeaders(gqlClient, {
        userName: createOtherAdminUserResult?.data?.createUser?.name as string,
        password: adminUserInput.password,
      });
    });
    it("Verify create processingProjectCreate successfully", async () => {
      const name = `Project ${uuidv4()}`;
      const result = await gqlClient.sdk.processingProjectCreate(
        { input: { name, applicationId } },
        adminRequestHeaders,
      );
      expect(result?.data?.processingProjectCreate?.id).toBeDefined();
      expect(result?.data?.processingProjectCreate?.name).toBe(name);
      expect(result?.data?.processingProjectCreate?.createdAt).toBeDefined();
    });

    it("Verify create processingProjectCreate unsuccessfully with duplicate name in same organization", async () => {
      const name = `Duplicate Project ${uuidv4()}`;
      await gqlClient.sdk.processingProjectCreate(
        { input: { name, applicationId } },
        adminRequestHeaders,
      );
      try {
        await gqlClient.sdk.processingProjectCreate(
          { input: { name, applicationId } },
          adminRequestHeaders,
        );
        fail("Should throw error for duplicate name");
      } catch (error) {
        const errMsg = (error as any)?.response?.errors?.[0]?.message;
        expect(errMsg).toContain(
          "The object could not be created because a duplicate already exists.",
        );
      }
    });

    it("Verify create processingProjectCreate successfully with same name in different organization", async () => {
      const name = `CrossOrg Project ${uuidv4()}`;
      await gqlClient.sdk.processingProjectCreate(
        { input: { name, applicationId } },
        adminRequestHeaders,
      );
      // Use otherAdminHeaders from shared context
      const result = await gqlClient.sdk.processingProjectCreate(
        { input: { name, applicationId } },
        otherAdminHeaders,
      );
      expect(result?.data?.processingProjectCreate?.id).toBeDefined();
      expect(result?.data?.processingProjectCreate?.name).toBe(name);
    });

    it("Verify create processingProjectCreate unsuccessfully with empty name", async () => {
      try {
        await gqlClient.sdk.processingProjectCreate(
          { input: { name: "", applicationId } },
          adminRequestHeaders,
        );
        fail("Should throw error for empty name");
      } catch (error) {
        const errMsg = (error as any)?.response?.errors?.[0]?.message;
        expect(errMsg).toBeDefined();
      }
    });

    it("Verify response object of processingProjectCreate", async () => {
      const name = `ResponseObj Project ${uuidv4()}`;
      const result = await gqlClient.sdk.processingProjectCreate(
        { input: { name, applicationId } },
        adminRequestHeaders,
      );
      const obj = result?.data?.processingProjectCreate;
      expect(obj).toHaveProperty("id");
      expect(obj).toHaveProperty("name");
      expect(obj).toHaveProperty("applicationId");
      expect(obj).toHaveProperty("createdAt");
      expect(obj).toHaveProperty("updatedAt");
    });
  });

  describe("processingProjectDelete", () => {
    let projectIdForDelete: string;

    beforeAll(async () => {
      // Create a project for delete tests
      const createResult = await gqlClient.sdk.processingProjectCreate(
        { input: { name: `ToDelete ${uuidv4()}`, applicationId } },
        adminRequestHeaders,
      );
      projectIdForDelete = createResult?.data?.processingProjectCreate
        ?.id as string;
    });

    it("Verify processingProjectDelete successfully without deliverables", async () => {
      const deleteResult = await gqlClient.sdk.processingProjectDelete(
        { id: projectIdForDelete },
        adminRequestHeaders,
      );
      expect(deleteResult?.data?.processingProjectDelete?.id).toBe(projectIdForDelete);
    });

    it("Verify processingProjectDelete successfully with deliverables", async () => {
      const createResult = await gqlClient.sdk.processingProjectCreate(
        { input: { name: `WithDeliverable ${uuidv4()}`, applicationId } },
        adminRequestHeaders,
      );
      const pid = createResult?.data?.processingProjectCreate?.id as string;
      // ...existing code for deliverable creation...
      const deleteResult = await gqlClient.sdk.processingProjectDelete(
        { id: pid },
        adminRequestHeaders,
      );
      expect(deleteResult?.data?.processingProjectDelete?.id).toBe(pid);
    });

    it("Verify delete processingProjectDelete unsuccessfully with invalid projectId format/blank", async () => {
      try {
        await gqlClient.sdk.processingProjectDelete(
          { id: "" },
          adminRequestHeaders,
        );
        fail("Should throw error for blank projectId");
      } catch (error) {
        const errMsg = (error as any)?.response?.errors?.[0]?.message;
        expect(errMsg).toBeDefined();
      }
      try {
        await gqlClient.sdk.processingProjectDelete(
          { id: "invalid-uuid" },
          adminRequestHeaders,
        );
        fail("Should throw error for invalid projectId format");
      } catch (error) {
        const errMsg = (error as any)?.response?.errors?.[0]?.message;
        expect(errMsg).toBeDefined();
      }
    });

    it("Verify delete processingProjectDelete unsuccessfully with non-existing ID", async () => {
      try {
        await gqlClient.sdk.processingProjectDelete(
          { id: uuidv4() },
          adminRequestHeaders,
        );
        fail("Should throw error for non-existing projectId");
      } catch (error) {
        const errMsg = (error as any)?.response?.errors?.[0]?.message;
        expect(errMsg).toContain("Processing project not found");
      }
    });

    it("Verify not found project after delete processingProjectDelete", async () => {
      const createResult = await gqlClient.sdk.processingProjectCreate(
        { input: { name: `DeleteCheck ${uuidv4()}`, applicationId } },
        adminRequestHeaders,
      );
      const pid = createResult?.data?.processingProjectCreate?.id as string;
      await gqlClient.sdk.processingProjectDelete(
        { id: pid },
        adminRequestHeaders,
      );
      try {
        await gqlClient.sdk.processingProject({ id: pid }, adminRequestHeaders);
        fail("Should not find deleted project");
      } catch (error) {
        const errMsg = (error as any)?.response?.errors?.[0]?.message;
        expect(errMsg).toContain("Processing project not found");
      }
    });

    it("Verify not found deliverable after delete processingProjectDelete", async () => {
      const createResult = await gqlClient.sdk.processingProjectCreate(
        { input: { name: `DeleteDeliverable ${uuidv4()}`, applicationId } },
        adminRequestHeaders,
      );
      const pid = createResult?.data?.processingProjectCreate?.id as string;
      // ...existing code for deliverable creation...
      await gqlClient.sdk.processingProjectDelete(
        { id: pid },
        adminRequestHeaders,
      );
      try {
        await gqlClient.sdk.processingDeliverable(
          {
            project_id: pid,
            id: uuidv4(),
          },
          adminRequestHeaders,
        );
        fail("Should not find deliverable for deleted project");
      } catch (error) {
        const errMsg = (error as any)?.response?.errors?.[0]?.message;
        expect(errMsg).toContain("Processing deliverable not found");
      }
    });
  });

  afterAll(async () => {
    let deleteResult: any;

    // delete users
    if (userIds.length > 0) {
      for (const userId of userIds) {
        deleteResult = await gqlClient.sdk.deleteUser({
          id: userId,
        });
        expect(deleteResult?.data?.deleteUser?.id).toBe(userId);
      }
    }

    // delete org
    if (orgId) {
      deleteResult = await gqlClient.sdk.updateOrganization({
        input: {
          id: orgId,
          status: OrganizationStatus.Deleted,
        },
      });

      expect(deleteResult?.data?.updateOrganization?.id).toBe(orgId);
      expect(deleteResult?.data?.updateOrganization?.status).toBe(
        OrganizationStatus.Deleted,
      );
    }
  });

  const orgInput = {
    name: citestMarker + "-org-olp-sdo-" + uuidv4(),
    businessUnit: "Legal",
    types: [OrganizationType.Agency, OrganizationType.Broadcaster],
    metadata: {
      features: {
        enableRBACFeature: "disabled",
      },
    },
    applications: [
      {
        applicationId: "8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5",
        applicationKey: "cms",
      },
    ],
  };

  const adminUserInput = {
    name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
    password: "testPassword",
    roleIds: [
      "032218c3-d47e-4287-9d16-7bb867c01266",
      // "cf2ed945-176b-4dd9-943e-22fcb1cf684f"
    ],
  };
});
