import { comparisonProfiles, providerConfig, PlanError } from './planner.js';
import { initialState, applyMove } from '../src/hanoi-planner.js';

function validateCount(count) {
  if (!Number.isInteger(count) || count < 2 || count > 5) throw new PlanError('Choose 2 to 5 disks.', 400, 'INVALID_COUNT');
}
export function validateHanoiPlan(value, count) {
  validateCount(count);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Array.isArray(value.moves) || value.moves.length < 1 || value.moves.length > 127) {
    throw new PlanError('The model did not return a bounded Hanoi move plan. No moves executed.', 502, 'INVALID_PLAN');
  }
  let pegs = initialState(count);
  const moves = value.moves.map((move, index) => {
    if (!move || typeof move !== 'object' || Array.isArray(move) || Object.keys(move).sort().join(',') !== 'disk,from,to' || !Number.isInteger(move.disk) || move.disk < 1 || move.disk > count || ![move.from, move.to].every(p => Number.isInteger(p) && p >= 0 && p <= 2)) {
      throw new PlanError(`Move ${index + 1} has an invalid shape. No moves executed.`, 502, 'INVALID_PLAN');
    }
    try { pegs = applyMove(pegs, move); }
    catch { throw new PlanError(`Move ${index + 1} violates the Hanoi rules. No moves executed.`, 422, 'ILLEGAL_PLAN'); }
    return { disk: move.disk, from: move.from, to: move.to };
  });
  if (pegs[2].length !== count) throw new PlanError('The model plan does not finish the puzzle on peg C. No moves executed.', 422, 'INCOMPLETE_PLAN');
  const minimum = 2 ** count - 1;
  return { moves, moveCount: moves.length, minimum, optimal: moves.length === minimum };
}

export async function makeHanoiPlan({ count, profile } = {}, options = {}) {
  validateCount(count);
  if (!['sol-standard', 'sol-ultrafast'].includes(profile)) throw new PlanError('Choose Standard or Ultrafast for Hanoi.', 400, 'INVALID_PROFILE');
  const selected = comparisonProfiles(options).find(p => p.id === profile);
  const { apiKey } = providerConfig('openai', options);
  if (!apiKey?.trim()) throw new PlanError('OpenAI is not configured. Add its API key on the server and restart.', 503, 'NOT_CONFIGURED');
  const { fetchImpl = fetch, timeoutMs = 20000 } = options;
  const controller = new AbortController(), start = performance.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: selected.model, service_tier: selected.serviceTier,
        reasoning: { effort: 'none' }, max_output_tokens: 3000, store: false,
        text: { format: { type: 'json_object' } },
        input: [
          { role: 'system', content: 'Solve Towers of Hanoi. Return JSON only with exactly one property: {"moves":[{"disk":1,"from":0,"to":2}]}. Pegs A,B,C are integers 0,1,2. Disk 1 is smallest. A peg array is bottom to top. Each move transfers exactly the top disk. Never place a larger disk on a smaller disk. Move the entire tower from A to C using B, with the minimum number of legal moves. List every move explicitly in execution order. Do not include prose, code, summaries, or any other properties.' },
          { role: 'user', content: `Solve ${count} disks. Initial state: ${JSON.stringify(initialState(count))}. Goal state: ${JSON.stringify([[], [], initialState(count)[0]])}. Return the complete moves array.` },
        ],
      }),
    });
    if (!response.ok) {
      if (selected.accessControlled && [400, 403, 404].includes(response.status)) throw new PlanError('Ultrafast is unavailable for this account or model. No puzzle moves executed.', 503, 'TIER_UNAVAILABLE');
      throw new PlanError('OpenAI could not produce a plan. Try again.', 503, 'PROVIDER_UNAVAILABLE');
    }
    const payload = await response.json();
    if (payload.status && payload.status !== 'completed') throw new PlanError('The model response was incomplete. No moves executed.', 502, 'INCOMPLETE_RESPONSE');
    const content = (payload.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []);
    if (content.some(item => item.type === 'refusal')) throw new PlanError('The model declined to produce a plan. No moves executed.', 422, 'MODEL_REFUSAL');
    let parsed;
    try { parsed = JSON.parse(content.filter(item => item.type === 'output_text').map(item => item.text).join('')); }
    catch { throw new PlanError('The model returned unreadable JSON. No moves executed.', 502, 'INVALID_PLAN'); }
    const validated = validateHanoiPlan(parsed, count);
    const actualServiceTier = typeof payload.service_tier === 'string' ? payload.service_tier : null;
    return { ...validated, count, profile, source: 'openai', model: selected.model, requestedServiceTier: selected.serviceTier, actualServiceTier, tierVerified: actualServiceTier === selected.serviceTier, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    if (error instanceof PlanError) throw error;
    if (controller.signal.aborted) throw new PlanError('OpenAI took longer than the planning deadline. No moves executed.', 504, 'PROVIDER_TIMEOUT');
    throw new PlanError('Could not reach OpenAI. No moves executed.', 503, 'PROVIDER_UNAVAILABLE');
  } finally { clearTimeout(timeout); }
}
