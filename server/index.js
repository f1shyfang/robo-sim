import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { makePlan, PlanError, providerConfig, comparisonProfiles } from './planner.js';
import { makeHanoiPlan } from './hanoi.js';

export function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));
  app.get('/api/health', (_req, res) => {
    const providers = Object.fromEntries(['cerebras', 'openai'].map(provider => {
      const { apiKey, model } = providerConfig(provider, options);
      return [provider, { configured: Boolean(apiKey?.trim()), model }];
    }));
    const configured = providers.cerebras.configured;
    res.json({ status: 'ok', provider: configured ? 'cerebras' : 'local', configured, model: configured ? providers.cerebras.model : null, providers, profiles: comparisonProfiles(options) });
  });
  let activeRequests = 0;
  app.post('/api/plan', async (req, res) => {
    if (activeRequests >= 8) return res.status(429).json({ error: 'The planner is busy. Try again in a moment.', code: 'BUSY', fallbackAvailable: req.body?.provider === undefined && req.body?.profile === undefined });
    activeRequests++;
    const started = performance.now();
    try {
      if (req.body?.mode !== undefined && req.body.mode !== 'local' && req.body.mode !== 'auto') throw new PlanError('Choose auto or local planner mode.');
      const result = await makePlan(req.body?.command, { ...options, provider: req.body?.provider, profile: req.body?.profile, forceLocal: req.body?.mode === 'local' });
      res.json(result);
    } catch (error) {
      const known = error instanceof PlanError;
      res.status(known ? error.status : 500).json({
        error: known ? error.message : 'The planner could not complete this request. Please retry.',
        code: known ? error.code : 'INTERNAL_ERROR',
        latencyMs: Math.round(performance.now() - started),
        fallbackAvailable: req.body?.provider === undefined && req.body?.profile === undefined,
      });
    } finally { activeRequests--; }
  });
  app.post('/api/hanoi-plan', async (req, res) => {
    if (activeRequests >= 8) return res.status(429).json({ error: 'The planner is busy. Try again in a moment.', code: 'BUSY', fallbackAvailable: false });
    activeRequests++;
    const started = performance.now();
    try {
      res.json(await makeHanoiPlan(req.body, options));
    } catch (error) {
      const known = error instanceof PlanError;
      res.status(known ? error.status : 500).json({ error: known ? error.message : 'The Hanoi planner could not complete this request.', code: known ? error.code : 'INTERNAL_ERROR', latencyMs: Math.round(performance.now() - started), fallbackAvailable: false });
    } finally { activeRequests--; }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get(/.*/, (_req, res, next) => res.sendFile(resolve(dist, 'index.html'), error => error && next(error)));
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid request body. Send a short JSON command.', code: 'INVALID_BODY' }));
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  createApp().listen(port, '127.0.0.1', () => console.log(`Robot planner listening on http://127.0.0.1:${port}`));
}
