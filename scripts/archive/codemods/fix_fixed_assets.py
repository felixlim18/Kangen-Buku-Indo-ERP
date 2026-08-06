import re

with open('src/components/FixedAssetsTab.tsx', 'r') as f:
    content = f.read()

# Add import
if 'formatInputWithCommas' not in content[:500]:
    content = content.replace("import { formatNTD } from '../lib/decimal-utils';", "import { formatNTD, formatInputWithCommas } from '../lib/decimal-utils';")

# Remove local function definition
old_fn = """  // Real-time visual formatting helper for number input
  const formatInputWithCommas = (value: string): string => {
    const clean = value.replace(/[^\d.]/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    const integerPart = parts[0];
    const decimalPart = parts[1] !== undefined ? '.' + parts[1].slice(0, 2) : '';
    if (!integerPart && !decimalPart) return '';
    const formattedInteger = integerPart ? Number(integerPart).toLocaleString('en-US') : '';
    return formattedInteger + decimalPart;
  };"""

content = content.replace(old_fn, "")

with open('src/components/FixedAssetsTab.tsx', 'w') as f:
    f.write(content)
