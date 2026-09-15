const { presignUrl } = require('./presigner.s3');

describe('s3 presigner', function () {
  it('should presign url using static credentials', async function () {
    const url = await presignUrl({
      region: 'us-west-2',
      bucket: 'test-bucket',
      key: 'test-key',
      method: 'GET',
      credentialOptions: {
        accessKeyId: '123',
        secretAccessKey: 'abc'
      },
      ttl: 1200
    });
    expect(
      url.indexOf(
        'https://test-bucket.s3.us-west-2.amazonaws.com/test-key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=123'
      )
    ).toEqual(0);
  });
});
