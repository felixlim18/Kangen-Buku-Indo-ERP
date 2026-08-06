import fs from 'fs';
let content = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

content = content.replace(
  '        {/* Accordion Accounting Suite section */}',
  '        </>\n        )}\n        {/* Accordion Accounting Suite section */}'
);

fs.writeFileSync('src/components/Sidebar.tsx', content);
