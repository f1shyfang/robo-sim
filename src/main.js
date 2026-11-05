import '@fontsource-variable/manrope';
import './style.css';
import { createSimulation } from './simulation.js';

const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const resetIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg>';
const stopIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
const orbitIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="2"/></svg>';

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="/" aria-label="Robot Studio home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>Robot Studio<span class="brand-period">.</span></a>
    <div class="header-right"><a class="compare-link" href="/hanoi">Hanoi</a><a class="compare-link" href="/compare">Compare models →</a><span class="environment-label">Interactive physics lab</span><span class="provider" id="provider"><span class="status-dot"></span><span id="provider-text">Connecting</span></span></div>
  </header>
  <main class="workspace">
    <section class="stage" aria-label="Live 3D robot simulation">
      <div class="stage-heading"><h1>From words.<br><span>To motion.</span></h1><p>A small task.<br>A world of possibility.</p></div>
      <div id="simulation" class="simulation" aria-label="Orbitable robot arm, orange cargo block and teal target platform"></div>
      <div class="scene-loading" id="scene-loading"><span class="loading-dot"></span>Preparing your workspace…</div>
      <div class="scene-top-right"><span class="live-dot"></span>LIVE SIMULATION</div>
      <div class="scene-bottom"><span class="camera-hint">${orbitIcon}Drag to orbit · Scroll to zoom</span><span class="scene-state" id="scene-state">Initializing physics</span></div>
    </section>
    <aside class="control-panel" aria-label="Robot controls">
      <div class="task-heading"><span class="task-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m16 3 11 6v14l-11 6L5 23V9l11-6Z"/><path d="m5 9 11 7 11-7M16 16v13"/></svg></span><span class="task-tag">Bulk stacking</span></div>
      <h2>Stack the shipment.</h2>
      <p class="task-description">Stack every box into stable towers on the teal pallet. The task is complete only when all boxes have settled.</p>
      <div class="task-legend"><span><i class="legend-block"></i>Orange block</span>${arrow}<span><i class="legend-target"></i>Teal platform</span></div>
      <div class="block-controls"><span id="block-count">1 block</span><button id="spawn" type="button" disabled>+ Add 5</button><button id="load-shipment" type="button" disabled>Load 20</button></div><form id="command-form">
        <label for="command">Your instruction</label>
        <div class="command-field"><textarea id="command" name="command" maxlength="300" rows="3" spellcheck="false">Stack all blocks on the platform</textarea><span class="input-hint">Plain English. Real motion.</span></div>
        <button id="run" class="run-button" type="submit" disabled><span id="run-label">Run command</span>${arrow}</button>
      </form>
      <div class="secondary-actions"><button id="reset" type="button" disabled>${resetIcon}Reset scene</button><button id="stop" type="button" disabled>${stopIcon}Stop</button></div>
      <div class="activity" aria-live="polite" aria-atomic="true"><div class="activity-heading"><span id="activity-dot" class="activity-dot"></span><strong id="activity-title">Getting ready</strong></div><p id="activity-message">Loading the robot and physics world.</p><button id="fallback" class="fallback-button" type="button" hidden>Run local demo ${arrow}</button></div>
      <div class="execution" aria-label="Task progress"><div class="execution-title"><span>Execution</span><span id="progress-label">Ready when you are</span></div><div class="progress-track"><div id="progress-fill"></div></div><div class="execution-steps"><span id="step-understand">Understand</span><span id="step-move">Move</span><span id="step-place">Place</span></div></div>
      <p class="provider-note" id="provider-note">Checking command service…</p>
    </aside>
  </main>
  <footer class="telemetry" aria-label="Live simulation measurements"><div class="telemetry-lead"><span class="live-dot"></span>World telemetry</div><dl><div><dt>Frame rate</dt><dd><span id="fps">—</span><small>fps</small></dd></div><div><dt>Command → action</dt><dd><span id="latency">—</span><small>ms</small></dd></div><div><dt>Physics contacts</dt><dd id="collisions">0</dd></div><div class="outcome-metric"><dt>Task outcome</dt><dd id="outcome">Not started</dd></div></dl><span class="physics-label">Three.js <span>/</span> Rapier physics</span></footer>
