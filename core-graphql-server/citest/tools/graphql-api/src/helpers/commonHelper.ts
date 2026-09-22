// @ts-ignore
import chakram from 'chakram';
import * as _ from 'lodash';
import { helpers } from './index';

const config = helpers.config;

export const safe = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err: any) {
    console.warn(`cleanup (${label}) failed: ${err?.message ?? err}`);
  }
};

export interface ImpersonateResult {
  token: string;
  requestOptions: Record<string, string>;
}
/**
 * 
 * @param superAdminToken 
 * @param userId 
 * @param organizationGuid 
 * @returns headers of specific user
 */
export async function impersonateUser(
  superAdminToken: string,
  userId: string,
  organizationGuid: string
): Promise<ImpersonateResult> {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${organizationGuid}`;
  const options = helpers.requestOptions(superAdminToken);
  const impersonated = await chakram.get(url, options);
  const token = _.get(impersonated, 'body.token');
  if (!token) {
    throw new Error(
      `impersonateUser: no token returned for user ${userId} in org ${organizationGuid}`
    );
  }

  return {
    token,
    requestOptions: helpers.requestOptions(token).headers as Record<
      string,
      string
    >
  };
}
