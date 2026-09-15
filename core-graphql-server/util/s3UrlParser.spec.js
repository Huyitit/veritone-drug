const serviceContext = require('../test/serviceContext.mock.js')();
const s3UtilParser = require('./s3UrlParser.js');
const _ = require('lodash');
describe('#parseUri', function () {
  let parseUri;
  beforeAll(() => {
    parseUri = s3UtilParser(serviceContext).parseUri;
  });

  // Tests from https://github.com/aws/aws-sdk-java-v2/blob/master/services/s3/src/test/java/software/amazon/awssdk/services/s3/S3UtilitiesTest.java
  it.each([
    ['https://s3.amazonaws.com', {}, []],
    ['https://s3.amazonaws.com/', {}, []],
    ['https://s3.amazonaws.com/myBucket', { bucket: 'myBucket' }, []],
    [
      'https://s3.us-east-1.amazonaws.com/myBucket/',
      { bucket: 'myBucket', region: 'us-east-1' },
      []
    ],
    [
      'https://s3.amazonaws.com/myBucket/resources/image1.png',
      { bucket: 'myBucket', key: 'resources/image1.png' },
      []
    ],
    [
      'https://myBucket.s3.amazonaws.com/resources/image1.png',
      { bucket: 'myBucket', key: 'resources/image1.png' },
      []
    ],
    [
      'https://s3.eu-west-2.amazonaws.com/myBucket/resources/image1.png',
      {
        bucket: 'myBucket',
        key: 'resources/image1.png',
        region: 'eu-west-2'
      },
      []
    ],
    [
      'https://s3-eu-west-2.amazonaws.com/myBucket/resources/image1.png',
      {
        bucket: 'myBucket',
        key: 'resources/image1.png',
        region: 'eu-west-2'
      },
      []
    ],
    [
      'https://myBucket.s3.us-east-2.amazonaws.com/image.png',
      { bucket: 'myBucket', key: 'image.png', region: 'us-east-2' },
      []
    ],
    [
      'https://myBucket.s3-us-east-2.amazonaws.com/image.png',
      { bucket: 'myBucket', key: 'image.png', region: 'us-east-2' },
      []
    ],
    // uris with query string
    [
      'https://s3.us-west-1.amazonaws.com/myBucket/doc.txt?versionId=abc123&versionId=def456',
      {
        bucket: 'myBucket',
        key: 'doc.txt',
        region: 'us-west-1'
      },
      [
        ['versionId', 'abc123'],
        ['versionId', 'def456']
      ]
    ],
    [
      'https://s3.us-west-1.amazonaws.com/myBucket/doc.txt?versionId=abc123&partNumber=77',
      {
        bucket: 'myBucket',
        key: 'doc.txt',
        region: 'us-west-1'
      },
      [
        ['versionId', 'abc123'],
        ['partNumber', '77']
      ]
    ],
    [
      'https://myBucket.s3.us-west-1.amazonaws.com/doc.txt?versionId=abc123',
      {
        bucket: 'myBucket',
        key: 'doc.txt',
        region: 'us-west-1'
      },
      [['versionId', 'abc123']]
    ],
    [
      'https://myBucket.s3.us-west-1.amazonaws.com/doc.txt?versionId=abc123&versionId=def456',
      {
        bucket: 'myBucket',
        key: 'doc.txt',
        region: 'us-west-1'
      },
      [
        ['versionId', 'abc123'],
        ['versionId', 'def456']
      ]
    ],
    [
      'https://myBucket.s3.us-west-1.amazonaws.com/doc.txt?versionId=abc123&partNumber=77',
      {
        bucket: 'myBucket',
        key: 'doc.txt',
        region: 'us-west-1'
      },
      [
        ['versionId', 'abc123'],
        ['partNumber', '77']
      ]
    ],

    [
      'https://myBucket.s3.us-west-1.amazonaws.com/object%20key?versionId=%61%62%63%31%32%33',
      {
        bucket: 'myBucket',
        key: 'object key',
        region: 'us-west-1'
      },
      [['versionId', 'abc123']]
    ],
    // cli style uri
    ['s3://myBucket', { bucket: 'myBucket' }, []],
    ['s3://myBucket/', { bucket: 'myBucket' }, []],
    [
      's3://myBucket/resources/key',
      { bucket: 'myBucket', key: 'resources/key' },
      []
    ],
    [
      's3://my%40Bucket/object%20key',
      { bucket: 'my@Bucket', key: 'object key' },
      []
    ]
  ])('should parse uri %s', async function (uri, expected, query) {
    const result = parseUri(uri);
    expect(_.omit(result, query)).toEqual(expect.objectContaining(expected));
    if (query.length) {
      expect(Array.from(result.query.entries())).toEqual(query);
    }
  });

  it.each([
    ['myendpoint-123456789012.s3-accesspoint.us-east-1.amazonaws.com'],
    [
      'myendpoint-123456789012.s3-accesspoint-fips.dualstack.us-gov-east-1.amazonaws.com'
    ],
    [
      'myaccesspoint-123456789012.op-01234567890123456.s3-outposts.us-west-2.amazonaws.com'
    ],
    [
      'myaccesspoint-123456789012.op-01234567890123456.s3-outposts.cn-north-1.amazonaws.com.cn'
    ],
    ['https://www.amazon.com/']
  ])('should throw exception for uri %s', async function (uri) {
    expect(() => parseUri(uri)).toThrow();
  });
});
