const LCOV_FILE = '../coverage/lcov.info';


// LCOV PARSING -------------------------------------------------------------------------------
const fs = require('fs');

function walkFile(str) {
    var data = [], item;

    [ 'end_of_record' ].concat(str.split('\n')).forEach(function(line) {
        line = line.trim();
        var allparts = line.split(':'),
            parts = [allparts.shift(), allparts.join(':')],
            lines, fn;

        switch (parts[0].toUpperCase()) {
            case 'TN':
                item.title = parts[1].trim();
                break;
            case 'SF':
                item.file = parts.slice(1).join(':').trim();
                break;
            case 'FNF':
                item.functions.found = Number(parts[1].trim());
                break;
            case 'FNH':
                item.functions.hit = Number(parts[1].trim());
                break;
            case 'LF':
                item.lines.found = Number(parts[1].trim());
                break;
            case 'LH':
                item.lines.hit = Number(parts[1].trim());
                break;
            case 'DA':
                lines = parts[1].split(',');
                item.lines.details.push({
                    line: Number(lines[0]),
                    hit: Number(lines[1])
                });
                break;
            case 'FN':
                fn = parts[1].split(',');
                item.functions.details.push({
                    name: fn[1],
                    line: Number(fn[0])
                });
                break;
            case 'FNDA':
                fn = parts[1].split(',');
                item.functions.details.some(function(i, k) {
                    if (i.name === fn[1] && i.hit === undefined) {
                        item.functions.details[k].hit = Number(fn[0]);
                        return true;
                    }
                });
                break;
            case 'BRDA':
                fn = parts[1].split(',');
                item.branches.details.push({
                    line: Number(fn[0]),
                    block: Number(fn[1]),
                    branch: Number(fn[2]),
                    taken: ((fn[3] === '-') ? 0 : Number(fn[3]))
                });
                break;
            case 'BRF':
                item.branches.found = Number(parts[1]);
                break;
            case 'BRH':
                item.branches.hit = Number(parts[1]);
                break;
        }

        if (line.indexOf('end_of_record') > -1) {
            data.push(item);
            item = {
              lines: {
                  found: 0,
                  hit: 0,
                  details: []
              },
              functions: {
                  hit: 0,
                  found: 0,
                  details: []
              },
              branches: {
                hit: 0,
                found: 0,
                details: []
              }
            };
        }
    });

    data.shift();
    return data;
};

const readFile = async filePath => {
	try {
	  const data = await fs.promises.readFile(filePath, 'utf8')
	  return data
	}
	catch(err) {
	  console.log(err)
	}
}

async function parseLCOV(coverageFile, sourceFiles) {
    const str = await readFile(coverageFile);
	const coverage = walkFile(str);
	const map = new Map();
	for (const f of coverage) {
		if (sourceFiles.indexOf(f.file) < 0) {
			continue;
		}
        const srcFile = await readFile('../' + f.file);
        const sourceFileLines = srcFile.split('\n').map(s => {
            const m = /^\s+(async\s+)?(\w+)\s*\(/.exec(s);
            if (m === null) return s;
            return m[2];
        });
		for (const func of f.functions.details) {
			const name = sourceFileLines[func.line - 1] || func.name;
			map.set(name, func.hit)
		}
	}
	return map;
};

// LCOV PARSING -------------------------------------------------------------------------------

async function getPrometheusMetrics(operationType = 'query') {
	
	const response = await fetch(`https://prometheus.aws-prod.veritone.com/api/v1/query?query=sum%20by(operation)%20(sum_over_time(graphql_operations_total%7Btype%3D"${operationType}"%7D%5B3w%5D))`, {
		"method": "GET",
		"headers": {
		  "Content-Type": "application/json"
		}
	});
	const metricsData = await response.json();
	const map = new Map();
	for (const iterator of metricsData.data.result) {
		const op = iterator.metric.operation;
		const val = parseInt(iterator.value[1], 10);
		map.set(op, val);
	}
	return map;
}

async function getSchemaInfo(operationType = 'Query') {
	const response = await fetch("https://api.us-1.veritone.com/v3/graphql?=&=", {
		"method": "POST",
		"headers": {
		  "Content-Type": "application/json"
		},
		"body": `{\"query\":\"query {\\n  __type(name: \\\"${operationType}\\\") { \\n    fields(includeDeprecated:true) {\\n      name\\n    }\\n  }\\n}\"}`
	});
	const data = await response.json();
	return data.data.__type.fields.map(q => q.name).sort()
}

(async () => {
	const queryCoverage = await parseLCOV(LCOV_FILE, ['resolvers/Query.js']);
    const mutationCoverage = await parseLCOV(LCOV_FILE, ['resolvers/Mutation.js']);

	const promises = [
		getSchemaInfo('Query'),
		getPrometheusMetrics('query'),
		getSchemaInfo('Mutation'),
		getPrometheusMetrics('mutation')
	];
	const results = await Promise.all(promises);
	console.log(`query: have prometheus metrics ${results[1].size}/${results[0].length}`);
	console.log(`mutation: have prometheus metrics ${results[3].size}/${results[2].length}`);
    let csv = fs.createWriteStream('queries.csv');
    for (const q of results[0]) {
        csv.write(`${q}, ${results[1].get(q) || 0}, ${queryCoverage.get(q) || 0}\n`);
    }
    csv.close();

    csv = fs.createWriteStream('mutations.csv');
    for (const q of results[2]) {
        csv.write(`${q}, ${results[3].get(q) || 0}, ${mutationCoverage.get(q) || 0}\n`);
    }
    csv.close();
})();