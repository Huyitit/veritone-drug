const fs = require('fs');
const { execFile } = require('child_process');
const path = require('path');

const testFilePath = process.argv[2];
if (!testFilePath) {
  console.error('Please provide the test file path as a parameter.');
  console.error('Usage: node run-isolated-tests.js <test-file-path>');
  process.exit(1);
}

const cwd = path.resolve(process.cwd());
const resolvedTestFilePath = path.resolve(cwd, testFilePath);
if (!resolvedTestFilePath.startsWith(cwd + path.sep) && resolvedTestFilePath !== cwd) {
  console.error(`Error: test file path must be within the working directory: ${testFilePath}`);
  process.exit(1);
}

function extractTestDescriptions(fileContent) {
  const regex = /it\((['"`])(.*?)\1/g;
  const matches = [];
  let match;

  while ((match = regex.exec(fileContent)) !== null) {
    matches.push(match[2]);
  }

  return matches;
}

function runTestsSequentially(testFilePath, testDescriptions) {
  if (testDescriptions.length === 0) {
    console.log('All tests passed successfully!');
    return;
  }

  const currentTest = testDescriptions.shift();

  console.log(`Running test: "${currentTest}"`);

  execFile('npx', ['jest', testFilePath, '-t', currentTest], (error, stdout, stderr) => {
    if (error) {
      console.error(`\n❌ Test failed""`);
      console.error(`Error details:\n${stderr || error.message}`);
      process.exit(1);
    } else {
      console.log(`✅ Test passed"\n`);
      runTestsSequentially(testFilePath, testDescriptions);
    }
  });
}

fs.readFile(resolvedTestFilePath, 'utf8', (err, fileContent) => {
  if (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }

  const testDescriptions = extractTestDescriptions(fileContent);
  if (testDescriptions.length === 0) {
    console.log('No tests found in the file.');
    return;
  }

  runTestsSequentially(testFilePath, testDescriptions);
});
