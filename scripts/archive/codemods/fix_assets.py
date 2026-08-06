import re

with open('src/components/FixedAssetsTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { formatNTD, formatIDR, parseCommasToNumber } from '../lib/decimal-utils';", "import { formatNTD, formatIDR, parseCommasToNumber, formatInputWithCommas } from '../lib/decimal-utils';")

with open('src/components/FixedAssetsTab.tsx', 'w') as f:
    f.write(content)

