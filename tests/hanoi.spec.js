import {test,expect} from '@playwright/test';

test('Hanoi single-step, pause, resume, optimal finish, and reset',async({page})=>{
 test.setTimeout(100000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/hanoi');
 await expect(page.locator('#hanoi-run')).toBeEnabled({timeout:20000});
 await expect(page.locator('#move-count')).toHaveText('0 / 7 moves');
 await page.screenshot({path:'artifacts/hanoi-desktop.png',fullPage:true});
 await page.locator('#hanoi-step').click();
 await expect(page.locator('#hanoi-pause')).toBeEnabled();
 await page.locator('#hanoi-pause').click();
 await expect(page.locator('#hanoi-pause')).toHaveText('Resume');
 const paused=await page.evaluate(()=>window.__hanoi.getState().scene.physicsSteps);
 await page.waitForTimeout(350);
 expect(await page.evaluate(()=>window.__hanoi.getState().scene.physicsSteps)).toBe(paused);
 await page.locator('#hanoi-pause').click();
 await expect(page.locator('#move-count')).toHaveText('1 / 7 moves',{timeout:15000});
 await page.locator('#hanoi-run').click();
 await expect(page.locator('#hanoi-status')).toHaveText('Puzzle solved',{timeout:70000});
 const state=await page.evaluate(()=>window.__hanoi.getState());
 expect(state.completed).toBe(7);expect(state.pegs).toEqual([[],[],[3,2,1]]);
 await page.screenshot({path:'artifacts/hanoi-solved.png',fullPage:true});
 await page.locator('#hanoi-reset').click();
 await expect(page.locator('#move-count')).toHaveText('0 / 7 moves');
 await page.locator('#hanoi-run').click();
 await page.locator('#hanoi-reset').click();
 await page.waitForTimeout(700);
 expect((await page.evaluate(()=>window.__hanoi.getState())).completed).toBe(0);
 expect(errors).toEqual([]);
});

test('Hanoi challenge size and mobile layout',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/hanoi');
 await expect(page.locator('#hanoi-run')).toBeEnabled({timeout:20000});
 await page.locator('#disk-count').selectOption('5');
 await expect(page.locator('#move-count')).toHaveText('0 / 31 moves');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect(await page.evaluate(()=>window.__hanoi.getState().scene.pegs)).toEqual([[5,4,3,2,1],[],[]]);
 await page.screenshot({path:'artifacts/hanoi-mobile.png',fullPage:true});
});

test('five-disk physical execution completes all 31 legal moves',async({page})=>{
 test.setTimeout(120000);
 await page.routeWebSocket('**',()=>{});
 await page.route('**/src/hanoi-scene.js*',async route=>{
  const response=await route.fetch(),source=await response.text();
  expect(source).toContain('renderer.render(scene, camera);');
  await route.fulfill({response,body:source.replace('renderer.render(scene, camera);','/* Rendering omitted in fixed-step physics test. */')});
 });
 await page.addInitScript(()=>{let time=performance.now();window.requestAnimationFrame=cb=>setTimeout(()=>cb(time+=100),0);window.cancelAnimationFrame=id=>clearTimeout(id);});
 await page.goto('/hanoi');
 await expect(page.locator('#hanoi-run')).toBeEnabled({timeout:20000});
 await page.locator('#hanoi-run').click();
 await expect(page.locator('#hanoi-status')).toHaveText('Puzzle solved',{timeout:30000});
 await page.locator('#disk-count').selectOption('5');
 await page.locator('#hanoi-run').click();
 await expect(page.locator('#hanoi-status')).toHaveText('Puzzle solved',{timeout:90000});
 const state=await page.evaluate(()=>window.__hanoi.getState());
 expect(state.completed).toBe(31);expect(state.pegs).toEqual([[],[],[5,4,3,2,1]]);
 expect(state.scene.attached).toBe(false);
 for(const disk of state.scene.diskPositions){expect(Math.abs(disk.x-2)).toBeLessThan(.08);expect(Math.abs(disk.z-.35)).toBeLessThan(.08);}
});
