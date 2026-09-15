/**
 * Legacy non-bucket-aware S3 presigner.
 *
 * Used by source.js and other callers that pass explicit
 * { region, bucket, key, method, credentialOptions, ttl } parameters
 * for external or non-configured buckets (e.g. role-based access).
 *
 * For bucket-aware signing (configured buckets with fallback support),
 * use presigner.s3.buckets.js instead.
 */
const { S3RequestPresigner } = require('@aws-sdk/s3-request-presigner');
const parseUrl = (urlStr) => {
  const u = new URL(urlStr);
  return {
    hostname: u.hostname,
    protocol: u.protocol,
    port: u.port ? parseInt(u.port, 10) : undefined,
    path: u.pathname + u.search,
    query: Object.fromEntries(u.searchParams)
  };
};
const { formatUrl } = require('@aws-sdk/util-format-url');
const {
  fromEnv,
  fromInstanceMetadata,
  //fromContainerMetadata,
  createCredentialChain,
  fromTemporaryCredentials
} = require('@aws-sdk/credential-providers');
const { HttpRequest } = require('@smithy/protocol-http');
const { Hash } = require('@smithy/hash-node');

const STATIC_CREDENTIALS_CHAIN = createCredentialChain(
  fromEnv(),
  //fromContainerMetadata(),
  fromInstanceMetadata()
);

const createPresignedUrlWithoutClient = async ({
  region,
  bucket,
  key,
  method,
  credentialOptions,
  ttl
}) => {
  method = method || 'GET';
  const url = parseUrl(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
  let credentials = STATIC_CREDENTIALS_CHAIN;
  if (credentialOptions) {
    if (credentialOptions.roleArn) {
      credentials = fromTemporaryCredentials({
        masterCredentials: STATIC_CREDENTIALS_CHAIN,
        params: {
          RoleArn: credentialOptions.roleArn,
          RoleSessionName: `graphql-external-s3-${Date.now()}`,
          DurationSeconds: ttl || 3600
        }
      });
    } else if (
      // The shape of the credentials object was inferred from @aws-sdk/credential-provider-env
      credentialOptions.accessKeyId &&
      credentialOptions.secretAccessKey
    ) {
      credentialOptions.expiration = new Date(
        Date.now() + (ttl || 3600) * 1000
      );
      credentials = () => credentialOptions;
    }
  }

  const presigner = new S3RequestPresigner({
    credentials,
    region,
    sha256: Hash.bind(null, 'sha256')
  });

  const signedUrlObject = await presigner.presign(
    new HttpRequest({ ...url, method })
  );
  return formatUrl(signedUrlObject);
};

module.exports = {
  presignUrl: createPresignedUrlWithoutClient
};
