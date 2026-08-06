import re

with open('src/components/PerlengkapanTab.tsx', 'r') as f:
    content = f.read()

# Replace Math.round(x * 100) / 100 with x
content = re.sub(r'Math\.round\(([^ *]+) \* 100\) / 100', r'\1', content)

with open('src/components/PerlengkapanTab.tsx', 'w') as f:
    f.write(content)
