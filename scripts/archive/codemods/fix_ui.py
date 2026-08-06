import re

with open('src/index.css', 'r') as f:
    css = f.read()

# Change .kbi-so-col-heading uppercase to capitalize
target_heading = """.kbi-so-col-heading {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;"""
replacement_heading = """.kbi-so-col-heading {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: capitalize;"""
css = css.replace(target_heading, replacement_heading)

with open('src/index.css', 'w') as f:
    f.write(css)

with open('src/components/SalesTab.tsx', 'r') as f:
    sales = f.read()

target_cover = """                        {it.bookCover ? (
                          <div className="w-[4.25rem] bg-neutral-50 dark:bg-neutral-900 overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-800 p-2">
                            <div className="w-full aspect-square relative rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 overflow-hidden">
                              <img referrerPolicy="no-referrer" src={it.bookCover} alt="" className="absolute inset-0 w-full h-full object-contain" />
                            </div>
                          </div>
                        ) : ("""

replacement_cover = """                        {it.bookCover ? (
                          <div className="w-20 bg-neutral-50 dark:bg-neutral-900 overflow-hidden flex-shrink-0 flex items-center justify-center border-r border-neutral-200 dark:border-neutral-800">
                            <img referrerPolicy="no-referrer" src={it.bookCover} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : ("""

if target_cover in sales:
    sales = sales.replace(target_cover, replacement_cover)
    print("Cover JSX updated successfully")
else:
    print("Target cover JSX not found")

with open('src/components/SalesTab.tsx', 'w') as f:
    f.write(sales)
