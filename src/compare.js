import '@fontsource-variable/manrope';
import './style.css';
import './compare.css';
import { createSimulation } from './simulation.js';

document.title = 'Robot Studio — Model comparison';
const names = { cerebras: 'Cerebras', openai: 'OpenAI' };
const providers = Object.keys(names); // Stable scene IDs; each scene can select any profile.
let profiles = [
  { id:'sol-standard', label:'GPT-5.6 Sol · Standard', provider:'openai', model:'gpt-5.6-sol', serviceTier:'default' },
  { id:'sol-ultrafast', label:'GPT-5.6 Sol · Ultrafast', provider:'openai', model:'gpt-5.6-sol', serviceTier:'ultrafast', accessControlled:true },
  { id:'cerebras-direct', label:'Cerebras · Direct', provider:'cerebras' },
  { id:'openai-default', label:'OpenAI · Configured model', provider:'openai' },
];
const selected = { cerebras:'sol-standard', openai:'sol-ultrafast' };
const profileFor = side => profiles.find(profile => profile.id === selected[side]);
const labelFor = side => profileFor(side)?.label || names[side];
document.querySelector('#app').innerHTML = `
<header class="topbar"><a class="brand" href="/">Robot Studio<span class="brand-period">.</span></a><nav><a href="/hanoi">Towers of Hanoi</a><a href="/">Single robot</a><span aria-current="page">Model comparison</span></nav></header>
<main class="comparison">
  <div class="comparison-intro"><div><h1>Stack the whole shipment.</h1><p>20 boxes. Four towers. Every box must be stacked and settled to complete the challenge.</p></div><span class="comparison-tag">Live provider comparison</span></div>
  <form id="compare-form" class="compare-command"><label for="instruction">Instruction for both robots</label><div class="compare-input"><input id="instruction" maxlength="300" value="Stack all blocks on the platform" required /><button id="compare-run" type="submit" disabled>Run comparison <span aria-hidden="true">→</span></button></div></form>
  <div class="comparison-tools"><p id="summary" aria-live="polite">Preparing both physics worlds…</p><div><span id="block-count">20 boxes per scene</span><button id="spawn" disabled>+ Add 5 boxes</button><button id="load-shipment" disabled>Load 20 boxes</button><button id="preview" disabled>Preview stacking · no AI</button><button id="compare-reset" disabled>Reset both</button></div></div>
  <div class="comparison-grid">${providers.map(provider => `
    <section class="provider-pane" id="pane-${provider}" aria-label="${names[provider]} simulation">
      <header><div><h2 id="title-${provider}">${provider === 'cerebras' ? 'Standard' : 'Ultrafast'}</h2><p id="model-${provider}">Loading model configuration…</p></div><span class="provider-badge" id="badge-${provider}">Checking</span></header>
      <div class="profile-picker"><label for="profile-${provider}">Model & processing mode</label><select id="profile-${provider}">${profiles.map(profile => `<option value="${profile.id}" ${selected[provider] === profile.id ? 'selected' : ''}>${profile.label}</option>`).join('')}</select><p id="tier-${provider}">Requested mode; verified after a live response.</p></div>
      <div class="compare-scene" id="scene-${provider}"></div>
      <div class="pane-status"><strong id="status-${provider}">Loading physics</strong><span>Drag to orbit</span></div>
      <dl class="comparison-metrics"><div><dt>Command → action</dt><dd id="latency-${provider}">—</dd></div><div><dt>Frame rate</dt><dd id="fps-${provider}">—</dd></div><div><dt>Task outcome</dt><dd id="outcome-${provider}">Not started</dd></div></dl>
      <p class="provider-message" id="message-${provider}" aria-live="polite">The same robot, trajectory, and physics on both sides.</p>
    </section>`).join('')}</div>
  <p class="comparison-method">A single request pair, not a benchmark. Times include network, planning, and validation. Both providers get the same instruction and action schema; robot speed is identical. Different models and serving systems may produce different results. No artificial delays.</p>
</main>`;
const $ = id => document.getElementById(id);
const simulations = {}, phases = {}, results = {};
let generation = 0, controllers = [], pending = 0, ready = false;
function refreshButtons() {
  const active = pending > 0 || Object.values(phases).includes('running');
  $('compare-run').disabled = !ready || active;
  $('preview').disabled = !ready || active;
  $('instruction').disabled = active;
  $('compare-reset').disabled = !ready;
  $('spawn').disabled = !ready || active || (simulations.cerebras?.getState().blockCount || 1) >= 20;
  $('load-shipment').disabled = !ready || active;
  providers.forEach(side => { $(`profile-${side}`).disabled = active || !ready; });
}
function reset() {
  generation++;
  controllers.forEach(controller => controller.abort()); controllers = []; pending = 0;
  for (const provider of providers) {
    delete results[provider];
    showProfile(provider);
    simulations[provider]?.reset();
    $(`latency-${provider}`).textContent = '—';
    $(`message-${provider}`).textContent = 'Ready for the same instruction.';
  }
  refreshButtons();
}
function update(provider, state) {
  phases[provider] = state.phase;
  $('block-count').textContent = `${state.blockCount || 1} boxes per scene`;

  $(`fps-${provider}`).textContent = `${state.fps} fps`;
  $(`outcome-${provider}`).textContent = { ready:`0/${state.blockCount || 1} stacked`, running:`${state.stackedCount || 0}/${state.blockCount || 1} stacked`, success:`${state.blockCount || 1}/${state.blockCount || 1} complete`, stopped:'Stopped' }[state.phase];
  if (!results[provider]?.waiting && !results[provider]?.error) $(`status-${provider}`).textContent = { ready:'Ready to move', running:'Robot in motion', success:'Stack complete', stopped:'Motion stopped' }[state.phase];
  refreshButtons();
}
function summarize() {
  const a = results.cerebras, b = results.openai;
  if (a?.latency !== undefined && b?.latency !== undefined) {
    if (providers.some(side => profileFor(side)?.serviceTier && !results[side]?.tierVerified)) {
      $('summary').textContent = 'Responses received. Requested processing modes were not both verified; no speed winner declared.';
      return;
    }
    const difference = Math.abs(a.latency - b.latency);
    $('summary').textContent = difference < 1 ? 'Both validated plans arrived together in this run.' : `${labelFor(a.latency < b.latency ? 'cerebras' : 'openai')} started ${Math.round(difference)} ms earlier in this run.`;
  } else if (pending === 0) {
    $('summary').textContent = 'Comparison incomplete. Both providers need a successful response to compare latency.';
  }
}
async function runProvider(provider, command, start, current) {
  const profile = profileFor(provider);
  const controller = new AbortController(); controllers.push(controller);
  const timeout = setTimeout(() => controller.abort(), 17000);
  results[provider] = { waiting: true };
  $(`status-${provider}`).textContent = 'Waiting for model…';
  $(`message-${provider}`).textContent = 'Physics stays live while the model interprets your instruction.';
  try {
    const response = await fetch('/api/plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command, profile:profile.id}), signal:controller.signal });
    const result = await response.json();
    if (current !== generation) return;
    if (!response.ok) throw new Error(result.error || 'Provider request failed.');
    if (result.source !== profile.provider || result.profile !== profile.id || !Array.isArray(result.actions) || result.actions.length !== 1 || !result.actions[0] || Object.keys(result.actions[0]).length !== 1 || !['deliver','stack','stop','reset'].includes(result.actions[0].type)) throw new Error('Provider returned an invalid plan. No action executed.');
    const latency = performance.now() - start;
    results[provider] = { latency, tierVerified:result.tierVerified };
    $(`tier-${provider}`).textContent = result.actualServiceTier ? `Served tier: ${result.actualServiceTier}${result.tierVerified ? ' · verified' : ' · differs from requested mode'}` : 'Served tier not reported · mode unverified';
    $(`latency-${provider}`).textContent = `${Math.round(latency)} ms`;
    $(`badge-${provider}`).textContent = 'Connected';
    $(`message-${provider}`).textContent = 'Live response received. Validated action executed.';
    const action = result.actions[0].type;
    simulations[provider][action === 'deliver' ? 'deliver' : action]();
  } catch (error) {
    if (current !== generation) return;
    results[provider] = { error: true };
    $(`status-${provider}`).textContent = 'No action executed';
    $(`message-${provider}`).textContent = error.name === 'AbortError' ? 'Request timed out. Reset and retry.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (current === generation) { pending--; refreshButtons(); summarize(); }
  }
}
$('compare-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!ready || pending || Object.values(phases).includes('running')) return;
  const command = $('instruction').value.trim(); if (!command) return;
  reset(); const current = generation; const start = performance.now(); pending = 2;
  $('summary').textContent = 'Sent to both models. Measuring time to validated action…'; refreshButtons();
  providers.forEach(provider => { void runProvider(provider, command, start, current); });
});
$('compare-reset').addEventListener('click', () => { reset(); $('summary').textContent = 'Both scenes reset. Ready for a fresh comparison.'; });
$('preview').addEventListener('click', () => {
  if (!ready || pending || Object.values(phases).includes('running')) return;
  reset();
  $('summary').textContent = 'Motion preview only — no AI requests, no latency comparison.';
  providers.forEach(provider => { $(`message-${provider}`).textContent = 'Preset motion preview. This is not a provider result.'; simulations[provider].stack(); });
});
function showProfile(side) {
  const profile = profileFor(side);
  $(`title-${side}`).textContent = profile.label;
  $(`model-${side}`).textContent = `${profile.provider === 'openai' ? 'OpenAI API' : 'Cerebras API'} · ${profile.model || 'Configured model'}`;
  $(`badge-${side}`).textContent = profile.configured ? 'Configured' : 'Not configured';
  $(`tier-${side}`).textContent = profile.accessControlled ? 'Ultrafast is powered by Cerebras via OpenAI. Account access required; tier verified per response.' : 'Requested mode; verified after a live response.';
}
providers.forEach(side => $(`profile-${side}`).addEventListener('change', () => {
  reset(); selected[side] = $(`profile-${side}`).value; showProfile(side);
  $('summary').textContent = 'Selection updated. Both worlds reset for a fresh comparison.';
}));
$('spawn').addEventListener('click', () => {
  if ($('spawn').disabled) return;
  reset(); providers.forEach(side => simulations[side].setBlockCount(Math.min(20, simulations[side].getState().blockCount + 5)));
  $('summary').textContent = 'Matching boxes added. Every box counts toward the completion target.';
  refreshButtons();
});
$('load-shipment').addEventListener('click', () => {
  if ($('load-shipment').disabled) return;
  reset(); providers.forEach(side => simulations[side].setBlockCount(20));
  $('summary').textContent = 'Challenge loaded: stack all 20 boxes into four stable towers.';
});
async function health() {
  try {
    const response = await fetch('/api/health', { signal:AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (Array.isArray(data.profiles) && data.profiles.length) profiles = data.profiles;
    for (const side of providers) {
      const select = $(`profile-${side}`);
      select.replaceChildren(...profiles.map(profile => { const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.label; return option; }));
      select.value = selected[side]; showProfile(side);
      if (!profileFor(side)?.configured) $(`message-${side}`).textContent = 'Provider key not configured. Motion preview is available.';
    }
  } catch { providers.forEach(provider => { $(`badge-${provider}`).textContent = 'Service offline'; $(`model-${provider}`).textContent = 'Configuration unavailable'; }); }
}
try {
  // Initialize sequentially because the shared WASM module initializes once.
  for (const provider of providers) simulations[provider] = await createSimulation($(`scene-${provider}`), state => update(provider, state));
  providers.forEach(side => simulations[side].setBlockCount(20));
  await health();
  ready = true; refreshButtons();
  $('summary').textContent = 'Goal: 20 of 20 boxes stacked on each side. Run models or preview stacking.';
} catch (error) { $('summary').textContent = `The scenes could not start: ${error.message}`; }
window.__comparison = simulations;
window.addEventListener('pagehide', () => { generation++; controllers.forEach(c => c.abort()); Object.values(simulations).forEach(s => s.dispose()); });
