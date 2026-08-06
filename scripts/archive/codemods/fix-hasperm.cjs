const fs = require('fs');
let content = fs.readFileSync('src/components/PurchasesTab.tsx', 'utf8');

content = content.replace('const [hasPerm, setHasPerm] = useState(true);', 'const hasPerm = (perm: string) => { if (profile?.role === "owner") return true; return profile?.permissions?.[perm] === true; };');
content = content.replace('const [isStaffValue, setIsStaffValue] = useState(false);', 'const isStaffValue = profile?.role === "staff";');
// Wait, is profile defined?
content = content.replace('const { user } = useAuth();', 'const { user, profile } = useAuth();');

fs.writeFileSync('src/components/PurchasesTab.tsx', content);
