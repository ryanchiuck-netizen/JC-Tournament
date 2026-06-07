import fs from 'fs';
const data = fs.readFileSync('dist/server.cjs', 'utf-8');
const replaced = data.replace(/const PORT = 3e3;/g, 'const PORT = 3001;');
fs.writeFileSync('dist/server-test.cjs', replaced);

import child_process from 'child_process';
const cp = child_process.spawn('npx', ['cross-env', 'NODE_ENV=production', 'node', 'dist/server-test.cjs']);

cp.stdout.on('data', d => console.log('OUT:', d.toString()));
cp.stderr.on('data', d => console.error('ERR:', d.toString()));

setTimeout(() => {
  cp.kill();
}, 5000);
