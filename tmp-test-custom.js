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
  await page.fill('input[placeholder="Name or mobile number…"]', 'Test Customer Custom');
  await page.waitForTimeout(400);
  await page.click('text=Add "Test Customer Custom" as a new customer');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Save customer")');
  await page.waitForTimeout(800);

  await page.click('text=Bill something not in your catalog');
  await page.waitForTimeout(300);
  await page.fill('input[name="name"]', 'Custom Bulk Item');
  await page.fill('input[name="unit"]', 'crate');
  await page.fill('input[name="packQty"]', '24');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/custom-form-with-pack.png', fullPage: true });
  await page.fill('input[name="qty"]', '2');
  await page.fill('input[name="pieces"]', '10');
  await page.fill('input[name="rate"]', '240');
  await page.screenshot({ path: '/tmp/custom-form-filled.png', fullPage: true });
  await page.click('button:has-text("Add to invoice")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/custom-added-line.png', fullPage: true });

  console.log('done custom test');
  await browser.close();
})();
