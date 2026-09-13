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

  await page.goto('http://localhost:3000/products', { waitUntil: 'networkidle' });
  await page.click('text=Add product');
  await page.waitForTimeout(500);
  await page.fill('input[name="name"]', 'Test Box Item');
  await page.fill('input[placeholder="e.g. Milk, Dairy, Snacks…"]', 'Ice');
  await page.selectOption('select[name="unit"]', 'box');
  await page.fill('input[name="packQty"]', '40');
  await page.waitForTimeout(200);
  await page.click('button:has-text("Per piece")');
  await page.fill('input[name="price"]', '12');
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/product-created-check.png', fullPage: true });

  await page.goto('http://localhost:3000/invoices/new', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="Name or mobile number…"]', 'Test Customer BP');
  await page.waitForTimeout(400);
  await page.click('text=Add "Test Customer BP" as a new customer');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Save customer")');
  await page.waitForTimeout(800);

  await page.fill('input[placeholder="Search catalog to add…"]', 'Test Box Item');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/search-in-builder.png', fullPage: true });
  await page.click('text=Test Box Item');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/added-line.png', fullPage: true });

  const piecesInput = page.locator('input[aria-label*="Extra loose pieces"]').first();
  await piecesInput.fill('20');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/pieces20.png', fullPage: true });

  console.log('done full test');
  await browser.close();
})();
