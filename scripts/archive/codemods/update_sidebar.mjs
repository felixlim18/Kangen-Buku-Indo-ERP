import fs from 'fs';
let content = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

content = content.replace(
  '{/* Standalone Income section (above Expenses) */}',
  '{hasPerm("income") && (\n        <>\n        {/* Standalone Income section (above Expenses) */}'
);

content = content.replace(
  /        \{\/\* Standalone Piutang Usaha section \*\/\}/g,
  '        </>\n        )}\n        {hasPerm("piutang") && (\n        <>\n        {/* Standalone Piutang Usaha section */}'
);

content = content.replace(
  /        \{\/\* Accordion Expenses section \*\/\}/g,
  '        </>\n        )}\n        {(hasPerm("perlengkapan") || hasPerm("iklan")) && (\n        {/* Accordion Expenses section */}'
);

content = content.replace(
  /        \{\/\* Standalone Fixed Assets section \*\/\}/g,
  '        )}\n        {/* Standalone Fixed Assets section */}'
);

content = content.replace(
  /\{\[\n                  \{ id: 'perlengkapan', label: 'Perlengkapan', emoji: '🧹' \},\n                  \{ id: 'iklan', label: 'Iklan', emoji: '📢' \}\n                \]\.map\(\(sub\)/g,
  "{[\n                  { id: 'perlengkapan', label: 'Perlengkapan', emoji: '🧹' },\n                  { id: 'iklan', label: 'Iklan', emoji: '📢' }\n                ].filter(sub => hasPerm(sub.id)).map((sub)"
);

fs.writeFileSync('src/components/Sidebar.tsx', content);