`;

const el = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
let simulation;
let state = { phase: 'ready', progress: 0 };
let busy = false;
let activeRequest;
let requestId = 0;
let lastPhase;
let initialized = false;
let successful = false;

function activity(title, message, tone = 'neutral') {
  el['activity-title'].textContent = title;
  el['activity-message'].textContent = message;
  el['activity-dot'].dataset.tone = tone;
}
function buttons() {
  el.spawn.disabled = !initialized || busy || state.phase === 'running' || (state.blockCount || 1) >= 20;
  el['load-shipment'].disabled = !initialized || busy || state.phase === 'running';
  el.run.disabled = !initialized || busy || state.phase === 'running';
  el.reset.disabled = !initialized;
  el.stop.disabled = !initialized || (!busy && state.phase !== 'running');
  el.command.disabled = busy || state.phase === 'running';
  el['run-label'].textContent = busy ? 'Understanding…' : state.phase === 'running' ? 'Robot in motion' : successful ? 'Run again' : 'Run command';
}
function cancelRequest() {
  requestId++;
  activeRequest?.abort();
  activeRequest = null;
  busy = false;
}
function update(data) {
  state = { ...state, ...data };
  el['block-count'].textContent = `${state.blockCount || 1} block${state.blockCount > 1 ? 's' : ''} · ${state.stackedCount || 0} stacked`;
  if (Number.isFinite(data.fps)) el.fps.textContent = Math.round(data.fps);
  if (Number.isFinite(data.collisions)) el.collisions.textContent = data.collisions;
  const progress = Math.max(0, Math.min(1, state.progress || 0));
  el['progress-fill'].style.transform = `scaleX(${progress})`;
  el['step-understand'].classList.toggle('complete', progress > 0 || state.phase === 'running' || state.phase === 'success');
  el['step-move'].classList.toggle('complete', progress > 0.5 || state.phase === 'success');
  el['step-place'].classList.toggle('complete', state.phase === 'success');
  const labels = { ready: 'Ready to move', running: 'Robot in motion', success: 'Shipment stacked', stopped: 'Motion stopped' };
  el['scene-state'].textContent = labels[state.phase] || state.phase;
  el['scene-state'].dataset.phase = state.phase;
  el['progress-label'].textContent = state.phase === 'running' ? `${Math.round(progress * 100)}%` : state.phase === 'success' ? 'Complete' : state.phase === 'stopped' ? 'Stopped' : 'Ready when you are';
  el.outcome.textContent = { ready: `0/${state.blockCount || 1}`, running: `${state.stackedCount || 0}/${state.blockCount || 1} stacked`, success: 'Success', stopped: 'Stopped' }[state.phase] || state.phase;
  el.outcome.dataset.phase = state.phase;
  if (state.phase !== lastPhase) {
    if (state.phase === 'success') {
      successful = true;
      activity('Task complete', 'Every block has settled in the stack on the target platform.', 'success');
    } else if (state.phase === 'running') {
      activity('Moving with purpose', 'The arm is grasping, lifting, and placing the block.');
    } else if (state.phase === 'stopped') {
      activity('Motion stopped', 'Reset the scene or run a new command to try again.');
    }
    lastPhase = state.phase;
  }
  buttons();
}
function execute(actions, start) {
  for (const action of actions) {
    if ((action.type === 'deliver' || action.type === 'stack')) {
      if (state.phase === 'success' || state.phase === 'stopped') simulation.reset();
      el.latency.textContent = Math.round(performance.now() - start);
      simulation.deliver();
    } else if (action.type === 'reset') {
      simulation.reset();
      successful = false;
      activity('Scene reset', 'Same starting position. A fresh attempt.');
    } else if (action.type === 'stop') {
      simulation.stop();
    }
  }
}

el['command-form'].addEventListener('submit', async event => {
  event.preventDefault();
  if (!initialized || busy || state.phase === 'running') return;
  const command = el.command.value.trim();
  if (!command) { activity('Add an instruction', 'Try “Place the block on the platform.”', 'error'); el.command.focus(); return; }
  const start = performance.now();
  const current = ++requestId;
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 8000);
  busy = true;
  el.fallback.hidden = true;
  activity('Understanding your command', 'The simulation keeps running while your instruction is interpreted.');
  buttons();
  try {
    const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }), signal: controller.signal });
    const result = await response.json();
    if (current !== requestId) return;
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.message || 'The command service could not complete this request.');
    if (!Array.isArray(result.actions) || result.actions.length !== 1 || result.actions.some(action => !action || typeof action !== 'object' || Array.isArray(action) || Object.keys(action).length !== 1 || !['deliver', 'stack', 'stop', 'reset'].includes(action.type))) throw new Error('The command service returned an unsupported action.');
    busy = false;
    if (result.source === 'cerebras') el['provider-text'].textContent = 'Cerebras connected';
    activity(result.source === 'local' ? 'Local command understood' : 'Command understood', result.message || 'Executing the validated robot action.');
    execute(result.actions, start);
  } catch (error) {
    if (current !== requestId) return;
    busy = false;
    activity('Command unavailable', error.name === 'AbortError' ? 'The command timed out. Try again, or run the local demo below.' : error.message, 'error');
    el.fallback.hidden = false;
  } finally {
    clearTimeout(timeout);
    if (current === requestId) { busy = false; activeRequest = null; buttons(); }
  }
});
el['load-shipment'].addEventListener('click', () => {
  if (el['load-shipment'].disabled) return;
  simulation.setBlockCount(20); el.command.value = 'Stack all blocks on the platform';
  successful = false; el.latency.textContent = '—';
  activity('20-box challenge loaded', 'Complete all four towers to finish the shipment.'); buttons();
});
el.spawn.addEventListener('click', () => {
  if (el.spawn.disabled) return;
  simulation.reset(); simulation.setBlockCount(Math.min(20, simulation.getState().blockCount + 5)); successful = false;
  el.command.value = 'Stack all blocks on the platform';
  el.latency.textContent = '—';
  activity('Block added', 'Run the command to stack every block on the platform.'); buttons();
});
el.command.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); el['command-form'].requestSubmit(); } });
el.reset.addEventListener('click', () => {
  cancelRequest();
  successful = false;
  simulation.reset();
  el.latency.textContent = '—';
  el.fallback.hidden = true;
  activity('Scene reset', 'The block and arm are back at their starting positions.');
  buttons();
});
el.stop.addEventListener('click', () => { cancelRequest(); simulation.stop(); activity('Motion stopped', 'Reset the scene or run a new command to try again.'); buttons(); });
el.fallback.addEventListener('click', () => { el.fallback.hidden = true; execute([{ type: 'deliver' }], performance.now()); activity('Running local demo', 'A preset pick-and-place action. No AI request was used.'); });

async function checkProvider() {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error();
    const health = await response.json();
    const connected = health.configured === true || health.ready === true || health.provider === 'cerebras';
    el['provider-text'].textContent = connected ? 'Cerebras configured' : 'Local demo';
    el.provider.dataset.connected = String(connected);
    el['provider-note'].textContent = connected ? 'Cerebras interprets your command. Physics runs independently, right here.' : 'Local demo mode. Add a Cerebras API key on the server to enable AI commands.';
  } catch {
    el['provider-text'].textContent = 'Service offline';
    el['provider-note'].textContent = 'Command service is offline. The scene still runs; a local demo is available after a failed command.';
  }
}
checkProvider();
try {
  simulation = await createSimulation(el.simulation, update);
  simulation.setBlockCount(20);
  initialized = true;
  el['scene-loading'].hidden = true;
  activity('Ready for your command', '20 boxes. Four towers. Stack them all to complete the challenge.');
  buttons();
} catch (error) {
  el['scene-loading'].textContent = 'The 3D scene could not start. Try a browser with WebGL enabled.';
  activity('Scene unavailable', error.message || 'Refresh to try loading the simulation again.', 'error');
  console.error(error);
}
