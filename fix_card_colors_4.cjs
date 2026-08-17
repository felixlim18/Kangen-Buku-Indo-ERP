const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const mobileHighlightStr = `          const showReadyStockHighlight = !isPinnedOrder && !showOverdueHighlight && isReadyStock;`;
const newMobileHighlightStr = `          const showReadyStockHighlight = !isPinnedOrder && !showOverdueHighlight && isReadyStock;
          
          let cardBgClass = 'bg-white dark:bg-neutral-900 border-[#E7E1D2] dark:border-neutral-800';
          if (order.isPinned) {
            cardBgClass = 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30';
          } else if (showOverdueHighlight) {
            cardBgClass = isCritical ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
          } else if (showReadyStockHighlight) {
            cardBgClass = 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30';
          }`;

if (content.includes(mobileHighlightStr)) {
  content = content.replace(mobileHighlightStr, newMobileHighlightStr);
}

fs.writeFileSync('src/components/SalesTab.tsx', content);
console.log('Fixed undefined cardBgClass for mobile cards');
