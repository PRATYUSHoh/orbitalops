require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { createSubscriber } = require('./services/socketPubSub');

const PORT = process.env.PORT || 3001;

// Create a raw HTTP server wrapping the Express app — Socket.io needs
// this raw server to attach its own WebSocket upgrade handling alongside
// Express's normal HTTP request handling.
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }, // fine for a portfolio demo; lock down origin in real prod
});

io.on('connection', (socket) => {
  console.log(`[socket.io] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[socket.io] Client disconnected: ${socket.id}`);
  });
});

// Subscribe to Redis pub/sub — whatever the worker publishes here gets
// re-broadcast to every connected browser client.
createSubscriber((payload) => {
  io.emit('telemetry_processed', payload);
});

server.listen(PORT, () => {
  console.log(`OrbitalOps API listening on :${PORT}`);
});