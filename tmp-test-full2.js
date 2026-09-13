const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', 'owner@arcticblocks.test');
  await page.fill('input[name="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  await page.goto('http://localhost:3000/invoices/new', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="Name or mobile number…"]', 'Test Customer BP2');
  await page.waitForTimeout(400);
  await page.click('text=Add "Test Customer BP2" as a new customer');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Save customer")');
  await page.waitForTimeout(800);

  await page.fill('input[placeholder="Search catalog to add…"]', 'Test Box Item');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Add")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/f-added.png', fullPage: true });

  const piecesInput = page.locator('input[aria-label*="Extra loose pieces"]').first();
  const count = await piecesInput.count();
  console.log('pieces input count:', count);
  if (count > 0) {
    await piecesInput.fill('20');
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: '/tmp/f-pieces20.png', fullPage: true });

  console.log('done');
  await browser.close();
})();
