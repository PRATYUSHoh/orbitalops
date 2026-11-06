const request = require('supertest');
const app = require('../src/app');

describe('API Input Validation & Idempotency', () => {
  describe('POST /api/telemetry validation', () => {
    it('rejects payload with missing required fields with 400', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .send({
          satellite_id: 1,
          temperature: 45.2,
          // battery and signal_strength intentionally omitted
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Missing required field(s)');
    });

    it('rejects non-numeric telemetry values with 400', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .send({
          satellite_id: 1,
          temperature: 'scorching-hot',
          battery: 85,
          signal_strength: -75,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('must be numbers');
    });

    it('accepts valid telemetry payload and returns 201 with job/event IDs', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .send({
          satellite_id: 10,
          temperature: 42.0,
          battery: 88.5,
          signal_strength: -65.0,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('eventId');
      expect(res.body).toHaveProperty('jobId');
      expect(res.body.priority).toBe('normal');
    });

    it('assigns critical priority to anomalous telemetry (temp > 90)', async () => {
      const res = await request(app)
        .post('/api/telemetry')
        .send({
          satellite_id: 11,
          temperature: 98.4,
          battery: 85.0,
          signal_strength: -60.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.priority).toBe('critical');
    });
  });

  describe('Idempotent Processing (100ms deduplication window)', () => {
    it('deduplicates identical satellite event sent within the same 100ms bucket without double-writing', async () => {
      const satId = 99;
      const payload = {
        satellite_id: satId,
        temperature: 40.0,
        battery: 90.0,
        signal_strength: -70.0,
      };

      // Wait until the very beginning of a 100ms window so both requests comfortably hit the same bucket
      const msIntoCurrentBucket = Date.now() % 100;
      if (msIntoCurrentBucket > 30) {
        await new Promise((r) => setTimeout(r, 105 - msIntoCurrentBucket));
      }

      // First request is accepted (201 Created)
      const res1 = await request(app).post('/api/telemetry').send(payload);
      expect(res1.status).toBe(201);
      expect(res1.body).toHaveProperty('eventId');

      // Second immediate request within the 100ms bucket is deduplicated (200 OK)
      const res2 = await request(app).post('/api/telemetry').send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body).toHaveProperty('deduplicated', true);
      expect(res2.body.message).toContain('Duplicate event within 100ms window ignored');

      // Allow background queue to settle
      await new Promise((r) => setTimeout(r, 80));
    });
  });
});
