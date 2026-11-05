import '@fontsource-variable/manrope';
import './style.css';
import './hanoi.css';
import {planHanoi,initialState,heuristic,applyMove} from './hanoi-planner.js';
import {createHanoiScene} from './hanoi-scene.js';
const letters=['A','B','C'];
document.title='Robot Studio — Towers of Hanoi';
document.querySelector('#app').innerHTML=`
<header class="topbar"><a class="brand" href="/">Robot Studio<span class="brand-period">.</span></a><nav class="hanoi-nav"><a href="/">Stacking</a><a href="/hanoi/compare">Compare models</a><span aria-current="page">Towers of Hanoi</span></nav></header>
<main class="hanoi-workspace">
<section class="hanoi-stage"><div class="hanoi-title"><h1>One tower.<br>Think ahead.</h1><p>Move every disk from A to C.<br>Small disks always sit on larger ones.</p></div><div id="hanoi-scene"></div><div class="hanoi-scene-footer"><span>Drag to orbit · Scroll to zoom</span><strong id="scene-status">Preparing the arm…</strong></div></section>
<aside class="hanoi-panel"><h2>Towers of Hanoi</h2><a class="hanoi-model-link" href="/hanoi/compare">Compare Standard vs Ultrafast →</a><p class="hanoi-description">An A* search plans the legal moves. The arm carries out each move and waits for the disk to settle.</p>
<label for="disk-count">Challenge size</label><select id="disk-count"><option value="2">2 disks · 3 moves</option><option value="3" selected>3 disks · 7 moves</option><option value="4">4 disks · 15 moves</option><option value="5">5 disks · 31 moves</option></select>
<div class="hanoi-goal"><span>Goal</span><strong id="goal">3 disks on peg C</strong><p id="move-count">0 / 7 moves</p><progress id="hanoi-progress" max="7" value="0" aria-label="Moves completed"></progress></div>
<button id="hanoi-run" class="run-button" disabled>Run optimal plan <span aria-hidden="true">→</span></button><div class="hanoi-controls"><button id="hanoi-step" disabled>Next move</button><button id="hanoi-pause" disabled>Pause</button><button id="hanoi-reset" disabled>Reset</button></div>
<div class="hanoi-feedback" aria-live="polite"><strong id="hanoi-status">Loading physics</strong><p id="hanoi-message">Preparing three pegs and a fresh puzzle.</p></div>
<div class="planner-explainer"><h3>The heuristic</h3><p><strong>h = disks not on C.</strong> A lower bound on moves remaining. A* chooses the lowest <strong>f = g + h</strong>, where g is moves already made.</p><dl><div><dt>Current lower bound</dt><dd id="h-value">3</dd></div><div><dt>Search states expanded</dt><dd id="expanded">—</dd></div><div><dt>Minimum moves</dt><dd id="minimum">7</dd></div></dl><p class="planner-note">Exact local search. No AI request or API key needed.</p></div>
<ol class="hanoi-plan" id="move-list" aria-label="Planned legal moves"></ol>
</aside></main><footer class="hanoi-footer"><span>One disk per move · Top disks only · Never larger on smaller</span><span><strong id="hanoi-fps">—</strong> fps · Three.js / Rapier</span></footer>`;
const $=id=>document.getElementById(id);
let scene, count=3,plan=planHanoi(3),pegs=initialState(3),completed=0,busy=false,automatic=false,paused=false,epoch=0,loaded=false;
function buttons(){
 $('hanoi-run').disabled=!loaded||busy||completed===plan.moves.length;
 $('hanoi-step').disabled=!loaded||busy||completed===plan.moves.length;
 $('hanoi-reset').disabled=!loaded;
 $('hanoi-pause').disabled=!loaded||!busy;
 $('disk-count').disabled=busy;
 $('hanoi-pause').textContent=paused?'Resume':'Pause';
}
function renderPlan(){
 $('move-list').replaceChildren(...plan.moves.map((move,index)=>{
  const li=document.createElement('li');li.textContent=`Disk ${move.disk} · ${letters[move.from]} → ${letters[move.to]}`;
  li.className=index<completed?'done':index===completed?'next':'';return li;
 }));
 $('move-count').textContent=`${completed} / ${plan.moves.length} moves`;
 $('goal').textContent=`${count} disks on peg C`;
 $('hanoi-progress').max=plan.moves.length;$('hanoi-progress').value=completed;
 $('h-value').textContent=heuristic(pegs);$('expanded').textContent=plan.expanded;$('minimum').textContent=plan.minimum;
 buttons();
}
function message(title,detail){$('hanoi-status').textContent=title;$('hanoi-message').textContent=detail;}
function reset(){
 epoch++;automatic=false;busy=false;paused=false;completed=0;count=Number($('disk-count').value);
 plan=planHanoi(count);pegs=initialState(count);scene.reset(count);renderPlan();
 $('scene-status').textContent='Ready to solve';message('Plan ready',`${plan.moves.length} legal moves. Run the plan or inspect one move at a time.`);
}
async function advance(runAll){
 if(!loaded||busy||completed>=plan.moves.length)return;
 const current=epoch;automatic=runAll;busy=true;buttons();
 try{
  do{
   const move=plan.moves[completed];
   message(`Move ${completed+1} of ${plan.moves.length}`,`Lift disk ${move.disk} from ${letters[move.from]} and place it on ${letters[move.to]}.`);
   $('scene-status').textContent=`Disk ${move.disk} · ${letters[move.from]} → ${letters[move.to]}`;
   await scene.move(move);
   if(current!==epoch)return;
   pegs=applyMove(pegs,move);completed++;renderPlan();
  }while(automatic&&completed<plan.moves.length);
  if(completed===plan.moves.length){message('Puzzle solved',`All ${count} disks are on C in the optimal ${plan.minimum} moves.`);$('scene-status').textContent='Solved · optimal plan';}
  else{message('Move complete','The disk has settled. Continue with the next legal move.');$('scene-status').textContent='Ready for next move';}
 }catch(error){if(current===epoch&&error.name!=='AbortError'){automatic=false;message('Motion stopped',`${error.message} Reset to retry.`);$('scene-status').textContent='Reset required';}}
 finally{if(current===epoch){busy=false;automatic=false;paused=false;buttons();}}
}
$('hanoi-run').addEventListener('click',()=>void advance(true));
$('hanoi-step').addEventListener('click',()=>void advance(false));
$('hanoi-reset').addEventListener('click',reset);$('disk-count').addEventListener('change',reset);
$('hanoi-pause').addEventListener('click',()=>{if(!busy)return;paused=!paused;paused?scene.pause():scene.resume();$('scene-status').textContent=paused?'Paused · disk held safely':'Executing move';buttons();});
try{
 scene=await createHanoiScene($('hanoi-scene'),state=>{if(Number.isFinite(state.fps))$('hanoi-fps').textContent=state.fps;});
 loaded=true;reset();
 window.__hanoi={getState:()=>({count,completed,minimum:plan.minimum,busy,paused,pegs:pegs.map(p=>[...p]),scene:scene.getState()})};
}catch(error){message('Scene unavailable',error.message);$('scene-status').textContent='Could not initialize WebGL';}
window.addEventListener('pagehide',()=>{epoch++;scene?.dispose();});
