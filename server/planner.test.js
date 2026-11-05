import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, validateActions } from './planner.js';

test('local mode accepts the physical task and labels no inference honestly', async () => {
  const plan = await makePlan('Place the block on the platform', { apiKey: '' });
  assert.deepEqual(plan.actions, [{ type: 'deliver' }]);
  assert.equal(plan.source, 'local');
  assert.equal(typeof plan.latencyMs, 'number');
});

test('local parser rejects unsupported and negated commands', async () => {
  for (const command of ['fly to the moon', 'Do not place the block on the platform', '', 'x'.repeat(301)]) {
    await assert.rejects(makePlan(command, { apiKey: '' }), error => error.status === 400);
  }
});

test('only bounded action vocabulary is accepted', () => {
  for (const actions of [[{ type: 'eval' }], [{ type: 'deliver', script: 'evil' }], [], Array(2).fill({ type: 'deliver' }), null]) {
    assert.throws(() => validateActions(actions));
  }
});

test('provider plan validates output and sends credentials only to provider', async () => {
  let request;
  const plan = await makePlan('Place the block on the platform', {
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"actions":[{"type":"deliver"}]}' } }] }) };
    },
  });
  assert.equal(plan.source, 'cerebras');
  assert.equal(request.url, 'https://api.cerebras.ai/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer test-secret');
  assert.equal(JSON.stringify(plan).includes('test-secret'), false);
});

test('provider errors and invalid plans never execute local actions silently', async () => {
  for (const fetchImpl of [
    async () => ({ ok: false }),
    async () => { throw new Error('network secret'); },
    async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"actions":[{"type":"delete"}]}' } }] }) }),
  ]) {
    await assert.rejects(makePlan('Place the block on the platform', { apiKey: 'test', fetchImpl }), error => error.status >= 500 && !error.message.includes('secret'));
  }
});

test('timeout aborts slow provider request', async () => {
  await assert.rejects(makePlan('Place the block on the platform', {
    apiKey: 'test', timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
  }), error => error.code === 'PROVIDER_TIMEOUT');
});

test('explicit local retry avoids provider and outage path remains testable', async () => {
  const result = await makePlan('Place the block on the platform', { apiKey: 'test', forceLocal: true, fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal(result.source, 'local');
  await assert.rejects(makePlan('__test_failure__', { apiKey: '' }), error => error.status === 503 && error.code === 'SIMULATED_OUTAGE');
});

test('comparison sends identical task contracts to separate provider endpoints', async () => {
  const requests = [];
  const options = {
    apiKey: 'cerebras-test', openaiApiKey: 'openai-test',
    fetchImpl: async (url, request) => {
      requests.push({ url, headers: request.headers, body: JSON.parse(request.body) });
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"actions":[{"type":"deliver"}]}' } }] }) };
    },
  };
  const cerebras = await makePlan('Place the block on the platform', { ...options, provider: 'cerebras' });
  const openai = await makePlan('Place the block on the platform', { ...options, provider: 'openai' });
  assert.equal(cerebras.source, 'cerebras');
  assert.equal(openai.source, 'openai');
  assert.equal(openai.model, 'gpt-4.1');
  assert.equal(requests[1].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(requests[1].headers.Authorization, 'Bearer openai-test');
  assert.deepEqual(requests[0].body.messages, requests[1].body.messages);
  assert.equal(requests[0].body.max_completion_tokens, requests[1].body.max_completion_tokens);
  assert.equal(requests[1].body.reasoning_effort, undefined);
  assert.equal(JSON.stringify(openai).includes('openai-test'), false);
});

test('explicit providers never silently use local mode or another provider key', async () => {
  for (const provider of ['cerebras', 'openai']) {
    await assert.rejects(makePlan('Place the block on the platform', { provider, apiKey: '', openaiApiKey: '' }), error => error.code === 'NOT_CONFIGURED' && error.status === 503);
    await assert.rejects(makePlan('Place the block on the platform', { provider, forceLocal: true }), error => error.code === 'INVALID_MODE');
  }
  await assert.rejects(makePlan('Place the block on the platform', { provider: 'openai', apiKey: 'cerebras-only', openaiApiKey: '' }), error => error.code === 'NOT_CONFIGURED');
  await assert.rejects(makePlan('Place the block on the platform', { provider: 'unknown' }), error => error.code === 'INVALID_PROVIDER');
});

test('OpenAI timeout and invalid response use the same safety boundary', async () => {
  await assert.rejects(makePlan('Place the block on the platform', {
    provider: 'openai', openaiApiKey: 'test', timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
  }), error => error.code === 'PROVIDER_TIMEOUT');
  await assert.rejects(makePlan('Place the block on the platform', {
    provider: 'openai', openaiApiKey: 'test',
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"actions":[{"type":"deliver"},{"type":"reset"}]}' } }] }) }),
  }), error => error.code === 'INVALID_PLAN');
});
