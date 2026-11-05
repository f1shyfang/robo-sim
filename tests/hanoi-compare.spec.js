import {test,expect} from '@playwright/test';
import {planHanoi} from '../src/hanoi-planner.js';
const mockPlan=async route=>{const {profile,count}=route.request().postDataJSON();await route.fulfill({json:{profile,source:'openai',moves:planHanoi(count).moves,tierVerified:true,actualServiceTier:profile==='sol-standard'?'default':'ultrafast'}});};
test('both models own validated plans solve Hanoi',async({page})=>{
 test.setTimeout(100000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/hanoi-plan',mockPlan);
 await page.goto('/hanoi/compare');
 await expect(page.locator('#hanoi-compare-run')).toBeEnabled({timeout:20000});
 await page.locator('#hanoi-compare-count').selectOption('2');
 await page.locator('#hanoi-compare-run').click();
 await expect(page.locator('#hc-status-standard')).toHaveText('Puzzle solved',{timeout:60000});
 await expect(page.locator('#hc-status-ultrafast')).toHaveText('Puzzle solved',{timeout:60000});
 const state=await page.evaluate(()=>window.__hanoiComparison.getState());
 expect(state.scenes.standard.pegs).toEqual([[],[],[2,1]]);expect(state.scenes.ultrafast.pegs).toEqual([[],[],[2,1]]);
 await expect(page.locator('#hc-plan-label-standard')).toHaveText('3 legal moves · optimal');
 expect(errors).toEqual([]);
 await page.screenshot({path:'artifacts/hanoi-compare-desktop.png',fullPage:true});
});
test('failed and illegal plans execute nothing, reset discards pending plans',async({page})=>{
 await page.route('**/api/hanoi-plan',async route=>{const {profile}=route.request().postDataJSON();await route.fulfill(profile==='sol-ultrafast'?{status:503,json:{error:'Ultrafast access unavailable'}}:{json:{profile,source:'openai',moves:[{disk:3,from:0,to:2}]}});});
 await page.goto('/hanoi/compare');await expect(page.locator('#hanoi-compare-run')).toBeEnabled({timeout:20000});
 await page.locator('#hanoi-compare-run').click();
 await expect(page.locator('#hc-message-ultrafast')).toContainText('access unavailable');
 await expect(page.locator('#hc-status-standard')).toHaveText('No solution executed');
 expect((await page.evaluate(()=>window.__hanoiComparison.getState())).scenes.standard.pegs).toEqual([[3,2,1],[],[]]);
 await page.unroute('**/api/hanoi-plan');
 await page.route('**/api/hanoi-plan',async route=>{await new Promise(r=>setTimeout(r,800));await mockPlan(route);});
 await page.locator('#hanoi-compare-run').click();await page.locator('#hanoi-compare-reset').click();
 await page.waitForTimeout(1200);
 const state=await page.evaluate(()=>window.__hanoiComparison.getState());expect(state.scenes.standard.pegs).toEqual([[3,2,1],[],[]]);expect(state.runs).toEqual({});
});
test('Hanoi comparison link and mobile fit',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/hanoi');
 await page.getByRole('link',{name:'Compare Standard vs Ultrafast →'}).click();
 await expect(page.locator('#hanoi-compare-run')).toBeEnabled({timeout:20000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'artifacts/hanoi-compare-mobile.png',fullPage:true});
});
