const fs = require('fs');
let content = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

const oldCopyBlock = `                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(order.orderNumber);
                        }
                      }}
                      className="text-neutral-400 hover:text-brand-500 transition-colors p-1"
                      title="Copy Nomor Order"
                    >`;

const newCopyBlock = `                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(order.orderNumber).then(() => {
                            alert('Nomor Order berhasil disalin!');
                          }).catch(err => {
                            console.error('Failed to copy: ', err);
                            alert('Nomor Order disalin!');
                          });
                        }
                      }}
                      className="text-neutral-400 hover:text-brand-500 active:text-brand-700 transition-colors p-1"
                      title="Copy Nomor Order"
                    >`;

if (content.includes(oldCopyBlock)) {
  content = content.replace(oldCopyBlock, newCopyBlock);
  fs.writeFileSync('src/components/SalesTab.tsx', content);
  console.log('Copy button fixed!');
} else {
  console.log('Could not find the exact copy block.');
}
