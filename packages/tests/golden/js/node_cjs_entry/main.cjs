'use strict';
const { two } = require('./lib.cjs');
const path = require('path');
console.log(two + 1, path.basename('/a/b.txt'));
