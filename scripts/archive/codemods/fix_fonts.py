import re

with open('src/index.css', 'r') as f:
    css = f.read()

target_heading = """.kbi-so-col-heading {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: capitalize;
  letter-spacing: 0.05em;
  color: #737373;
  margin-bottom: 0.5rem;
}"""
replacement_heading = """.kbi-so-col-heading {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: bold;
  text-transform: capitalize;
  letter-spacing: normal;
  color: #171717;
  margin-bottom: 0.5rem;
}
.dark .kbi-so-col-heading {
  color: #f5f5f5;
}"""

if target_heading in css:
    css = css.replace(target_heading, replacement_heading)
    print("Replaced heading")
else:
    print("Heading not found")

target_label = """.kbi-so-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #525252;
}"""
replacement_label = """.kbi-so-label {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 600;
  color: #525252;
}"""

if target_label in css:
    css = css.replace(target_label, replacement_label)
    print("Replaced label")
else:
    print("Label not found")

with open('src/index.css', 'w') as f:
    f.write(css)
