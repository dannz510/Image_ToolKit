// Smoke test for Dannz AI Studio - runs in headless browser
const TEST_IMG = 'D:/Do not open/Extract IMG/test_person.png';

async function run(page) {
  const r = {};
  await page.goto('http://localhost:3000');
  await page.waitForSelector('#image-file-input', {timeout: 15000});
  await page.setInputFiles('#image-file-input', TEST_IMG);
  await page.waitForTimeout(2000);

  // 1. Remove background (AI)
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Remove background');
    if (b) b.click();
  });
  await page.waitForTimeout(9000);
  r.aiProcessed = await page.evaluate(() => document.getElementById('root').innerText.includes('RESULT'));

  // 2. Model switcher
  r.modelBefore = await page.evaluate(() => document.querySelector('select')?.value);
  await page.evaluate(() => { const s = document.querySelector('select'); if (s) { s.value = 'isnet'; s.dispatchEvent(new Event('change', {bubbles:true})); } });
  await page.waitForTimeout(300);
  r.modelAfter = await page.evaluate(() => document.querySelector('select')?.value);

  // 3. Alpha matting checkbox
  r.checkboxBefore = await page.evaluate(() => document.querySelector('input[type="checkbox"]')?.checked);
  await page.evaluate(() => { const c = document.querySelector('input[type="checkbox"]'); if (c) c.click(); });
  await page.waitForTimeout(300);
  r.checkboxAfter = await page.evaluate(() => document.querySelector('input[type="checkbox"]')?.checked);

  // 4. Max edge slider
  await page.evaluate(() => { const s = document.querySelector('input[type="range"]'); if (s) { s.value = '1024'; s.dispatchEvent(new Event('input', {bubbles:true})); } });
  await page.waitForTimeout(300);
  r.slider = await page.evaluate(() => document.querySelector('input[type="range"]')?.value);

  // 5. Views
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Batch'); if (b) b.click(); });
  await page.waitForTimeout(800);
  r.batchView = await page.evaluate(() => document.getElementById('root').innerText.includes('BATCH QUEUE'));
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Workspace'); if (b) b.click(); });
  await page.waitForTimeout(800);
  r.workspaceView = await page.evaluate(() => document.getElementById('root').innerText.includes('Workspace') || document.getElementById('root').innerText.includes('PAN'));

  // 6. Language toggle
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'EN'); if (b) b.click(); });
  await page.waitForTimeout(500);
  r.langVi = await page.evaluate(() => document.getElementById('root').innerText.includes('Đơn') || document.getElementById('root').innerText.includes('VI'));

  // 7. Theme toggle
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => (x.getAttribute('aria-label') || '').includes('ight')); if (b) b.click(); });
  await page.waitForTimeout(500);
  r.themeLight = await page.evaluate(() => document.documentElement.classList.contains('light'));

  // 8. Panels
  for (const p of ['Adjust', 'Erase', 'Presets', 'Layers', 'History']) {
    await page.evaluate((name) => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === name); if (b) b.click(); }, p);
    await page.waitForTimeout(600);
    r['panel_' + p] = await page.evaluate(() => document.getElementById('root').innerText.length > 100);
  }

  // 9. Settings modal
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Dannz'); if (b) b.click(); });
  await page.waitForTimeout(1000);
  r.settingsModal = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  // Sign out
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('[role="dialog"] button')).find(x => x.textContent.trim() === 'Sign out'); if (b) b.click(); });
  await page.waitForTimeout(800);
  r.signedOut = await page.evaluate(() => document.getElementById('root').innerText.includes('SIGN IN'));

  // 10. API status
  r.apiOnline = await page.evaluate(() => document.getElementById('root').innerText.includes('API: Online'));

  return r;
}

module.exports = { run, TEST_IMG };