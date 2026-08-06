const fs = require('fs');
let code = fs.readFileSync('src/components/DataMasterManager.tsx', 'utf8');

code = code.replace(
  "                          <div className=\"flex flex-wrap items-center gap-3 shrink-0 ml-auto mr-2\">\n                            {/* COD Toggle */}",
  "                          <div className=\"flex flex-wrap items-center gap-3 shrink-0 ml-auto mr-2\">\n                            <div className=\"flex items-center gap-1.5 mr-2\">\n                              <span className=\"text-[11px] font-bold text-neutral-500 dark:text-neutral-400\">\n                                Biaya Admin:\n                              </span>\n                              <span className=\"text-[11px] font-numeric font-bold text-neutral-800 dark:text-neutral-200\">\n                                NT$ {item.adminFee || 0}\n                              </span>\n                            </div>\n                            {/* COD Toggle */}"
);

fs.writeFileSync('src/components/DataMasterManager.tsx', code);
