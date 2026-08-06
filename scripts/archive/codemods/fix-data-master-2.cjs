const fs = require('fs');
let code = fs.readFileSync('src/components/DataMasterManager.tsx', 'utf8');

code = code.replace(
  "  isTransfer?: boolean;\n  platforms?: string[];\n}",
  "  isTransfer?: boolean;\n  platforms?: string[];\n  adminFee?: number;\n}"
);

code = code.replace(
  "  const [newItemPlatforms, setNewItemPlatforms] = useState<string[]>([]);",
  "  const [newItemPlatforms, setNewItemPlatforms] = useState<string[]>([]);\n  const [newItemAdminFee, setNewItemAdminFee] = useState<string>('0');"
);

code = code.replace(
  "  const [editOrderCategory, setEditOrderCategory] = useState<'Marketplace' | 'Direct Order' | 'Reseller'>('Direct Order');",
  "  const [editOrderCategory, setEditOrderCategory] = useState<'Marketplace' | 'Direct Order' | 'Reseller'>('Direct Order');\n  const [editAdminFee, setEditAdminFee] = useState<string>('0');"
);

code = code.replace(
  "    setEditOrderCategory(item.orderCategory || 'Direct Order');",
  "    setEditOrderCategory(item.orderCategory || 'Direct Order');\n    setEditAdminFee(item.adminFee !== undefined ? String(item.adminFee) : '0');"
);

code = code.replace(
  "          payload.platforms = newItemPlatforms;",
  "          payload.platforms = newItemPlatforms;\n        }\n        if (prefix === 'config_platform_') {\n          payload.adminFee = parseFloat(newItemAdminFee) || 0;"
);

code = code.replace(
  "        if (prefix === 'config_channel_') {\n          updateData.orderCategory = editOrderCategory;\n        }",
  "        if (prefix === 'config_channel_') {\n          updateData.orderCategory = editOrderCategory;\n        }\n        if (prefix === 'config_platform_') {\n          updateData.adminFee = parseFloat(editAdminFee) || 0;\n        }"
);

fs.writeFileSync('src/components/DataMasterManager.tsx', code);
