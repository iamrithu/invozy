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

  await page.goto('http://localhost:3000/products', { waitUntil: 'networkidle' });
  await page.click('text=Add product');
  await page.waitForTimeout(500);
  await page.fill('input[name="name"]', 'Test Box Item');
  await page.selectOption('select[name="unit"]', 'box');
  await page.fill('input[name="packQty"]', '40');
  await page.waitForTimeout(200);
  await page.click('button:has-text("Per piece")');
  await page.fill('input[name="price"]', '12');
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(1500);
  console.log('product saved, url:', page.url());

  // Now go create an invoice and add this product, test box+pieces qty
  await page.goto('http://localhost:3000/invoices/new', { waitUntil: 'networkidle' });
  await page.click('text=Add "someone new" as a new customer').catch(() => {});
  await page.waitForTimeout(300);
  // fill a quick customer name field if quick-add shown
  const quickAddVisible = await page.locator('input[name="name"]').first().isVisible().catch(() => false);
  if (quickAddVisible) {
    await page.fill('input[name="name"]', 'Test Customer BP');
    await page.click('button:has-text("Save customer")');
    await page.waitForTimeout(500);
  }

  await page.fill('input[placeholder="Search catalog to add…"]', 'Test Box Item');
  await page.waitForTimeout(400);
  await page.click('text=Test Box Item');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/box-invoice-added.png', fullPage: true });

  // set extra pieces to 20 via the invoice sheet input
  const piecesInput = page.locator('input[aria-label*="Extra loose pieces"]').first();
  await piecesInput.fill('20');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/box-invoice-pieces20.png', fullPage: true });

  console.log('done invoice test');
  await browser.close();
})();
