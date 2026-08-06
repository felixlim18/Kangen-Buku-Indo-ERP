import fs from 'fs';
let content = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

content = content.replace(
  '{(hasPerm("perlengkapan") || hasPerm("iklan")) && (\\n        <>',
  '{(hasPerm("perlengkapan") || hasPerm("iklan")) && (\n        <>'
);

fs.writeFileSync('src/components/Sidebar.tsx', content);
