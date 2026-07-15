// Combined entrypoint for single-container deployment (Render free tier).
// Runs the full app (Express + Socket.io, from index.js) in this process,
// and forks the BullMQ worker as a child process — separate memory space
// and crash isolation, but both inside one container/one Render service.

const { fork } = require('child_process');
const path = require('path');

// Starts Express + Socket.io + Redis pub/sub subscriber (see index.js)
require('./index');

function startWorker() {
  const workerProcess = fork(path.join(__dirname, 'workers/telemetryWorker.js'));

  workerProcess.on('exit', (code, signal) => {
    console.error(`[worker] exited (code=${code}, signal=${signal}) — restarting in 3s`);
    setTimeout(startWorker, 3000);
  });

  workerProcess.on('error', (err) => {
    console.error('[worker] process error:', err);
  });

  console.log(`[worker] forked with pid ${workerProcess.pid}`);
}

startWorker();