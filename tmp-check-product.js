const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', 'owner@arcticblocks.test');
  await page.fill('input[name="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.goto('http://localhost:3000/products', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="Search products…"]', 'Test Box Item').catch(async()=>{
    console.log('placeholder not matched, trying generic search input');
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/products-search-testbox.png', fullPage: true });
  await browser.close();
})();
