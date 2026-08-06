const fs = require('fs');
let code = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

code = code.replace(
  "    if (listToUse.length > 0) {\n      const exists = listToUse.some((p) => p.name === platformOrder);\n      if (!exists) {\n        setPlatformOrder(listToUse[0].name);\n      }\n    } else {\n      setPlatformOrder('');\n    }",
  "    if (listToUse.length > 0) {\n      const exists = listToUse.some((p) => p.name === platformOrder);\n      if (!exists) {\n        setPlatformOrder(listToUse[0].name);\n        const matched = listToUse[0];\n        if (matched && matched.adminFee !== undefined) {\n          setPlatformFeeInput(String(matched.adminFee));\n        } else {\n          setPlatformFeeInput('0');\n        }\n      }\n    } else {\n      setPlatformOrder('');\n      setPlatformFeeInput('0');\n    }"
);

code = code.replace(
  "                            onChange={e => setPlatformOrder(e.target.value)}",
  "                            onChange={e => {\n                              const val = e.target.value;\n                              setPlatformOrder(val);\n                              if (!editingOrder) {\n                                const matched = filteredPlatformsByPayment.find((p: any) => p.name === val);\n                                if (matched && matched.adminFee !== undefined) {\n                                  setPlatformFeeInput(String(matched.adminFee));\n                                } else {\n                                  setPlatformFeeInput('0');\n                                }\n                              }\n                            }}"
);

fs.writeFileSync('src/components/SalesTab.tsx', code);
