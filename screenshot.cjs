const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  
  // Desktop screenshot
  const desktop = await browser.newPage();
  await desktop.setViewportSize({ width: 1440, height: 900 });
  await desktop.goto('https://mailania.probablydanny.com', { waitUntil: 'networkidle', timeout: 30000 });
  await desktop.waitForTimeout(2000);
  await desktop.screenshot({ path: '/tmp/mailania/desktop-login.png', fullPage: false });
  console.log('Desktop login screenshot saved');
  
  // Mobile screenshot
  const mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto('https://mailania.probablydanny.com', { waitUntil: 'networkidle', timeout: 30000 });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: '/tmp/mailania/mobile-login.png', fullPage: false });
  console.log('Mobile login screenshot saved');
  
  await browser.close();
})();
