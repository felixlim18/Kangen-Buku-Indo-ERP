const fs = require('fs');
let code = fs.readFileSync('src/components/DataMasterManager.tsx', 'utf8');

// Add editAdminFee
code = code.replace(
  `                            </select>
                          </div>
                        )}
                      </div>
                      {/* Color Palette Picker during Edit */}`,
  `                            </select>
                          </div>
                        )}
                        {prefix === 'config_platform_' && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <span className="text-[11px] font-bold text-neutral-500">Biaya Admin (TWD):</span>
                            <input
                              type="number"
                              step="any"
                              value={editAdminFee}
                              onChange={(e) => setEditAdminFee(e.target.value)}
                              className="w-16 px-2.5 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-numeric text-neutral-800 dark:text-neutral-200"
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                      {/* Color Palette Picker during Edit */}`
);

// Remove truncate from item name and adjust layout
code = code.replace(
  `<span className="font-bold text-xs text-neutral-800 dark:text-neutral-100 truncate">`,
  `<span className="font-bold text-xs text-neutral-800 dark:text-neutral-100 break-words line-clamp-2">`
);

// Make the row wrap more easily
code = code.replace(
  `className={\`flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition bg-white dark:bg-neutral-950\`}`,
  `className={\`flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition bg-white dark:bg-neutral-950\`}`
);

fs.writeFileSync('src/components/DataMasterManager.tsx', code);
