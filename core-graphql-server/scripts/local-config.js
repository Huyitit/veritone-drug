const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('usage: node local-config.js input.json template.json');
  process.exit(1);
}

const cwd = path.resolve(process.cwd());
const inputFile = path.resolve(cwd, args[0]);
if (!inputFile.startsWith(cwd + path.sep) && inputFile !== cwd) {
  console.error(`Error: input file must be within the working directory: ${args[0]}`);
  process.exit(1);
}
const templateFile = path.resolve(cwd, args[1]);
if (!templateFile.startsWith(cwd + path.sep) && templateFile !== cwd) {
  console.error(`Error: template file must be within the working directory: ${args[1]}`);
  process.exit(1);
}

const config = fs.readFileSync(inputFile, { encoding: 'utf-8' });
const template = JSON.parse(
  fs.readFileSync(templateFile, { encoding: 'utf-8' })
);

const env = new Map();
for (const envVar in template) {
  if (template.hasOwnProperty(envVar)) {
    env.set('@@' + envVar.toUpperCase() + '@@', template[envVar]);
  }
}

const regex = /@@\w*@@/g;
const result = config.replace(regex, (match, strBefore, strAfter) => {
  let replaceVal = env.get(match.toUpperCase());
  if (!replaceVal) {
    console.error(`missing config setting: ${match}`);
    replaceVal = match;
  }
  return replaceVal;
});

process.stdout.write(result);
