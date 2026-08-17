const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const importVaul = `import { Drawer } from 'vaul';\n`;
if (!content.includes(`import { Drawer } from 'vaul'`)) {
  content = importVaul + content;
}

const oldModalStart = `{isNewOrderOpen && createPortal(
        <div className={\`kbi-so-overlay\${sidebarHidden ? ' kbi-so-overlay--rail' : ''}\`} onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsNewOrderOpen(false);
            setEditingOrder(null);
            resetOrderForm();
          }
        }}>
          <div className="kbi-so-card" onClick={e => e.stopPropagation()}>`;

const newModalStart = `{isNewOrderOpen && createPortal(
        isMobileScreen ? (
          <Drawer.Root open={isNewOrderOpen} onOpenChange={(open) => {
            if (!open) {
              setIsNewOrderOpen(false);
              setEditingOrder(null);
              resetOrderForm();
            }
          }}>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 bg-black/60 z-[9999]" />
              <Drawer.Content className="bg-[#f5f6f7] dark:bg-[#0d1117] flex flex-col rounded-t-[16px] h-[96%] mt-24 fixed bottom-0 left-0 right-0 z-[10000] outline-none">
                <div className="p-4 bg-white dark:bg-neutral-900 rounded-t-[16px] flex-1 flex flex-col overflow-hidden shadow-[0_-4px_24px_rgba(0,0,0,0.08)] border border-neutral-200/50 dark:border-neutral-800">
                  <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700 mb-4 cursor-grab active:cursor-grabbing" />
                  <div className="flex-1 overflow-y-auto w-full max-w-full pb-safe">
                    <div className="kbi-so-card kbi-so-card--vaul" onClick={e => e.stopPropagation()}>`;

const oldModalEnd = `          </div>
        </div>,
        document.body
      )}`;

const newModalEnd = `                    </div>
                  </div>
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        ) : (
          <div className={\`kbi-so-overlay\${sidebarHidden ? ' kbi-so-overlay--rail' : ''}\`} onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsNewOrderOpen(false);
              setEditingOrder(null);
              resetOrderForm();
            }
          }}>
            <div className="kbi-so-card" onClick={e => e.stopPropagation()}>`;

// We also need to add the closing div for the desktop modal
const finalEnd = `            </div>
          </div>
        ),
        document.body
      )}`;

if (content.includes(oldModalStart)) {
  content = content.replace(oldModalStart, newModalStart);
  content = content.replace(oldModalEnd, finalEnd);
  fs.writeFileSync('src/components/SalesTab.tsx', content);
  console.log('Successfully wrapped modal in Vaul Drawer');
} else {
  console.log('Could not find modal start block');
}
