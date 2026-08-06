const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    const el = await page.$('div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1)');
    if (el) {
       console.log(await el.innerHTML());
    } else {
       console.log('Element not found');
    }
  } catch(e) {
    console.error(e);
  }

  await browser.close();
})();
