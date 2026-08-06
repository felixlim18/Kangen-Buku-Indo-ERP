import re

with open('src/index.css', 'r') as f:
    css = f.read()

# Replace specific hex colors
css = css.replace('#4f46e5', '#2b5a9e')
css = css.replace('#4338ca', '#22487e')

# Add brand color palette to @theme
theme_start = css.find('@theme {')
if theme_start != -1:
    insert_pos = css.find('\n', theme_start) + 1
    brand_colors = """  --color-brand-50: #ebf0f7;
  --color-brand-100: #d6e2f0;
  --color-brand-150: #c1d4e8;
  --color-brand-200: #adc6e1;
  --color-brand-300: #85a9d2;
  --color-brand-400: #5c8dc3;
  --color-brand-450: #4f82b8;
  --color-brand-500: #4277b2;
  --color-brand-600: #2b5a9e;
  --color-brand-650: #26518f;
  --color-brand-700: #22487e;
  --color-brand-800: #1a365f;
  --color-brand-900: #11243f;
  --color-brand-950: #091220;
"""
    css = css[:insert_pos] + brand_colors + css[insert_pos:]

with open('src/index.css', 'w') as f:
    f.write(css)

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

# Replace indigo with brand in SalesTab.tsx
sales = re.sub(r'\bindigo-', 'brand-', sales)

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(sales)
