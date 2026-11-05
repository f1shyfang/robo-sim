import {test,expect} from '@playwright/test';

test('twenty real physics boxes complete four towers only after every placement',async({page})=>{
  test.setTimeout(120000);
  // Accelerate scheduling, not physics: the production integrator still steps at 1/60.
  // Skip drawing during this physics test; normal desktop/mobile tests verify rendering.
  await page.routeWebSocket('**',()=>{});
  await page.route('**/src/simulation.js*',async route=>{
    const response=await route.fetch();
    const source=await response.text();
    expect(source).toContain('renderer.render(scene, camera);');
    await route.fulfill({response,body:source.replace('renderer.render(scene, camera);','/* GPU rendering omitted in physics-only test. */')});
  });
  await page.addInitScript(()=>{
    let time=performance.now();
    window.requestAnimationFrame=callback=>setTimeout(()=>callback(time+=100),0);
    window.cancelAnimationFrame=id=>clearTimeout(id);
  });
  await page.goto('/');
  await page.waitForFunction(()=>window.__simulation?.getState().blockCount===20);
  await page.evaluate(()=>window.__simulation.stack());
  await page.waitForFunction(()=>window.__simulation.getState().stackedCount>=5);
  expect(await page.evaluate(()=>window.__simulation.getState().phase)).toBe('running');
  await page.waitForFunction(()=>['success','stopped'].includes(window.__simulation.getState().phase),null,{timeout:90000});
  const state=await page.evaluate(()=>window.__simulation.getState());
  expect(state.phase).toBe('success');
  expect(state.stackedCount).toBe(20);
  expect(state.gripped).toBe(false);
  expect(new Set(state.blocks.map(b=>b.tower)).size).toBe(4);
  for(const box of state.blocks){
    expect(box.stacked).toBe(true);
    expect(Math.abs(box.y-box.target.y)).toBeLessThan(.065);
  }
  await page.evaluate(()=>window.__simulation.reset());
  const reset=await page.evaluate(()=>window.__simulation.getState());
  expect(reset.blockCount).toBe(20);expect(reset.stackedCount).toBe(0);expect(reset.phase).toBe('ready');
});
