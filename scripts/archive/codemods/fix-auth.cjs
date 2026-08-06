const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

// Remove the old ones
content = content.replace('const isStaffValue = profile?.role === "staff";\n  const hasPerm = (perm: string) => { if (profile?.role === "owner") return true; return profile?.permissions?.[perm] === true; };', '');
content = content.replace('const { user, profile } = useAuth();', '');

// Insert them at the top of PurchasesTab component
const insertStr = `  const { user, profile } = useAuth();\n  const isStaffValue = profile?.role === "staff";\n  const hasPerm = (perm: string) => { if (profile?.role === "owner") return true; return profile?.permissions?.[perm] === true; };\n`;

content = content.replace('export function PurchasesTab() {', 'export function PurchasesTab() {\n' + insertStr);

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
