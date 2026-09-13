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
  await page.screenshot({ path: '/tmp/step1-builder.png', fullPage: true });

  await page.fill('input[placeholder="Name or mobile number…"]', 'Test Customer BP');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/step2-custsearch.png', fullPage: true });
  await page.click('text=Add "Test Customer BP" as a new customer');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/step3-quickadd.png', fullPage: true });
  await page.click('button:has-text("Save customer")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/step4-aftercust.png', fullPage: true });

  await page.fill('input[placeholder="Search catalog to add…"]', 'Test Box Item');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/step5-search.png', fullPage: true });

  await browser.close();
})();
