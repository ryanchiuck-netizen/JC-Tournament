import fs from 'fs';
const data = fs.readFileSync('dist/server.cjs', 'utf-8');
const replaced = data.replace(/= ?3000/g, '=28456').replace(/= ?3e3/g, '=28456');
fs.writeFileSync('dist/server-test.cjs', replaced);

import child_process from 'child_process';
const cp = child_process.spawn('npx', ['cross-env', 'PORT=28456', 'NODE_ENV=production', 'node', 'dist/server-test.cjs']);

cp.stdout.on('data', d => console.log('OUT:', d.toString()));
cp.stderr.on('data', d => console.error('ERR:', d.toString()));

let isServerUp = false;

cp.stdout.on('data', d => {
  if (d.toString().includes('Server running on http://localhost:28456')) {
     isServerUp = true;
     console.log('Server successfully booted!!');
     setTimeout(() => cp.kill(), 1000);
  }
});

setTimeout(() => {
  if (!isServerUp) {
    console.log('Server never started after 10s');
    cp.kill();
  }
}, 10000);
