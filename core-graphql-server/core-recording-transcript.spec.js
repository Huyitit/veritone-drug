const chaiExpect = require('chai').expect;
const _ = require('lodash');
const tool = require('./core-recording-transcript.js');

const ttml = `
<?xml version="1.0" encoding="utf-8"?>
<tt xml:lang="en-us" xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
<body region="CaptionArea">
<div>
	<p begin="00:00:00.680" end="00:00:06.260">OK we are trying this for a 2nd time to test the ability to</p>
	<p begin="00:00:06.680" end="00:00:11.200">upload and in P 3 file Hopefully this will work .</p>
</div>
</body>
</tt>
`;

describe('core-recording-transcript.js', function () {
  describe('#convertTranscript', function () {
    it('should convert', function () {
      const res = tool.convertTranscript(ttml);
      chaiExpect(res).to.exist;
    });
  });

  describe('#trimTranscript', function () {
    it('should trim', function () {
      const data = {
        textFragments: [
          {
            start: 0,
            end: 10,
            text: 'foo'
          },
          {
            start: 20,
            end: 30,
            text: 'bar'
          }
        ]
      };
      const res = tool.trimTranscript(data, 5, 20);
      chaiExpect(res.textFragments).to.exist;
      chaiExpect(res.textFragments.length).to.equal(1);
    });
  });

  describe('#applyAliases', function () {
    it('should apply aliases', function () {
      const data = {
        textFragments: [
          {
            start: 0,
            end: 10,
            text: 'goo'
          },
          {
            start: 20,
            end: 30,
            text: 'bar'
          }
        ]
      };

      const query = [
        {
          keywordAliases: ['goo'],
          keyword: 'foo'
        }
      ];
      const res = tool.applyAliases(data, query);
    });
  });
});
