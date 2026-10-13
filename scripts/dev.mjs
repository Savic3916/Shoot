import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' });
let expo;
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (expo && expo.exitCode === null) expo.kill();
  if (server.exitCode === null) server.kill();
}

server.on('error', (error) => {
  console.error(`Could not start the free match server: ${error.message}`);
  stop(1);
});
server.on('close', (code) => {
  if (!stopping) {
    console.error('The free match server stopped unexpectedly.');
    stop(code || 1);
  }
});

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) throw new Error('The free match server exited before startup.');
    try {
      const response = await fetch('http://127.0.0.1:4000/health', {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('The free match server did not respond on port 4000.');
}

try {
  await waitForServer();
  expo = spawn(
    process.execPath,
    ['node_modules/expo/bin/cli', 'start', '--port', '8082', ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  expo.on('error', (error) => {
    console.error(`Could not start Expo: ${error.message}`);
    stop(1);
  });
  expo.on('close', (code) => stop(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Failed to start Sideline.');
  stop(1);
}
