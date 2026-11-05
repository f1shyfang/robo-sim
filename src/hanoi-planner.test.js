import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,planHanoi,applyMove,heuristic} from './hanoi-planner.js';
for(let count=2;count<=5;count++)test(`A* legally solves ${count} disks in the minimum moves`,()=>{
 const plan=planHanoi(count);let state=initialState(count);
 assert.equal(plan.moves.length,2**count-1);
 for(const move of plan.moves){state=applyMove(state,move);for(const peg of state)for(let i=1;i<peg.length;i++)assert(peg[i-1]>peg[i]);}
 assert.equal(heuristic(state),0);assert.deepEqual(state[2],initialState(count)[0]);assert(plan.expanded>0);
});
test('larger-on-smaller and moving a buried disk are rejected',()=>{
 const state=applyMove(initialState(3),{disk:1,from:0,to:2});
 assert.throws(()=>applyMove(state,{disk:2,from:0,to:2}));
 assert.throws(()=>applyMove(state,{disk:3,from:0,to:1}));
});
