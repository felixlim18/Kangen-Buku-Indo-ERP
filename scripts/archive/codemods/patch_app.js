const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace("import { PiutangUtangTab } from './components/PiutangUtangTab';", "import { PiutangUtangTab } from './components/PiutangUtangTab';\nimport { PiutangTab } from './components/PiutangTab';");
code = code.replace("{activeTab === 'piutang' && <PiutangUtangTab forceMode=\"piutang\" />}", "{activeTab === 'piutang' && <PiutangTab />}");
fs.writeFileSync('src/App.tsx', code);
