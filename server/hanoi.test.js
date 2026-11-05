import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHanoiPlan, validateHanoiPlan } from './hanoi.js';
import { planHanoi } from '../src/hanoi-planner.js';
import { createApp } from './index.js';

const good = count => ({ moves: planHanoi(count).moves });
const reply = (value, tier = 'default', extra = {}) => ({ ok: true, json: async () => ({ status:'completed',service_tier:tier,output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],...extra }) });
test('Hanoi validates complete optimal and legal nonoptimal model plans',()=>{
 for(let count=2;count<=5;count++)assert.equal(validateHanoiPlan(good(count),count).optimal,true);
 const detour=[{disk:1,from:0,to:2},{disk:1,from:2,to:0},...good(3).moves];
 const result=validateHanoiPlan({moves:detour},3);assert.equal(result.optimal,false);assert.equal(result.minimum,7);assert.equal(result.moveCount,9);
});
test('Hanoi rejects illegal, malformed, oversized and unfinished plans',()=>{
 for(const bad of [null,[],{}, {moves:[]},{moves:good(3).moves,extra:1},{moves:Array(128).fill({disk:1,from:0,to:2})},{moves:[{disk:'1',from:0,to:2}]},{moves:[{disk:1,from:0,to:2,extra:1}]}])assert.throws(()=>validateHanoiPlan(bad,3),e=>e.code==='INVALID_PLAN');
 assert.throws(()=>validateHanoiPlan({moves:[{disk:2,from:0,to:2}]},3),e=>e.code==='ILLEGAL_PLAN');
 assert.throws(()=>validateHanoiPlan({moves:[{disk:1,from:0,to:2}]},3),e=>e.code==='INCOMPLETE_PLAN');
});
test('Hanoi profiles use identical model task except tier and expose actual tier',async()=>{
 const bodies=[];
 for(const profile of ['sol-standard','sol-ultrafast']){
  const result=await makeHanoiPlan({count:3,profile},{openaiApiKey:'test',fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(opts.body);bodies.push(body);return reply(good(3),body.service_tier);}});
  assert.equal(result.profile,profile);assert.equal(result.tierVerified,true);assert.equal(result.moveCount,7);assert.equal(JSON.stringify(result).includes('Bearer'),false);
 }
 const {service_tier:a,...first}=bodies[0],{service_tier:b,...second}=bodies[1];assert.deepEqual(first,second);assert.equal(a,'default');assert.equal(b,'ultrafast');
 const mismatch=await makeHanoiPlan({count:3,profile:'sol-ultrafast'},{openaiApiKey:'test',fetchImpl:async()=>reply(good(3),'default')});assert.equal(mismatch.tierVerified,false);
});
test('Hanoi rejects bad request parameters and absent credentials before fetch',async()=>{
 const opts={openaiApiKey:'',fetchImpl:()=>{throw new Error('must not fetch');}};
 for(const count of [1,6,'3',null])await assert.rejects(makeHanoiPlan({count,profile:'sol-standard'},opts),e=>e.code==='INVALID_COUNT');
 await assert.rejects(makeHanoiPlan({count:3,profile:'cerebras-direct'},opts),e=>e.code==='INVALID_PROFILE');
 await assert.rejects(makeHanoiPlan({count:3,profile:'sol-standard'},opts),e=>e.code==='NOT_CONFIGURED');
});
test('Hanoi provider refusals, incomplete output, unavailable tier, timeout are explicit',async()=>{
 const request={count:3,profile:'sol-standard'};
 await assert.rejects(makeHanoiPlan(request,{openaiApiKey:'test',fetchImpl:async()=>reply(good(3),'default',{status:'incomplete'})}),e=>e.code==='INCOMPLETE_RESPONSE');
 await assert.rejects(makeHanoiPlan(request,{openaiApiKey:'test',fetchImpl:async()=>reply(good(3),'default',{output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]})}),e=>e.code==='MODEL_REFUSAL');
 await assert.rejects(makeHanoiPlan({...request,profile:'sol-ultrafast'},{openaiApiKey:'test',fetchImpl:async()=>({ok:false,status:403})}),e=>e.code==='TIER_UNAVAILABLE');
 await assert.rejects(makeHanoiPlan(request,{openaiApiKey:'test',timeoutMs:10,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}),e=>e.code==='PROVIDER_TIMEOUT');
});
test('Hanoi HTTP route returns a validated plan and rejects malformed input',async()=>{
 const app=createApp({openaiApiKey:'test',fetchImpl:async()=>reply(good(3))});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}/api/hanoi-plan`;
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({count:3,profile:'sol-standard'})});assert.equal(response.status,200);assert.equal((await response.json()).moveCount,7);
  const invalid=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({count:7,profile:'sol-standard'})});assert.equal(invalid.status,400);assert.equal((await invalid.json()).fallbackAvailable,false);
 }finally{await new Promise(r=>server.close(r));}
});
