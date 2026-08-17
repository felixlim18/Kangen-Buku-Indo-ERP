const { execSync } = require('child_process');

const scripts = [
  'fix_sales.cjs',
  'fix_sales_2.cjs',
  'fix_cards.cjs',
  'fix_copy.cjs',
  'fix_card_colors.cjs',
  'fix_card_colors_2.cjs',
  'fix_card_colors_3.cjs',
  'fix_card_colors_4.cjs',
  'fix_sostat.cjs'
];

for (const script of scripts) {
  console.log(`Running ${script}...`);
  try {
    execSync(`node ${script}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed on ${script}`, err);
  }
}
console.log('Restoration complete.');
