const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleMsgs = [];
  const failedReqs = [];
  page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleMsgs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => failedReqs.push(`${req.method()} ${req.url()} -- ${req.failure()?.errorText}`));
  page.on('response', (res) => { if (res.status() >= 400) failedReqs.push(`${res.status()} ${res.url()}`); });

  await page.goto('https://invozy-alpha.vercel.app/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[name="identifier"]', 'nonexistent@example.com');
  await page.fill('input[name="password"]', 'wrongpassword123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  console.log('=== inline error text present? ===');
  const inlineError = await page.locator('text=Incorrect email/phone or password.').count();
  console.log('inline error count:', inlineError);

  console.log('=== toast present? ===');
  const toastEl = await page.locator('[data-sonner-toast]').count();
  console.log('toast count:', toastEl);
  if (toastEl > 0) {
    console.log('toast text:', await page.locator('[data-sonner-toast]').first().innerText());
  }

  console.log('=== sonner toaster region in DOM? ===');
  const region = await page.locator('[data-sonner-toaster]').count();
  console.log('toaster region count:', region);

  console.log('=== CONSOLE/ERRORS ===');
  console.log(consoleMsgs.join('\n') || '(none)');
  console.log('=== FAILED/4xx/5xx REQUESTS ===');
  console.log(failedReqs.join('\n') || '(none)');

  await page.screenshot({ path: '/tmp/prod-login-fail.png', fullPage: true });
  await browser.close();
})();
