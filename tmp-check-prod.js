const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleMsgs = [];
  const failedReqs = [];
  page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleMsgs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => failedReqs.push(`${req.method()} ${req.url()} -- ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    if (res.status() >= 400) failedReqs.push(`${res.status()} ${res.url()}`);
  });

  await page.goto('https://invozy-alpha.vercel.app/products', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('=== URL after nav ===');
  console.log(page.url());
  console.log('=== CONSOLE/ERRORS ===');
  console.log(consoleMsgs.join('\n') || '(none)');
  console.log('=== FAILED/4xx/5xx REQUESTS ===');
  console.log(failedReqs.join('\n') || '(none)');

  await page.screenshot({ path: '/private/tmp/claude-501/-Users-iamrithi-Desktop-arctic-blocks/f92c682c-8871-462a-9c2c-fe15ccaf2b27/scratchpad/prod-1.png', fullPage: true });

  await browser.close();
})();
