const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

const insertStr = `  const { user, profile } = useAuth();\n  const isStaffValue = profile?.role === "staff";\n  const hasPerm = (perm: string) => { if (profile?.role === "owner") return true; return profile?.permissions?.[perm] === true; };\n`;

content = content.replace('export const PurchasesTab = () => {', 'export const PurchasesTab = () => {\n' + insertStr);

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
