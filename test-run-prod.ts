import child_process from 'child_process';

const cp = child_process.spawn('npx', ['node', 'dist/server.cjs']);

cp.stdout.on('data', data => console.log('STDOUT:', data.toString()));
cp.stderr.on('data', data => console.error('STDERR:', data.toString()));

cp.on('close', code => {
  console.log('Exited with code', code);
});

setTimeout(() => {
  cp.kill();
  console.log('Killed after 5 seconds');
}, 5000);
