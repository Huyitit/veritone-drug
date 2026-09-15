const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

let getFunc;
let context;
serviceContext.app = {
  use: () => {},
  get: (path, func) => {
    getFunc = func;
  },
  middleware: {
    authenticationOption: () => {},
    loadAuthDataByToken: () => {}
  }
};
serviceContext.util = require('../test/mockUtil.js')();

let downloadFunc = (url) => {
  return `<MPD profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT43.8S" minBufferTime="PT19.9S">
      <Period id="0" start="PT0.0S">
          <AdaptationSet id="0" contentType="video" segmentAlignment="true" bitstreamSwitching="true" lang="und">
              <Representation id="0" mimeType="video/mp4" codecs="avc1.64001e" bandwidth="1026944" width="1280" height="720" frameRate="30000/1001">
                  <AudioChannelConfiguration></AudioChannelConfiguration>
                  <SegmentList timescale="1000000" duration="9976633" startNumber="1">
                      <Initialization sourceURL="https://s3.amazonaws.com/dev-api.veritone.com/7682/other/2020/2/4/mpeg_dash/12345"></Initialization>
                      <SegmentURL media="https://s3.amazonaws.com/dev-api.veritone.com/7682/other/2020/2/6/mpeg_dash/567"></SegmentURL>
                  </SegmentList>
              </Representation>
          </AdaptationSet>
      </Period>
  </MPD>`;
};

const responseBody = `<MPD profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT43.8S" minBufferTime="PT19.9S">
      <Period id="0" start="PT0.0S">
          <AdaptationSet id="0" contentType="video" segmentAlignment="true" bitstreamSwitching="true" lang="und">
              <Representation id="0" mimeType="video/mp4" codecs="avc1.64001e" bandwidth="1026944" width="1280" height="720" frameRate="30000/1001">
                  <AudioChannelConfiguration></AudioChannelConfiguration>
                  <SegmentList timescale="1000000" duration="9976633" startNumber="1">
                      <Initialization sourceURL="https://signed.com/file.json?specialCharacter=&#x26;123"></Initialization>
                      <SegmentURL media="https://signed.com/file.json?specialCharacter=&#x26;123"></SegmentURL>
                  </SegmentList>
              </Representation>
          </AdaptationSet>
      </Period>
  </MPD>`;

const mockRequest = (tdoId) => {
  return {
    context,
    params: {
      tdoId
    }
  };
};

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.sendStatus = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.writeHead = jest.fn().mockReturnValue(res);
  res.contentType = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(function () {
  context = {
    authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config
  };
});

describe('stream routes', function () {
  beforeEach(() => {
    serviceContext._clearAll();

    jest.mock('../resolvers/util.js', () => (serviceContext) => {
      return {
        authorizeAppIds: jest.fn(),
        authorizeOrgIds: jest.fn(),
        getSignedUrl: jest
          .fn()
          .mockResolvedValue(
            'https://signed.com/file.json?specialCharacter=&123'
          ),
        download: downloadFunc
      };
    });

    require('./stream.js')(serviceContext);
  });

  describe('#require', function () {
    it('should redirect in case of any error', async function () {
      const req = mockRequest('123');
      const res = mockResponse();

      await getFunc(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(302, {
        Location: 'http://localhost/media-streamer/stream/123/dash.mpd'
      });
    });

    it('should send 302', async function () {
      const req = mockRequest('123');
      const res = mockResponse();

      serviceContext.dbConnections['core'].read._push([
        {
          records: [
            {
              id: '123'
            }
          ]
        }
      ]);

      await getFunc(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(302, {
        Location: 'http://localhost/media-streamer/stream/123/dash.mpd'
      });
    });

    it('should return content', async function () {
      const req = mockRequest('123');
      const res = mockResponse();

      serviceContext.dbConnections['core'].read._push([
        {
          records: [
            {
              id: '123'
            }
          ]
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          records: [
            {
              uri: 'some_uri'
            }
          ]
        }
      ]);

      await getFunc(req, res);

      expect(res.contentType).toHaveBeenCalledWith('application/dash+xml');
      expect(res.send).toHaveBeenCalledWith(200, responseBody);
    });
  });
});
