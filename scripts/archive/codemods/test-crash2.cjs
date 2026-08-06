const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));

  await page.goto('http://localhost:3000');
  await new Promise(r => setTimeout(r, 2000));
  
  // Click on Purchases tab
  // Let's try to evaluate to change the tab, or click the link
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, div'));
      const purchasesBtn = buttons.find(b => b.textContent.includes('Purchase'));
      if (purchasesBtn) purchasesBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.error(e);
  }

  await browser.close();
})();
