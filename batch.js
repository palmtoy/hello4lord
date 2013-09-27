var child_process = require('child_process');

var pCnt = parseInt(process.argv[2]);

var destPath = './' + 'client.js';
console.log(destPath + ' is runnging ...');

for(var i = 0; i < pCnt; i++) {
  child_process.fork(destPath);
}
