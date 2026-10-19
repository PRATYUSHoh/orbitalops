require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { createSubscriber } = require('./services/socketPubSub');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// Create a raw HTTP server wrapping the Express app
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log(`[socket.io] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[socket.io] Client disconnected: ${socket.id}`);
  });
});

// Subscribe to pub/sub — whatever worker/queue publishes here gets
// re-broadcast to every connected browser client.
createSubscriber((payload) => {
  io.emit('telemetry_processed', payload);
});

server.listen(PORT, HOST, () => {
  console.log(`OrbitalOps API & WebSocket server listening on ${HOST}:${PORT}`);
});
