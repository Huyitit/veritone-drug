var snippetRegex = /<p begin="([^"]+)" end="([^"]+)">([^<]+)<\/p>/g,
  snippetRegexSingle = /<p begin="([^"]+)" end="([^"]+)">([^<]+)<\/p>/;

module.exports.convertTranscript = function convertTranscript(xmlData) {
  //console.log(snippetRegex);
  var matches = xmlData.match(snippetRegex);
  //console.log(matches);

  function convertTime(timeString) {
    var parts = timeString.split(':');
    return parseFloat(
      (
        parseFloat(parts[0]) * 3600 +
        parseFloat(parts[1]) * 60 +
        parseFloat(parts[2])
      ).toFixed(3)
    );
  }

  var snippets = [];
  if (matches) {
    var i,
      max = matches.length;
    for (i = 0; i < max; i++) {
      var match = snippetRegexSingle.exec(matches[i]);
      //console.log(i, matches[i], match);
      if (
        match[3].indexOf(
          'AUTOMATIC CLOSED CAPTIONING provided by the Microsoft'
        ) === 0
      ) {
        continue;
      }
      snippets.push({
        startTime: match[1],
        start: convertTime(match[1]),
        endTime: match[2],
        end: convertTime(match[2]),
        text: match[3]
      });
    }
  }
  //console.log(snippets);

  return {
    textFragments: snippets
  };
};

module.exports.trimTranscript = function trimTranscript(
  transcriptData,
  start,
  end
) {
  if (start === undefined && end === undefined) {
    return transcriptData;
  }

  if (!start) {
    start = 0;
  } else if (typeof start !== 'number') {
    start = parseFloat(start);
  }

  if (!end) {
    end = Number.MAX_VALUE;
  } else if (typeof end !== 'number') {
    end = parseFloat(end);
  }

  var matchingSnippers = [],
    i,
    max = transcriptData.textFragments.length;
  for (i = 0; i < max; i++) {
    var snippet = transcriptData.textFragments[i];
    if (snippet.start >= start && snippet.start < end) {
      matchingSnippers.push(snippet);
    } else if (snippet.end > start && snippet.end <= end) {
      matchingSnippers.push(snippet);
    }
  }

  return {
    textFragments: matchingSnippers
  };
};

module.exports.applyAliases = function applyAliases(transcriptData, query) {
  if (!query || !query.queryTerms || !query.queryTerms.length) {
    return transcriptData;
  }

  var queryTermsMax = query.queryTerms.length,
    qti,
    fragmentsMax = transcriptData.textFragments.length,
    fi;
  for (qti = 0; qti < queryTermsMax; qti++) {
    var queryTerm = query.queryTerms[qti];
    if (queryTerm.keywordAliases && queryTerm.keywordAliases.length) {
      for (fi = 0; fi < fragmentsMax; fi++) {
        var keywordAliasMax = queryTerm.keywordAliases.length,
          kwi;
        for (kwi = 0; kwi < keywordAliasMax; kwi++) {
          var keywordAlias = queryTerm.keywordAliases[kwi],
            aliasMax = keywordAlias.aliases.length,
            ai;
          for (ai = 0; ai < aliasMax; ai++) {
            var snippet = transcriptData.textFragments[fi];
            //console.log(ai, keywordAlias.aliases[ai], '=>', keywordAlias.keyword);
            snippet.text = snippet.text.replace(
              new RegExp(keywordAlias.aliases[ai], 'g'),
              keywordAlias.keyword
            );
          }
        }
      }
    }
  }

  return transcriptData;
};
