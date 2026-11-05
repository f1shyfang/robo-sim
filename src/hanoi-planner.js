export function initialState(count) {
  if (!Number.isInteger(count) || count < 2 || count > 5) throw new Error('Choose 2 to 5 disks.');
  return [Array.from({length:count},(_,i)=>count-i),[],[]];
}
export function heuristic(pegs) { return pegs[0].length + pegs[1].length; }
export function legalMoves(pegs) {
  const moves=[];
  for(let from=0;from<3;from++){
    const disk=pegs[from].at(-1);if(disk===undefined)continue;
    for(let to=0;to<3;to++) if(from!==to && (!pegs[to].length || pegs[to].at(-1)>disk)) moves.push({disk,from,to});
  }
  return moves;
}
export function applyMove(pegs,move){
  if(!legalMoves(pegs).some(m=>m.disk===move.disk&&m.from===move.from&&m.to===move.to))throw new Error('Illegal Hanoi move.');
  const next=pegs.map(p=>[...p]);next[move.from].pop();next[move.to].push(move.disk);return next;
}
export function planHanoi(count){
  const start=initialState(count), key=p=>JSON.stringify(p);
  const open=[{pegs:start,g:0,h:heuristic(start),path:[]}],best=new Map([[key(start),0]]);
  let expanded=0;
  while(open.length){
    open.sort((a,b)=>(a.g+a.h)-(b.g+b.h)||a.h-b.h);
    const current=open.shift();
    if(current.g!==best.get(key(current.pegs)))continue;
    if(!current.h)return{moves:current.path,expanded,minimum:2**count-1};
    expanded++;
    for(const move of legalMoves(current.pegs)){
      const pegs=applyMove(current.pegs,move),g=current.g+1,k=key(pegs);
      if(g>=(best.get(k)??Infinity))continue;
      best.set(k,g);open.push({pegs,g,h:heuristic(pegs),path:[...current.path,move]});
    }
  }
  throw new Error('No solution found.');
}
