const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

// 1. Fix Mobile Search Bar Row (remove gap, background, and sticky behavior)
const oldMobileSearch = '<div className="md:hidden sticky top-[52px] z-30 bg-[#f3f4f6] dark:bg-[#0d1117] pt-2 pb-3 -mx-4 px-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2 mb-3">';
const newMobileSearch = '<div className="md:hidden flex items-center gap-2 mb-3">';
if (content.includes(oldMobileSearch)) {
  content = content.replace(oldMobileSearch, newMobileSearch);
}

// 2. Hide Desktop Search Bar on Mobile
const oldDesktopToolbar = '{/* 3. TOOLBAR */}\n      <div className="space-y-3">';
const newDesktopToolbar = '{/* 3. TOOLBAR */}\n      <div className="hidden md:block space-y-3">';
if (content.includes(oldDesktopToolbar)) {
  content = content.replace(oldDesktopToolbar, newDesktopToolbar);
}

// 3. Add Border below first row of Transaction Card
const oldCardTop = '<div className="kbi-ocard__top pb-1">';
const newCardTop = '<div className="kbi-ocard__top pb-1.5 border-b border-neutral-200 dark:border-neutral-800 mb-1.5">';
// Make sure to only replace it once or globally, wait, since it's the mobile card layout, there's only one.
content = content.replace(oldCardTop, newCardTop);

// 4. Fallback customer name to platform/channel
const oldBuyerName = '<div className="font-bold text-[#2b5a9e] dark:text-brand-400 text-[13px] mb-2 leading-none">{order.customerName}</div>';
const newBuyerName = '<div className="font-bold text-[#2b5a9e] dark:text-brand-400 text-[13px] mb-2 leading-none">{order.customerName || order.customerPlatformName || channelName}</div>';
content = content.replace(oldBuyerName, newBuyerName);

fs.writeFileSync('src/components/SalesTab.tsx', content);
console.log('Mobile layout tweaks applied successfully.');
