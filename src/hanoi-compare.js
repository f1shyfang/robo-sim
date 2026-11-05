import '@fontsource-variable/manrope';
import './style.css';
import './compare.css';
import './hanoi-compare.css';
import {createHanoiScene} from './hanoi-scene.js';
import {initialState,applyMove} from './hanoi-planner.js';
const modes=[{id:'standard',profile:'sol-standard',label:'Standard',tier:'default'},{id:'ultrafast',profile:'sol-ultrafast',label:'Ultrafast',tier:'ultrafast'}];
const $=id=>document.getElementById(id);
document.title='Robot Studio — Hanoi model comparison';
document.querySelector('#app').innerHTML=`
<header class="topbar"><a class="brand" href="/">Robot Studio<span class="brand-period">.</span></a><nav><a href="/hanoi">Heuristic solver</a><a href="/compare">Box comparison</a></nav></header>
<main class="comparison"><div class="comparison-intro"><div><h1>One puzzle. Two speeds.</h1><p>The same GPT-5.6 Sol model solves Hanoi in Standard and Ultrafast modes.<br>Each robot executes its model’s own validated move plan.</p></div><span class="comparison-tag">Live model planning</span></div>
<form id="hanoi-compare-form" class="hanoi-compare-controls"><div><label for="hanoi-compare-count">Puzzle size</label><select id="hanoi-compare-count"><option value="2">2 disks · minimum 3 moves</option><option value="3" selected>3 disks · minimum 7 moves</option><option value="4">4 disks · minimum 15 moves</option><option value="5">5 disks · minimum 31 moves</option></select></div><button id="hanoi-compare-run" type="submit" disabled>Let both models solve <span aria-hidden="true">→</span></button><button id="hanoi-compare-reset" type="button" disabled>Reset both</button></form>
<p id="hanoi-compare-summary" class="hanoi-comparison-summary" aria-live="polite">Preparing the two robot arms…</p>
<div class="comparison-grid">${modes.map(mode=>`<section class="provider-pane" aria-label="${mode.label} Hanoi simulation"><header><div><h2>GPT-5.6 Sol · ${mode.label}</h2><p>OpenAI API · ${mode.tier} tier requested</p></div><span id="hc-badge-${mode.id}" class="provider-badge">Checking</span></header><p class="hc-tier" id="hc-tier-${mode.id}">${mode.id==='ultrafast'?'Cerebras-powered via OpenAI. Ultrafast account access required.':'Same puzzle, prompt, reasoning setting, and output limit.'}</p><div class="compare-scene" id="hc-scene-${mode.id}"></div><div class="pane-status"><strong id="hc-status-${mode.id}">Loading physics</strong><span id="hc-fps-${mode.id}">— fps</span></div><dl class="comparison-metrics"><div><dt>Validated plan ready</dt><dd id="hc-latency-${mode.id}">—</dd></div><div><dt>Moves executed</dt><dd id="hc-moves-${mode.id}">0 / —</dd></div><div><dt>Total to solve</dt><dd id="hc-total-${mode.id}">—</dd></div></dl><p class="provider-message" id="hc-message-${mode.id}" aria-live="polite">Waiting for a model-generated plan.</p><details class="hc-plan"><summary id="hc-plan-label-${mode.id}">Model move plan</summary><ol id="hc-plan-${mode.id}"></ol></details></section>`).join('')}</div>
<p class="comparison-method">Models generate the entire move sequence. Every move and the final goal are checked before execution; invalid plans are rejected, never replaced with the local solver. The same physical arm speed is used on both sides. A single run is not a benchmark. Returned service tiers are displayed; an unverified Ultrafast request cannot claim a speed win.</p></main>`;
const scenes={},runs={};let configured=null,ready=false,epoch=0,count=3,controllers=[];
function isBusy(){return Object.values(runs).some(run=>run.pending||run.executing);}
function controls(){const busy=isBusy();$('hanoi-compare-run').disabled=!ready||busy;$('hanoi-compare-count').disabled=!ready||busy;$('hanoi-compare-reset').disabled=!ready;}
function clear(){
 epoch++;controllers.forEach(c=>c.abort());controllers=[];count=Number($('hanoi-compare-count').value);
 for(const mode of modes){$(`hc-badge-${mode.id}`).textContent=configured===null?'Checking':configured?'Key configured':'Not configured';delete runs[mode.id];scenes[mode.id]?.reset(count);$(`hc-status-${mode.id}`).textContent='Ready to solve';$(`hc-latency-${mode.id}`).textContent='—';$(`hc-moves-${mode.id}`).textContent='0 / —';$(`hc-total-${mode.id}`).textContent='—';$(`hc-message-${mode.id}`).textContent='Waiting for a model-generated plan.';$(`hc-plan-${mode.id}`).replaceChildren();$(`hc-plan-label-${mode.id}`).textContent='Model move plan';$(`hc-tier-${mode.id}`).textContent=`Requested tier: ${mode.tier} · not yet verified`;}
 controls();
}
function summary(){
 const a=runs.standard,b=runs.ultrafast;
 if(a?.pending||b?.pending){$('hanoi-compare-summary').textContent='Both requests sent. Each arm starts when its complete plan passes validation.';return;}
 if(a?.latency!=null&&b?.latency!=null&&a.verified&&b.verified){
  const delta=Math.abs(a.latency-b.latency),winner=a.latency<b.latency?'Standard':'Ultrafast';
  $('hanoi-compare-summary').textContent=`${delta<1?'Both validated plans arrived together in this run.':`${winner} produced a valid plan ${Math.round(delta)} ms earlier in this run.`} ${a.completed===a.planLength&&b.completed===b.planLength?'Both robots solved the puzzle.':'Robots execute their own plans at identical speed.'}`;
 }else if(a&&b){$('hanoi-compare-summary').textContent='No verified speed comparison: both modes must return valid plans with confirmed service tiers.';}
}
function validate(moves){
 if(!Array.isArray(moves)||!moves.length||moves.length>127)throw new Error('Invalid move sequence. No robot action executed.');
 let pegs=initialState(count);
 for(const move of moves){if(!move||typeof move!=='object'||Object.keys(move).sort().join(',')!=='disk,from,to')throw new Error('Invalid move structure.');pegs=applyMove(pegs,move);}
 if(pegs[2].length!==count)throw new Error('The plan does not finish the puzzle.');
 return moves;
}
async function solve(mode,start,current){
 const id=mode.id,controller=new AbortController();controllers.push(controller);
 const timer=setTimeout(()=>controller.abort(),22000);
 const run=runs[id]={pending:true,executing:false,completed:0};
 $(`hc-status-${id}`).textContent='Model is planning…';$(`hc-message-${id}`).textContent='Requesting a complete legal solution. Physics stays live.';
 try{
  const response=await fetch('/api/hanoi-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:mode.profile,count}),signal:controller.signal});
  const result=await response.json();if(current!==epoch)return;
  if(!response.ok)throw new Error(result.error||'The model request failed.');
  if(result.profile!==mode.profile||result.source!=='openai')throw new Error('Unexpected model response.');
  const moves=validate(result.moves);
  run.latency=performance.now()-start;run.pending=false;run.executing=true;run.planLength=moves.length;run.verified=result.tierVerified===true;
  $(`hc-latency-${id}`).textContent=`${Math.round(run.latency)} ms`;
  $(`hc-tier-${id}`).textContent=result.actualServiceTier?`Served tier: ${result.actualServiceTier}${run.verified?' · verified':' · requested tier not confirmed'}`:'Served tier not reported · mode unverified';
  $(`hc-badge-${id}`).textContent='Responded';
  const minimum=2**count-1;
  $(`hc-plan-label-${id}`).textContent=`${moves.length} legal moves · ${moves.length===minimum?'optimal':`${moves.length-minimum} above minimum`}`;
  $(`hc-plan-${id}`).replaceChildren(...moves.map(move=>{const li=document.createElement('li');li.textContent=`Disk ${move.disk}: ${'ABC'[move.from]} → ${'ABC'[move.to]}`;return li;}));
  clearTimeout(timer);summary();
  for(const move of moves){
   if(current!==epoch)return;
   $(`hc-status-${id}`).textContent=`Move ${run.completed+1} / ${moves.length}`;
   $(`hc-message-${id}`).textContent=`Disk ${move.disk}: ${'ABC'[move.from]} → ${'ABC'[move.to]}. Waiting for a stable placement.`;
   await scenes[id].move(move);if(current!==epoch)return;
   run.completed++;$(`hc-moves-${id}`).textContent=`${run.completed} / ${moves.length}`;
   $(`hc-plan-${id}`).children[run.completed-1]?.classList.add('done');
  }
  run.total=performance.now()-start;$(`hc-total-${id}`).textContent=`${(run.total/1000).toFixed(1)} s`;
  $(`hc-status-${id}`).textContent='Puzzle solved';$(`hc-message-${id}`).textContent=`All ${count} disks settled on C. ${moves.length===minimum?'Optimal solution.':'Legal solution; more moves than the minimum.'}`;
 }catch(error){if(current!==epoch)return;run.error=true;$(`hc-badge-${id}`).textContent='Request failed';$(`hc-status-${id}`).textContent=run.completed?'Execution stopped':'No solution executed';$(`hc-message-${id}`).textContent=error.name==='AbortError'?'The model timed out. Reset and retry.':error.message;}
 finally{clearTimeout(timer);if(current===epoch){run.pending=false;run.executing=false;controls();summary();}}
}
$('hanoi-compare-form').addEventListener('submit',event=>{event.preventDefault();if(!ready||isBusy())return;clear();const current=epoch,start=performance.now();for(const mode of modes)void solve(mode,start,current);controls();summary();});
$('hanoi-compare-reset').addEventListener('click',()=>{clear();$('hanoi-compare-summary').textContent='Both puzzles reset. Ready for a fresh model comparison.';});
$('hanoi-compare-count').addEventListener('change',()=>{clear();$('hanoi-compare-summary').textContent=`Same ${count}-disk puzzle on both sides. Minimum ${2**count-1} moves.`;});
try{
 for(const mode of modes)scenes[mode.id]=await createHanoiScene($(`hc-scene-${mode.id}`),state=>{$(`hc-fps-${mode.id}`).textContent=`${state.fps} fps`;});
 ready=true;clear();$('hanoi-compare-summary').textContent='Ready. Each model must solve the puzzle itself; no local-solver fallback.';
 try{const response=await fetch('/api/health',{signal:AbortSignal.timeout(4000)}),health=await response.json();configured=health.providers?.openai?.configured===true;for(const mode of modes)$(`hc-badge-${mode.id}`).textContent=health.providers?.openai?.configured?'Key configured':'Not configured';}catch{for(const mode of modes)$(`hc-badge-${mode.id}`).textContent='Service offline';}
}catch(error){$('hanoi-compare-summary').textContent=`The scenes could not start: ${error.message}`;}
window.__hanoiComparison={getState:()=>({count,runs:structuredClone(runs),scenes:Object.fromEntries(Object.entries(scenes).map(([id,scene])=>[id,scene.getState()]))})};
window.addEventListener('pagehide',()=>{epoch++;controllers.forEach(c=>c.abort());Object.values(scenes).forEach(s=>s.dispose());});
