import re

with open('src/components/SalesTab.tsx', 'r') as f:
    content = f.read()

# Replace uppercase with capitalize for labels and headings
content = re.sub(r'uppercase(\s+font-bold\s+text-neutral-500)', r'capitalize\1', content)
content = re.sub(r'text-xs\s+uppercase\s+font-bold', r'text-xs capitalize font-bold', content)
content = re.sub(r'text-\[10px\]\s+uppercase\s+font-bold', r'text-[10px] capitalize font-bold', content)
content = re.sub(r'text-\[10px\]\s+font-bold\s+uppercase\s+text-neutral-500\s+tracking-wider', r'text-[10px] font-bold capitalize text-neutral-500 tracking-wider', content)
content = re.sub(r'text-\[10px\]\s+font-semibold\s+uppercase\s+tracking-wider', r'text-[10px] font-semibold capitalize tracking-wider', content)
content = re.sub(r'font-bold\s+uppercase\s+tracking-widest\s+text-\[9px\]', r'font-bold capitalize tracking-widest text-[9px]', content)
content = re.sub(r'font-bold\s+text-neutral-500\s+uppercase\s+tracking-widest', r'font-bold text-neutral-500 capitalize tracking-widest', content)
content = re.sub(r'text-xs\s+font-bold\s+text-neutral-450\s+dark:text-neutral-500\s+uppercase\s+tracking-wider', r'text-xs font-bold text-neutral-450 dark:text-neutral-500 capitalize tracking-wider', content)
content = re.sub(r'text-xs\s+uppercase\s+font-bold\s+text-neutral-500', r'text-xs capitalize font-bold text-neutral-500', content)
content = re.sub(r'text-\[9px\]\s+uppercase\s+font-bold\s+text-neutral-450', r'text-[9px] capitalize font-bold text-neutral-450', content)
content = re.sub(r'text-\[10px\]\s+text-neutral-500\s+uppercase\s+font-bold', r'text-[10px] text-neutral-500 capitalize font-bold', content)
content = re.sub(r'text-\[10px\]\s+text-red-500\s+uppercase\s+font-bold', r'text-[10px] text-red-500 capitalize font-bold', content)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(content)
