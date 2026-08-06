import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const redirectCode = `
  useEffect(() => {
    if (!profile) return;
    if (!hasPerm(activeTab)) {
      const availableTabs = [
        'dashboard', 'catalog', 'sales', 'purchases', 'freight-in', 'inventory',
        'income', 'piutang', 'perlengkapan', 'iklan', 'fixed-assets',
        'financial', 'double-entry', 'report-sales-detail', 'user-management'
      ];
      const firstAvailable = availableTabs.find(tab => hasPerm(tab));
      if (firstAvailable && firstAvailable !== activeTab) {
        setActiveTab(firstAvailable);
      }
    }
  }, [profile, activeTab]);

  const [theme, setTheme]
`;

content = content.replace(
  '  const [theme, setTheme]',
  redirectCode
);

fs.writeFileSync('src/App.tsx', content);
