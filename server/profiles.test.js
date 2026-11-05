import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, comparisonProfiles } from './planner.js';

function response(tier) {
  return { ok: true, json: async () => ({ service_tier: tier, output: [{ type:'message', content:[{ type:'output_text', text:'{"actions":[{"type":"stack"}]}' }] }] }) };
}

test('same Sol model and identical settings except service tier', async () => {
  const requests = [];
  const results = [];
  for (const profile of ['sol-standard','sol-ultrafast']) {
    results.push(await makePlan('Stack all blocks', { profile, openaiApiKey:'test', fetchImpl: async (url, opts) => {
      const body = JSON.parse(opts.body); requests.push({url,body}); return response(body.service_tier);
    } }));
  }
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[1].url, requests[0].url);
  assert.equal(requests[0].body.model, 'gpt-5.6-sol');
  assert.equal(requests[0].body.service_tier, 'default');
  assert.equal(requests[1].body.service_tier, 'ultrafast');
  const {service_tier: _a, ...a} = requests[0].body;
  const {service_tier: _b, ...b} = requests[1].body;
  assert.deepEqual(a,b);
  assert.equal(results[1].tierVerified,true);
  assert.equal(results[1].actualServiceTier,'ultrafast');
  assert.deepEqual(results[1].actions,[{type:'stack'}]);
});

test('profile tier mismatch is disclosed instead of claiming ultrafast', async () => {
  for (const tier of ['default',undefined]) {
    const result = await makePlan('Stack blocks', {profile:'sol-ultrafast',openaiApiKey:'test',fetchImpl:async()=>response(tier)});
    assert.equal(result.tierVerified,false);
    assert.equal(result.actualServiceTier,tier || null);
    assert.match(result.message,/not confirmed/);
  }
});

test('profiles are bounded, require correct credential, and surface restricted tier', async () => {
  await assert.rejects(makePlan('Stack blocks',{profile:'unknown',openaiApiKey:'test'}),e=>e.code==='INVALID_PROFILE');
  await assert.rejects(makePlan('Stack blocks',{profile:'sol-ultrafast',provider:'cerebras',openaiApiKey:'test'}),e=>e.code==='INVALID_PROVIDER');
  await assert.rejects(makePlan('Stack blocks',{profile:'sol-ultrafast',openaiApiKey:'',apiKey:'test'}),e=>e.code==='NOT_CONFIGURED');
  await assert.rejects(makePlan('Stack blocks',{profile:'sol-standard',forceLocal:true}),e=>e.code==='INVALID_MODE');
  await assert.rejects(makePlan('Stack blocks',{profile:'sol-ultrafast',openaiApiKey:'test',fetchImpl:async()=>({ok:false,status:403})}),e=>e.code==='TIER_UNAVAILABLE');
  const list = comparisonProfiles({openaiApiKey:'',apiKey:'test'});
  assert.equal(list.find(p=>p.id==='sol-ultrafast').accessControlled,true);
  assert.equal(list.find(p=>p.id==='sol-standard').configured,false);
  assert.equal(list.find(p=>p.id==='cerebras-direct').configured,true);
});

test('local stack commands remain bounded and reject negation', async () => {
  assert.deepEqual((await makePlan('Stack all blocks on the platform',{apiKey:''})).actions,[{type:'stack'}]);
  await assert.rejects(makePlan('Do not stack blocks',{apiKey:''}));
});

test('bulk shipment accepts box wording', async () => {
  assert.deepEqual((await makePlan('Stack all 20 boxes on the pallet',{apiKey:''})).actions,[{type:'stack'}]);
});
