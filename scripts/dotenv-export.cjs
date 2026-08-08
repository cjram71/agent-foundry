'use strict';
const path = require('path');
const dotenv = require('dotenv');

const file = process.argv[2] || '.env';
const checkOnly = process.argv.includes('--check');
const result = dotenv.config({ path: path.resolve(file), override: false, quiet: true });
if (result.error) {
  console.error(`dotenv: unable to parse ${file}: ${result.error.message}`);
  process.exit(1);
}
const parsed = result.parsed || {};
for (const name of Object.keys(parsed)) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    console.error(`dotenv: invalid variable name: ${name}`);
    process.exit(1);
  }
}
if (!checkOnly) {
  for (const name of Object.keys(parsed)) {
    const value = process.env[name] !== undefined ? process.env[name] : parsed[name];
    process.stdout.write(name + '\0' + value + '\0');
  }
}