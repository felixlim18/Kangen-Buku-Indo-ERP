import fs from 'fs';
let content = fs.readFileSync('src/components/DashboardTab.tsx', 'utf8');

content = content.replace(
  '  useEffect(() => {\n    // Read books catalog',
  `  const hasPerm = (key: string) => {
    if (profile?.role === 'owner') return true;
    return !!profile?.permissions?.[key];
  };

  useEffect(() => {
    // Read books catalog`
);

fs.writeFileSync('src/components/DashboardTab.tsx', content);
