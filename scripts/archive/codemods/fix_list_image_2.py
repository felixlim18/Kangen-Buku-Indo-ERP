import re

with open('src/components/CatalogTab.tsx', 'r') as f:
    catalog = f.read()

target = """                        onMouseLeave={handleThumbnailMouseLeave}
                        className="h-10 w-8 bg-neutral-100 dark:bg-neutral-950 rounded overflow-hidden mx-auto flex items-center justify-center border border-neutral-250 dark:border-neutral-800 hover:scale-110 hover:border-indigo-500 hover:shadow-sm transition-all duration-150 cursor-zoom-in"
                      >"""

replacement = """                        onMouseLeave={handleThumbnailMouseLeave}
                        className="h-10 w-8 bg-neutral-100 dark:bg-neutral-950 rounded overflow-hidden mx-auto flex items-center justify-center border border-neutral-250 dark:border-neutral-800 hover:scale-110 hover:border-indigo-500 hover:shadow-sm transition-all duration-150 cursor-zoom-in"
                        onClick={(e) => {
                          if (!brokenImages[book.id] && book.cover) {
                            e.stopPropagation();
                            setPreviewImage({ url: book.cover, title: book.bookName });
                          }
                        }}
                      >"""

if target in catalog:
    catalog = catalog.replace(target, replacement)
    print("Replaced list view image correctly")
else:
    print("Failed again")

with open('src/components/CatalogTab.tsx', 'w') as f:
    f.write(catalog)
