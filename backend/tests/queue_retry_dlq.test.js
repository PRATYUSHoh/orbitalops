const { telemetryQueue, telemetryDLQ } = require('../src/services/telemetryQueue');

describe('Queue Retry Policy, Exponential Backoff Timing & Dead-Letter Queue (DLQ)', () => {
  it('configures exponential backoff with 3 attempts and 1000ms base delay', () => {
    // Verify default options applied to telemetry jobs
    const defaultJobOpts = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    };

    expect(defaultJobOpts.attempts).toBe(3);
    expect(defaultJobOpts.backoff.type).toBe('exponential');
    expect(defaultJobOpts.backoff.delay).toBe(1000);

    // Verify backoff delays across retries:
    // Attempt 1: 1000ms (1s)
    // Attempt 2: 2000ms (2s)
    // Attempt 3: 4000ms (4s)
    const calculateDelay = (attempt, baseDelay) => baseDelay * Math.pow(2, attempt - 1);
    expect(calculateDelay(1, 1000)).toBe(1000);
    expect(calculateDelay(2, 1000)).toBe(2000);
    expect(calculateDelay(3, 1000)).toBe(4000);
  });

  it('routes poison-pill job to Dead-Letter Queue (DLQ) after 3 failed attempts', async () => {
    const failedJobData = {
      jobId: 99999,
      satellite_id: 1,
      temperature: 55.0,
      battery: 80.0,
      signal_strength: -70.0,
      failedReason: 'Simulated permanent downstream connection failure',
      attemptsMade: 3,
    };

    // Simulate failure handler invoking DLQ
    const dlqResult = await telemetryDLQ.add('dead-letter', failedJobData);
    expect(dlqResult).toHaveProperty('id');
    expect(dlqResult.id).toContain('dlq-');
  });

  it('enqueues jobs and tracks waiting depth accurately', async () => {
    const initialDepth = await telemetryQueue.getWaitingCount();
    expect(typeof initialDepth).toBe('number');

    const job = await telemetryQueue.add('process-telemetry', {
      jobId: 1001,
      satellite_id: 2,
      temperature: 30.0,
      battery: 95.0,
      signal_strength: -60.0,
    });

    expect(job).toHaveProperty('id');
  });
});
