import re

with open('src/components/CatalogTab.tsx', 'r') as f:
    catalog = f.read()

# Add preview state
state_line = """  const [previewImage, setPreviewImage] = useState<{url: string, title: string} | null>(null);"""
if "const [previewImage, setPreviewImage]" not in catalog:
    catalog = catalog.replace("  const [isEditing, setIsEditing] = useState(false);", "  const [isEditing, setIsEditing] = useState(false);\n" + state_line)

# Update grid view image
target1 = """                <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-950 overflow-hidden shrink-0 flex items-center justify-center">
                  {!brokenImages[book.id] && book.cover ? (
                    <img
                      referrerPolicy="no-referrer"
                      src={book.cover}
                      alt={book.bookName}
                      onError={() => setBrokenImages(prev => ({ ...prev, [book.id]: true }))}
                      className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                    />
                  ) : ("""

replacement1 = """                <div 
                  className="relative aspect-square bg-neutral-100 dark:bg-neutral-950 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer group-hover:opacity-90 transition"
                  onClick={(e) => {
                    if (!brokenImages[book.id] && book.cover) {
                      e.stopPropagation();
                      setPreviewImage({ url: book.cover, title: book.bookName });
                    }
                  }}
                >
                  {!brokenImages[book.id] && book.cover ? (
                    <img
                      referrerPolicy="no-referrer"
                      src={book.cover}
                      alt={book.bookName}
                      onError={() => setBrokenImages(prev => ({ ...prev, [book.id]: true }))}
                      className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                    />
                  ) : ("""

if target1 in catalog:
    catalog = catalog.replace(target1, replacement1)
    print("Replaced grid view image")

# Update grid view text
target2 = """                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-semibold text-neutral-800 dark:text-neutral-100 text-[11px] line-clamp-2 leading-tight">
                      {book.bookName}
                    </h3>"""

replacement2 = """                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <TruncatedTooltip content={book.bookName} className="font-semibold text-neutral-800 dark:text-neutral-100 text-[11px] line-clamp-2 leading-tight">
                      {book.bookName}
                    </TruncatedTooltip>"""

if target2 in catalog:
    catalog = catalog.replace(target2, replacement2)
    print("Replaced grid view text")

# Update list view image
target3 = """                      <div 
                        className="h-10 w-8 bg-neutral-100 dark:bg-neutral-950 rounded overflow-hidden mx-auto flex items-center justify-center border border-neutral-250 dark:border-neutral-800 hover:scale-110 hover:border-indigo-500 hover:shadow-sm transition-all duration-150 cursor-zoom-in"
                      >
                        {!brokenImages[book.id] && book.cover ? (
                          <img 
                            referrerPolicy="no-referrer" 
                            src={book.cover} 
                            alt="" 
                            onError={() => setBrokenImages(prev => ({ ...prev, [book.id]: true }))}
                            className="h-full w-full object-contain pointer-events-none" 
                          />
                        ) : ("""

replacement3 = """                      <div 
                        className="h-10 w-8 bg-neutral-100 dark:bg-neutral-950 rounded overflow-hidden mx-auto flex items-center justify-center border border-neutral-250 dark:border-neutral-800 hover:scale-110 hover:border-indigo-500 hover:shadow-sm transition-all duration-150 cursor-zoom-in"
                        onClick={(e) => {
                          if (!brokenImages[book.id] && book.cover) {
                            e.stopPropagation();
                            setPreviewImage({ url: book.cover, title: book.bookName });
                          }
                        }}
                      >
                        {!brokenImages[book.id] && book.cover ? (
                          <img 
                            referrerPolicy="no-referrer" 
                            src={book.cover} 
                            alt="" 
                            onError={() => setBrokenImages(prev => ({ ...prev, [book.id]: true }))}
                            className="h-full w-full object-contain pointer-events-none" 
                          />
                        ) : ("""

if target3 in catalog:
    catalog = catalog.replace(target3, replacement3)
    print("Replaced list view image")

# Update list view text
target4 = """                    <td className="p-4 text-center font-semibold">{book.bookName}</td>"""
replacement4 = """                    <td className="p-4 text-center font-semibold max-w-[200px] truncate"><TruncatedTooltip content={book.bookName}>{book.bookName}</TruncatedTooltip></td>"""

if target4 in catalog:
    catalog = catalog.replace(target4, replacement4)
    print("Replaced list view text")

modal_comp = """      <ImagePreviewModal 
        isOpen={!!previewImage} 
        onClose={() => setPreviewImage(null)} 
        imageUrl={previewImage?.url || ''} 
        title={previewImage?.title} 
      />
    </div>
  );
}"""

if "<ImagePreviewModal" not in catalog:
    catalog = catalog.replace("    </div>\n  );\n}", modal_comp)
    print("Modal added")


with open('src/components/CatalogTab.tsx', 'w') as f:
    f.write(catalog)
