const fs = require('fs');
let content = fs.readFileSync('src/mobile.css', 'utf8');

const oldSostat = `  .kbi-sostat {
    display: flex !important;
    gap: 8px !important;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    margin-inline: calc(var(--m-gutter) * -1);
    padding-inline: var(--m-gutter);
    padding-bottom: 4px;
  }`;

const newSostat = `  .kbi-sostat {
    display: flex !important;
    gap: 8px !important;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    padding-bottom: 4px;
  }`;

if (content.includes(oldSostat)) {
  content = content.replace(oldSostat, newSostat);
  fs.writeFileSync('src/mobile.css', content);
  console.log('Fixed kbi-sostat margins');
} else {
  console.log('Could not find kbi-sostat block');
}
