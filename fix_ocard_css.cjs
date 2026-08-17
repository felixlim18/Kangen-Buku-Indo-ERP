const fs = require('fs');
let content = fs.readFileSync('src/mobile.css', 'utf8');

const oldCss = `.kbi-ocard {
    position: relative;
    padding-left: 16px;
    background: var(--m-surface);
    border: 1px solid var(--m-line);
    border-radius: 15px;
    overflow: hidden;`;

const newCss = `.kbi-ocard {
    position: relative;
    padding-left: 16px;
    /* background color is now handled by Tailwind classes (e.g. bg-white or bg-emerald-50) */
    border: 1px solid var(--m-line);
    border-radius: 15px;
    overflow: hidden;`;

if (content.includes(oldCss)) {
  content = content.replace(oldCss, newCss);
  fs.writeFileSync('src/mobile.css', content);
  console.log('mobile.css updated successfully.');
} else {
  console.log('Could not find the exact CSS block.');
}
