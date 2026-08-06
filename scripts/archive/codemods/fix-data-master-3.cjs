const fs = require('fs');
let code = fs.readFileSync('src/components/DataMasterManager.tsx', 'utf8');

code = code.replace(
  "            {/* Toggles selector (COD, Transfer, Ongkos Kirim) for Platform Order */}",
  "            {/* Platform Order - Admin Fee */}\n            {prefix === 'config_platform_' && (\n              <div className=\"flex flex-wrap items-center gap-2 shrink-0 bg-white dark:bg-neutral-950 px-3 py-1.5 border border-neutral-200 dark:border-neutral-800 rounded-xl\">\n                <span className=\"text-xs font-bold text-neutral-600 dark:text-neutral-400\">Biaya Admin (TWD):</span>\n                <input\n                  type=\"number\"\n                  step=\"any\"\n                  value={newItemAdminFee}\n                  onChange={(e) => setNewItemAdminFee(e.target.value)}\n                  className=\"w-20 text-xs bg-transparent border-b border-neutral-300 dark:border-neutral-700 focus:outline-none focus:border-brand-500 pb-0.5\"\n                  placeholder=\"0\"\n                />\n              </div>\n            )}\n\n            {/* Toggles selector (COD, Transfer, Ongkos Kirim) for Platform Order */}"
);

fs.writeFileSync('src/components/DataMasterManager.tsx', code);
