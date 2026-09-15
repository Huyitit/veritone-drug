import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { getCitestMarker } from '../helpers/citestGlobals';

/**
 * Custom dashboard CRUD, converted from the legacy
 * citest/customDashboard.spec.js.
 */
const citestMarker = getCitestMarker();
const stamp = new Date().toISOString();

/** Shape of the dashboard `data` JSONData blob this spec round-trips. */
interface DashboardData {
  chart?: Array<{
    id: string;
    w: number;
    h: number;
    x: number;
    y: number;
    minH: number;
    minW: number;
  }>;
  header?: Array<{ id: string }>;
}

const newDashboard: {
  hostAppId: string;
  name: string;
  description: string;
  data: DashboardData;
} = {
  hostAppId: '32babe30-fb42-11e4-89bc-27b69865858a',
  name: `${citestMarker}-CI_test_${stamp}_dashboard_name`,
  description: `${citestMarker}-CI_test_${stamp}_dashboard_description`,
  data: {
    chart: [
      {
        id: '8',
        w: 6,
        h: 4,
        x: 0,
        y: 0,
        minH: 4,
        minW: 6
      }
    ],
    header: [
      {
        id: '5'
      }
    ]
  }
};

describe('citest_dashboard :custom dashboard', () => {
  let gqlClient: GraphqlClient;
  let newDashboardId: string | null = null;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
  });

  afterAll(async () => {
    if (newDashboardId) {
      await safe('delete dashboard', () =>
        gqlClient.sdk.deleteCustomDashboard({ id: newDashboardId as string })
      );
    }
  });

  it('create dashboard', async () => {
    const result = await gqlClient.sdk.createCustomDashboard(newDashboard);
    const createdDashboard = result?.data?.createCustomDashboard ?? null;

    expect(createdDashboard).not.toBeNull();
    expect(createdDashboard?.id).toBeDefined();
    expect(createdDashboard?.hostAppId).toEqual(newDashboard.hostAppId);
    expect(createdDashboard?.name).toEqual(newDashboard.name);
    expect(createdDashboard?.description).toEqual(newDashboard.description);
    expect(createdDashboard?.data).toEqual(newDashboard.data);

    newDashboardId = createdDashboard?.id ?? null;
    expect(newDashboardId).not.toBeNull();
  });

  it('should get a custom dashboard', async () => {
    if (!newDashboardId) {
      throw new Error('newDashboardId was not set by the create dashboard test');
    }

    const result = await gqlClient.sdk.customDashboard({ id: newDashboardId });
    const dashboard = result?.data?.customDashboard ?? null;

    expect(dashboard).not.toBeNull();
    expect(dashboard?.id).toBeDefined();
    expect(dashboard?.hostAppId).toEqual(newDashboard.hostAppId);
    expect(dashboard?.name).toEqual(newDashboard.name);
    expect(dashboard?.description).toEqual(newDashboard.description);
    expect(dashboard?.data).toEqual(newDashboard.data);
  });

  it('should get custom dashboards belonging to the user', async () => {
    const result = await gqlClient.sdk.customDashboards({});
    const records = result?.data?.customDashboards?.records ?? [];

    /**
     * The record-count assertion the legacy spec carried
     * (`expect(records).toHaveLength(1)`) stays disabled. `customDashboards`
     * returns every dashboard created by the calling user, and every spec in a
     * shard runs as the same shared citest superadmin — so any dashboard left
     * behind by an earlier or concurrent run makes an exact count of 1 fail. It
     * was disabled for exactly that reason ("unexpected failure on Jenkins
     * citests") and the reason still holds. The identity assertions below are
     * what actually prove the dashboard is listed.
     */
    const dashboard = records[0] ?? null;
    expect(dashboard).not.toBeNull();
    expect(dashboard?.id).toEqual(newDashboardId);
    expect(dashboard?.name).toEqual(newDashboard.name);
    expect(dashboard?.description).toEqual(newDashboard.description);
    expect(dashboard?.data).toEqual(newDashboard.data);
  });

  it('should get dashboards based on a hostAppId filter', async () => {
    const matching = await gqlClient.sdk.customDashboards({
      hostAppId: newDashboard.hostAppId
    });
    const matchingRecords = matching?.data?.customDashboards?.records ?? [];

    // Same reason as above: no exact-length assertion on a shared-user listing.
    const dashboard = matchingRecords[0] ?? null;
    expect(dashboard).not.toBeNull();
    expect(dashboard?.id).toEqual(newDashboardId);
    expect(dashboard?.name).toEqual(newDashboard.name);
    expect(dashboard?.description).toEqual(newDashboard.description);
    expect(dashboard?.data).toEqual(newDashboard.data);

    const other = await gqlClient.sdk.customDashboards({
      hostAppId: '2d6e9991-e551-458c-9e9c-0c70aeaea456'
    });
    expect(other?.data?.customDashboards?.records ?? []).toEqual([]);
  });

  it('should update a custom dashboard', async () => {
    if (!newDashboardId) {
      throw new Error('newDashboardId was not set by the create dashboard test');
    }

    // v2: rename only — description and data must survive untouched.
    const nameV2 = `${citestMarker}-CI_test_${stamp}_dashboard_name_v2`;
    const v2 = await gqlClient.sdk.updateCustomDashboard({
      input: { id: newDashboardId, name: nameV2 }
    });
    const updatedV2 = v2?.data?.updateCustomDashboard ?? null;
    expect(updatedV2).not.toBeNull();
    expect(updatedV2?.name).toEqual(nameV2);
    expect(updatedV2?.description).toEqual(newDashboard.description);
    expect(updatedV2?.data).toEqual(newDashboard.data);

    // v3: name + description + data — `data` is replaced wholesale, not merged,
    // so the `chart` key from the original blob must be gone afterwards.
    const inputV3: {
      id: string;
      name: string;
      description: string;
      data: DashboardData;
    } = {
      id: newDashboardId,
      name: `${citestMarker}-CI_test_${stamp}_dashboard_name_v3`,
      description: `${citestMarker}-CI_test_${stamp}_dashboard_description_v3`,
      data: {
        header: [
          {
            id: '5'
          }
        ]
      }
    };
    const v3 = await gqlClient.sdk.updateCustomDashboard({ input: inputV3 });
    const updatedV3 = v3?.data?.updateCustomDashboard ?? null;
    expect(updatedV3).not.toBeNull();
    expect(updatedV3?.name).toEqual(inputV3.name);
    expect(updatedV3?.description).toEqual(inputV3.description);
    expect(updatedV3?.data).toEqual(inputV3.data);
    expect(updatedV3?.data).not.toEqual(newDashboard.data);
    expect(updatedV3?.data?.chart).toBeUndefined();
  });
});
