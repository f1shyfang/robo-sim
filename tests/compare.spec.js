import { test, expect } from '@playwright/test';

test('comparison keeps missing configuration honest and previews both scenes', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { providers: { cerebras:{configured:false,model:'qwen-3.8-27b'},openai:{configured:false,model:'gpt-4.1'} } } }));
  await page.route('**/api/plan', route => route.fulfill({status:503,json:{error:'Provider key not configured.',code:'NOT_CONFIGURED'}}));
  await page.goto('/compare');
  await expect(page.locator('#compare-run')).toBeEnabled({timeout:20000});
  await expect(page.locator('#badge-openai')).toHaveText('Not configured');
  await page.locator('#compare-run').click();
  await expect(page.locator('#summary')).toContainText('Comparison incomplete');
  await expect(page.locator('#latency-openai')).toHaveText('—');
  expect(await page.evaluate(() => window.__comparison.openai.getState().phase)).toBe('ready');
  await page.evaluate(() => Object.values(window.__comparison).forEach(s => s.setBlockCount(1)));
  await page.locator('#preview').click();
  await expect(page.locator('#summary')).toContainText('no AI requests');
  await page.waitForFunction(() => Object.values(window.__comparison).every(s => s.getState().phase === 'success'), null, {timeout:45000});
  await page.locator('#compare-reset').click();
  await expect(page.locator('#outcome-openai')).toHaveText('0/1 stacked');
  await page.screenshot({path:'artifacts/comparison-desktop.png',fullPage:true});
});

test('independent responses start independent arms and reset rejects late responses', async ({ page }) => {
  await page.route('**/api/plan', async route => {
    const {profile} = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, profile === 'sol-standard' ? 100 : 1800));
    await route.fulfill({json:{source:'openai',profile,tierVerified:true,actualServiceTier:profile === 'sol-standard' ? 'default' : 'ultrafast',actions:[{type:'deliver'}]}});
  });
  await page.goto('/compare');
  await expect(page.locator('#compare-run')).toBeEnabled({timeout:20000});
  await page.locator('#compare-run').click();
  await expect(page.locator('#status-cerebras')).toHaveText('Robot in motion');
  await expect(page.locator('#status-openai')).toHaveText('Waiting for model…');
  await expect(page.locator('#summary')).toContainText('Standard started', {timeout:5000});
  await page.locator('#compare-reset').click();
  await page.locator('#compare-run').click();
  await page.locator('#compare-reset').click();
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => Object.values(window.__comparison).every(s=>s.getState().phase==='ready'))).toBe(true);
  await expect(page.locator('#latency-openai')).toHaveText('—');
});

test('comparison is reachable from studio and fits mobile', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('link',{name:/Compare models/}).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.locator('#compare-run')).toBeEnabled({timeout:20000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'artifacts/comparison-mobile.png',fullPage:true});
});

test('spawned blocks build a stable five-block tower on both sides', async ({page}) => {
  test.setTimeout(180000);
  await page.goto('/compare');
  await expect(page.locator('#compare-run')).toBeEnabled({timeout:20000});
  await page.evaluate(() => Object.values(window.__comparison).forEach(s => s.setBlockCount(5)));
  await expect(page.locator('#profile-cerebras')).toHaveValue('sol-standard');
  await expect(page.locator('#profile-openai')).toHaveValue('sol-ultrafast');
  await expect(page.locator('#block-count')).toHaveText('5 boxes per scene');
  await expect(page.locator('#spawn')).toBeEnabled();
  await page.locator('#profile-cerebras').selectOption('cerebras-direct');
  await expect(page.locator('#model-cerebras')).toContainText('Cerebras API');
  await page.locator('#profile-cerebras').selectOption('sol-standard');
  await page.locator('#preview').click();
  await expect(page.locator('#profile-openai')).toBeDisabled();
  await page.waitForFunction(() => Object.values(window.__comparison).every(s=>s.getState().phase==='success'), null, {timeout:150000});
  const states=await page.evaluate(()=>Object.values(window.__comparison).map(s=>s.getState()));
  for(const state of states){
    expect(state.stackedCount).toBe(5);
    expect(state.gripped).toBe(false);
    for(let i=1;i<5;i++) expect(state.blocks[i].y-state.blocks[i-1].y).toBeCloseTo(.58,1);
  }
  await page.screenshot({path:'artifacts/comparison-stacked.png',fullPage:true});
  await page.locator('#compare-reset').click();
  expect(await page.evaluate(()=>window.__comparison.openai.getState().blockCount)).toBe(5);
  expect(await page.evaluate(()=>window.__comparison.openai.getState().stackedCount)).toBe(0);
});

test('unverified ultrafast response cannot claim a speed win', async ({page}) => {
  await page.route('**/api/plan', async route => {
    const {profile}=route.request().postDataJSON();
    await route.fulfill({json:{source:'openai',profile,actions:[{type:'stack'}],tierVerified:profile==='sol-standard',actualServiceTier:'default'}});
  });
  await page.goto('/compare');
  await expect(page.locator('#compare-run')).toBeEnabled({timeout:20000});
  await page.locator('#compare-run').click();
  await expect(page.locator('#summary')).toContainText('no speed winner');
  await expect(page.locator('#tier-openai')).toContainText('differs from requested');
  await page.locator('#compare-reset').click();
});
