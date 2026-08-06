import re

with open('src/components/BulkProcessModal.tsx', 'r') as f:
    content = f.read()

# Remove the 6th column in the row
content = re.sub(
    r'<div className={`flex items-center justify-center \$\{row\.status === \'success\' \? \'text-\[#12876b\]\' : row\.status === \'error\' \? \'text-\[#b8433a\]\' : \'\'\}`}>\s*\{row\.status === \'success\' && <svg.*?</svg>\}\s*\{row\.status === \'error\' && <svg.*?</svg>\}\s*</div>',
    '',
    content,
    flags=re.DOTALL
)

# Remove the header background
content = content.replace(
    'bg-[#2b5a9e] border-b-2 border-[#173a6b]',
    'bg-[#f1f6fc] border-b border-[#dde4f0]'
)

# Change header text color to match the requested table header color
content = content.replace(
    "text-white/90",
    "text-[#5f6b7d] justify-center text-center"
)

# Center align text inputs
content = content.replace(
    "px-2.5 py-2 font-['IBM_Plex_Mono'] text-[12.5px] tracking-[0.2px] text-[#101826] border-r border-[#dde4f0]",
    "px-2.5 py-2 font-['IBM_Plex_Mono'] text-[12.5px] tracking-[0.2px] text-[#101826] border-r border-[#dde4f0] text-center"
)

with open('src/components/BulkProcessModal.tsx', 'w') as f:
    f.write(content)

print("Modal patched")
