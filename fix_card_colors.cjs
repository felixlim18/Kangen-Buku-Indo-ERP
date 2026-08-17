const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const oldLoopStart = `              const showReadyStockHighlight = !isPinnedOrder && !showOverdueHighlight && isReadyStock;`;
const newLoopStart = `              const showReadyStockHighlight = !isPinnedOrder && !showOverdueHighlight && isReadyStock;
              
              let cardBgClass = 'bg-white dark:bg-neutral-900 border-[#E7E1D2] dark:border-neutral-800';
              if (order.isPinned) {
                cardBgClass = 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30';
              } else if (showOverdueHighlight) {
                cardBgClass = isCritical ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
              } else if (showReadyStockHighlight) {
                cardBgClass = 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30';
              }`;

content = content.replace(oldLoopStart, newLoopStart);

const oldCardClass = `              <div
                key={\`m-\${order.id}-\${orderIdx}\`}
                className="kbi-ocard"`;
const newCardClass = `              <div
                key={\`m-\${order.id}-\${orderIdx}\`}
                className={\`kbi-ocard \${cardBgClass}\`}
                style={{ backgroundColor: 'transparent' } /* Override old hardcoded background if any */}`;

content = content.replace(oldCardClass, newCardClass);

const oldReadyStockBadge = `                  {showReadyStockHighlight && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-1 py-0.5 rounded-[4px] font-semibold"><Check className="h-3 w-3" />Stok siap</span>
                  )}`;
content = content.replace(oldReadyStockBadge, ''); // user explicitly requested to remove 'Stok Siap' text

fs.writeFileSync('src/components/SalesTab.tsx', content);
console.log('Mobile card background colors applied!');
