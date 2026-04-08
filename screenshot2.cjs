const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  // Full page desktop
  const desktop = await browser.newPage();
  await desktop.setViewportSize({ width: 1440, height: 900 });
  await desktop.goto('https://mailania.probablydanny.com', { waitUntil: 'networkidle', timeout: 30000 });
  await desktop.waitForTimeout(2000);
  await desktop.screenshot({ path: '/tmp/mailania/desktop-login-full.png', fullPage: true });
  
  // Full page mobile  
  const mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto('https://mailania.probablydanny.com', { waitUntil: 'networkidle', timeout: 30000 });
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: '/tmp/mailania/mobile-login-full.png', fullPage: true });
  
  // Try to check focus ring - tab to the passkey button
  await mobile.keyboard.press('Tab');
  await mobile.keyboard.press('Tab');
  await mobile.keyboard.press('Tab');
  await mobile.screenshot({ path: '/tmp/mailania/mobile-focus-ring.png', fullPage: false });
  console.log('Focus ring screenshot saved');
  
  await browser.close();
})();
