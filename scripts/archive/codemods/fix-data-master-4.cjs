const fs = require('fs');
let code = fs.readFileSync('src/components/DataMasterManager.tsx', 'utf8');

code = code.replace(
  "                          </div>\n                        )}\n                      </div>\n                      {/* Color Palette Picker during Edit */}",
  "                          </div>\n                        )}\n                        {prefix === 'config_platform_' && (\n                          <div className=\"flex items-center gap-1 shrink-0 ml-2\">\n                            <span className=\"text-[11px] font-bold text-neutral-500\">Biaya Admin (TWD):</span>\n                            <input\n                              type=\"number\"\n                              step=\"any\"\n                              value={editAdminFee}\n                              onChange={(e) => setEditAdminFee(e.target.value)}\n                              className=\"w-16 px-2.5 py-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-numeric text-neutral-800 dark:text-neutral-200\"\n                              placeholder=\"0\"\n                            />\n                          </div>\n                        )}\n                      </div>\n                      {/* Color Palette Picker during Edit */}"
);

fs.writeFileSync('src/components/DataMasterManager.tsx', code);
