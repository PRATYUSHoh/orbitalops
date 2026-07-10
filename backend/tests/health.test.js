// Requires supertest + a test runner (jest) — install with:
// npm install --save-dev jest supertest
const request = require('supertest');
const app = require('../src/app');

test('GET /health returns db/redis/uptime', async () => {
  const res = await request(app).get('/health');
  expect(res.body).toHaveProperty('db');
  expect(res.body).toHaveProperty('redis');
  expect(res.body).toHaveProperty('uptime');
});