import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.js';

test('HTTP API health, validation, local action, and simulated outage', async t => {
  const server = createApp({ apiKey: '' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.configured, false);
  assert.equal(health.provider, 'local');
  const post = command => fetch(`${base}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
  const success = await post('Place the block on the platform');
  assert.equal(success.status, 200);
  assert.deepEqual((await success.json()).actions, [{ type: 'deliver' }]);
  assert.equal((await post('x'.repeat(301))).status, 400);
  const failure = await post('__test_failure__');
  assert.equal(failure.status, 503);
  const payload = await failure.json();
  assert.equal(payload.code, 'SIMULATED_OUTAGE');
  assert.equal(payload.fallbackAvailable, true);
  assert.equal(payload.actions, undefined);
});

test('comparison API exposes configuration and refuses missing or invalid providers', async t => {
  const server = createApp({ apiKey: '', openaiApiKey: '' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health.providers.openai, { configured: false, model: 'gpt-4.1' });
  assert.equal(health.providers.cerebras.configured, false);
  const post = body => fetch(`${base}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'Place the block on the platform', ...body }) });
  for (const provider of ['cerebras', 'openai']) {
    const response = await post({ provider });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.code, 'NOT_CONFIGURED');
    assert.equal(payload.fallbackAvailable, false);
    assert.equal(payload.actions, undefined);
  }
  assert.equal((await post({ provider: 'other' })).status, 400);
  assert.equal((await post({ provider: 'openai', mode: 'local' })).status, 400);
});
