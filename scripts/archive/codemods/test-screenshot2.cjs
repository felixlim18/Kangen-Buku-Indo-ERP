const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, div'));
      const purchasesBtn = buttons.find(b => b.textContent.includes('Purchase'));
      if (purchasesBtn) purchasesBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {}

  await page.screenshot({ path: 'screenshot2.png' });
  await browser.close();
})();
