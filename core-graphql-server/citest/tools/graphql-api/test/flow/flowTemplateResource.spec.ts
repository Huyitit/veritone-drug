import { get } from 'lodash';
import { loadConfig } from '@api/src/config';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '@api/src/graphqlUtil';

const config = loadConfig();

interface CitestGlobals {
  citestMarker?: string;
}
const citestMarker =
  (globalThis as CitestGlobals).citestMarker || 'citest-should-delete';

const isEnableResourceTest = Boolean(
  config.apiInternalOrgLessToken && config.apiAIDataOrgToken
);

let aiDataClient: GraphqlClient;
let orglessClient: GraphqlClient;

let flowTemplateId: string;
let privateFlowTemplateId: string;
let flowName: string;

const flow =
  'W3siaWQiOiJlMTAxNGUzZi4zZWUzZSIsInR5cGUiOiJ0YWIiLCJsYWJlbCI6IkZsb3cgMSIsImRpc2FibGVkIjpmYWxzZSwiaW5mbyI6IiJ9LHsiaWQiOiI0MWU3NTk5Yy42MmQ3MTgiLCJ0eXBlIjoiYWl3YXJlLWluIiwieiI6ImUxMDE0ZTNmLjNlZTNlIiwibmFtZSI6IiIsImZvcm1hdCI6ImJ1ZmZlciIsInNhbXBsZXMiOltdLCJ0ZG9Db250ZW50Ijoie30iLCJfbXRpbWUiOjAsIngiOjE3MCwieSI6MTYwLCJ3aXJlcyI6W1siMTlmYTE2YmMuOTA2YTI5Il1dfSx7ImlkIjoiMTlmYTE2YmMuOTA2YTI5IiwidHlwZSI6ImFpd2FyZS1vdXQiLCJ6IjoiZTEwMTRlM2YuM2VlM2UiLCJuYW1lIjoiIiwic3RhdHVzQ29kZSI6MjAwLCJmYWlsdXJlTXNnIjoiIiwiZmFpbHVyZU1zZ1R5cGUiOiJzdHIiLCJmYWlsdXJlUmVhc29uIjoiIiwiZmFpbHVyZVJlYXNvblR5cGUiOiJzdHIiLCJza2lwUmVzdWx0Q2FsbGJhY2siOmZhbHNlLCJkaXNhYmxlRGVidWciOmZhbHNlLCJleGNsdWRlTWV0YWRhdGEiOmZhbHNlLCJ4Ijo0NzAsInkiOjE2MCwid2lyZXMiOltdfSx7ImlkIjoiZWY5NGRkOWMuY2JjN2EiLCJ0eXBlIjoiaHR0cCBpbiIsInoiOiJlMTAxNGUzZi4zZWUzZSIsIm5hbWUiOiJPS1RBIHZlcmlmaWNhdGlvbiBlbmRwb2ludCIsInVybCI6Ii9va3RhLXZlcmlmaWNhdGlvbiIsIm1ldGhvZCI6ImdldCIsInVwbG9hZCI6ZmFsc2UsInN3YWdnZXJEb2MiOiIiLCJ4IjoyMDAsInkiOjIyMCwid2lyZXMiOltbIjlhN2VhMDlkLjAxZTFhIl1dfSx7ImlkIjoiOWE3ZWEwOWQuMDFlMWEiLCJ0eXBlIjoiZnVuY3Rpb24iLCJ6IjoiZTEwMTRlM2YuM2VlM2UiLCJuYW1lIjoiIiwiZnVuYyI6ImNvbnN0IGhlYWRlcnMgPSBtc2cucmVxLmhlYWRlcnM7XG5jb25zdCB2ZXJpZmljYXRpb24gPSBoZWFkZXJzWyd4LW9rdGEtdmVyaWZpY2F0aW9uLWNoYWxsZW5nZSddO1xubXNnLnN0YXR1c0NvZGUgPSAyMDA7XG5tc2cucGF5bG9hZCA9IHtcbiAgICAndmVyaWZpY2F0aW9uJzogdmVyaWZpY2F0aW9uXG59O1xuXG5yZXR1cm4gbXNnOyIsIm91dHB1dHMiOjEsIm5vZXJyIjowLCJpbml0aWFsaXplIjoiIiwiZmluYWxpemUiOiIiLCJsaWJzIjpbXSwieCI6NDAwLCJ5IjoyMjAsIndpcmVzIjpbWyJmOGFmNThjYS5hOGNkMjgiXV19LHsiaWQiOiJmOGFmNThjYS5hOGNkMjgiLCJ0eXBlIjoiaHR0cCByZXNwb25zZSIsInoiOiJlMTAxNGUzZi4zZWUzZSIsIm5hbWUiOiJIdHRwIHJlc3BvbnNlIiwic3RhdHVzQ29kZSI6IiIsImhlYWRlcnMiOnt9LCJ4Ijo1ODAsInkiOjIyMCwid2lyZXMiOltdfV0=';

