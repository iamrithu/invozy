const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', 'owner@arcticblocks.test');
  await page.fill('input[name="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // Go to products, create a new product priced per piece
  await page.goto('http://localhost:3000/products', { waitUntil: 'networkidle' });
  await page.click('text=Add product');
  await page.waitForTimeout(500);
  await page.fill('input[name="name"]', 'Test Box Item');
  await page.selectOption('select[name="unit"]', 'box');
  await page.fill('input[name="packQty"]', '40');
  await page.waitForTimeout(200);
  // toggle to "Per piece" and enter 12 (=> box price should become 480)
  await page.click('button:has-text("Per piece")');
  await page.fill('input[name="price"]', '12');
  await page.screenshot({ path: '/tmp/box-product-form.png' });
  await page.click('button:has-text("Add product")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/box-product-saved.png' });

  console.log('done product test');
  await browser.close();
})();