(isEnableResourceTest ? describe : describe.skip)(
  'citest_flow: Flow template resource test using internal orgless token and ai data token',
  () => {
    beforeAll(async () => {
      aiDataClient = await createGraphqlClient(AuthType.API_KEY);
      orglessClient = await createGraphqlClient(AuthType.ORGLESS_API_KEY);
    });

    it('create flow template by ai data org token', async () => {
      const publicResult = await aiDataClient.sdk.createFlowTemplate({
        input: {
          title: `${citestMarker} veritone flow - citest`,
          subtitle: `${citestMarker} test`,
          description: `${citestMarker} description flow`,
          categories: [],
          package: 'xxx',
          public: true,
          author: 'veritone',
          screenshots: [
            'https://automaterecipes.veritone.com/wp-content/uploads/2019/09/helloWorld-Automator.png',
            'https://automaterecipes.veritone.com/wp-content/uploads/2019/09/helloWorld-Automator.png'
          ],
          flow
        }
      });

      const privateResult = await aiDataClient.sdk.createFlowTemplate({
        input: {
          title: `${citestMarker} veritone private flow - citest`,
          subtitle: `${citestMarker} test`,
          description: `${citestMarker} description flow`,
          categories: [],
          package: 'xxx',
          public: false,
          author: 'veritone',
          screenshots: [
            'https://automaterecipes.veritone.com/wp-content/uploads/2019/09/helloWorld-Automator.png',
            'https://automaterecipes.veritone.com/wp-content/uploads/2019/09/helloWorld-Automator.png'
          ],
          flow
        }
      });

      flowTemplateId = get(publicResult, 'data.createFlowTemplate.id')!;
      privateFlowTemplateId = get(privateResult, 'data.createFlowTemplate.id')!;
      expect(flowTemplateId).toBeDefined();
      expect(privateFlowTemplateId).toBeDefined();
    });

    it('update flow template by ai data org token', async () => {
      flowName = `${citestMarker} veritone flow update - citest`;
      const result = await aiDataClient.sdk.updateFlowTemplate({
        input: {
          id: flowTemplateId,
          title: flowName,
          subtitle: 'test update',
          description: 'description flow update',
          categories: [],
          package: 'xxxxupdate'
        }
      });

      expect(get(result, 'data.updateFlowTemplate')).toBeDefined();
      expect(get(result, 'data.updateFlowTemplate.title')).toEqual(flowName);
    });

    it('Get flow template by internal orgless token', async () => {
      const result = await orglessClient.sdk.flowTemplates({
        id: flowTemplateId
      });

      expect(result?.data?.flowTemplates?.count).toEqual(1);
      expect(result?.data?.flowTemplates?.records?.[0]?.id).toEqual(
        flowTemplateId
      );
      expect(result?.data?.flowTemplates?.records?.[0]?.title).toEqual(
        flowName
      );
    });

    it('Get private flow template by internal orgless token', async () => {
      const result = await orglessClient.sdk.flowTemplates({
        id: privateFlowTemplateId
      });

      expect(result?.data?.flowTemplates?.count).toEqual(1);
      expect(result?.data?.flowTemplates?.records?.[0]?.id).toEqual(
        privateFlowTemplateId
      );
    });

    it('delete the flow template', async () => {
      const publicResult = await aiDataClient.sdk.deleteFlowTemplate({
        id: flowTemplateId
      });
      const privateResult = await aiDataClient.sdk.deleteFlowTemplate({
        id: privateFlowTemplateId
      });

      expect(get(publicResult, 'data.deleteFlowTemplate.id')).toEqual(
        flowTemplateId
      );
      expect(get(privateResult, 'data.deleteFlowTemplate.id')).toEqual(
        privateFlowTemplateId
      );
    });
  }
);
