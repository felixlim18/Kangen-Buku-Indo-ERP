import { ImagePreviewModal } from "./ui/ImagePreviewModal";
import { TruncatedTooltip } from "./ui/TruncatedTooltip";
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  Timestamp,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Book, Category, Supplier } from '../types';
import { formatNTD, formatNumber } from '../lib/decimal-utils';
import { useAuth } from '../lib/auth-context';
import { propagateBookNameChange } from '../lib/db-helpers';
import { CategoryAiModal } from "./CategoryAiModal";
import { 
  Grid2X2, 
  List, 
  Plus, 
  Search, 
  Tag, 
  Edit, 
  Trash2, 
  Check, 
  X,
  AlertCircle,
  TrendingUp,
  Sliders,
  DollarSign,
  PackageCheck,
  Upload,
  Download,
  FileText,
  FileSpreadsheet,
  BookOpen,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Image,
  Sparkles
} from 'lucide-react';

function toTitleCase(str: string): string {
  return str
    .split(/(\s+)/)
    .map(part => {
      if (part.trim() === '') return part; // Keep spaces exactly
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

function smartTitleCase(str: string): string {
  // Prevent leading whitespace at the start of the string
  const cleanStr = str.replace(/^\s+/, '');
  
  return cleanStr
    .split(/(\s+)/)
    .map(part => {
      if (part.trim() === '') return part; // Keep spaces exactly
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

function handleTextCapitalization(
  e: React.ChangeEvent<HTMLInputElement>,
  setter: (val: string) => void
) {
  const input = e.target;
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  const rawValue = input.value;
  const capitalizedValue = smartTitleCase(rawValue);
  
  setter(capitalizedValue);
  
  if (selectionStart !== null && selectionEnd !== null) {
    requestAnimationFrame(() => {
      input.setSelectionRange(selectionStart, selectionEnd);
    });
  }
}

function formatInputNumber(value: string): string {
  const clean = value.replace(/\D/g, '');
  if (!clean) return '';
  return new Intl.NumberFormat('en-US').format(parseInt(clean));
}

export const CatalogTab: React.FC = () => {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const isStaffValue = profile?.role === 'owner' || profile?.role === 'staff';

  const hasPerm = (key: string) => {
    if (profile?.role === 'owner') return true;
    return !!profile?.permissions?.[key];
  };

  const [previewImage, setPreviewImage] = useState<{ url: string; title?: string } | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const getBookCategories = (bookCategory: any): string[] => {
    if (!bookCategory) return [];
    if (Array.isArray(bookCategory)) return bookCategory;
    return [bookCategory];
  };

  const resolveCategory = (item: string): Category | undefined => {
    if (!item) return undefined;
    let found = categories.find(c => c && c.id === item);
    if (!found) {
      found = categories.find(c => c && c.name && typeof c.name === 'string' && c.name.toLowerCase() === item.toLowerCase());
    }
    return found;
  };

  const getBookCategoryObjects = (book: Book): Category[] => {
    const catItems = getBookCategories(book.category);
    return catItems.map(item => {
      const found = resolveCategory(item);
      if (found) return found;
      return { id: item, name: item, color: '#6366f1', createdAt: null };
    });
  };
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table'); // Default to list view
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>(''); // For category filtering
  const [catalogPage, setCatalogPage] = useState<number>(1);

  useEffect(() => {
    setCatalogPage(1);
  }, [searchQuery, selectedCategoryFilter]);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({}); // For broken image fallback
  
  // Hover cover preview states
  const [hoveredBook, setHoveredBook] = useState<Book | null>(null);
  const [previewCoords, setPreviewCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimeoutRef = useRef<any>(null);

  const handleThumbnailMouseEnter = (e: React.MouseEvent, book: Book) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    const x = e.clientX;
    const y = e.clientY;
    setPreviewCoords({ x, y });
    setHoveredBook(book);
    
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPreview(true);
    }, 200); // 200ms delay to avoid flickering
  };

  const handleThumbnailMouseMove = (e: React.MouseEvent) => {
    setPreviewCoords({ x: e.clientX, y: e.clientY });
  };

  const handleThumbnailMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowPreview(false);
    setHoveredBook(null);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  // Cover upload states
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Modals / Drawer State
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isCategoryAiOpen, setIsCategoryAiOpen] = useState(false);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);

  // Metadata completeness states
  const [isMetadataPanelOpen, setIsMetadataPanelOpen] = useState(false);
  const [pendingMetadataUpdates, setPendingMetadataUpdates] = useState<Record<string, { shopeeId?: string; websiteId?: string }>>({});

  // Sorting states
  const [sortField, setSortField] = useState<'shopeePrice' | 'generalPrice' | 'minOrder' | 'productId' | 'bookName' | 'author' | 'category' | 'isActive' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Form states
  const [formName, setFormName] = useState('');
  const [formAuthor, setFormAuthor] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formCategories, setFormCategories] = useState<string[]>([]);
  const [catSearchText, setCatSearchText] = useState('');
  const [formShopeePrice, setFormShopeePrice] = useState('');
  const [formGeneralPrice, setFormGeneralPrice] = useState('');
  const [formMinOrder, setFormMinOrder] = useState('0');
  const [formDescription, setFormDescription] = useState('');
  const [formCover, setFormCover] = useState('');
  const [formShopeeId, setFormShopeeId] = useState('');
  const [formWebsiteId, setFormWebsiteId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Category Form State
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');

  // Validation Shake States
  const [shakeFields, setShakeFields] = useState<Record<string, boolean>>({});
  const triggerShake = (fieldKey: string) => {
    setShakeFields(prev => ({ ...prev, [fieldKey]: true }));
    setTimeout(() => {
      setShakeFields(prev => ({ ...prev, [fieldKey]: false }));
    }, 500);
  };

  // Import / Export states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<'upload' | 'validation'>('upload');
  const [pendingImportRows, setPendingImportRows] = useState<any[]>([]);
  const [unrecognizedCategories, setUnrecognizedCategories] = useState<{ name: string; status: 'pending' | 'accepted' | 'skipped'; resolvedId?: string }[]>([]);
  const [colIndicesState, setColIndicesState] = useState<{ [key: string]: number }>({});
  const [pendingNewBooksCount, setPendingNewBooksCount] = useState(0);
  const [allowNewBooks, setAllowNewBooks] = useState(true);
  const [chosenColors, setChosenColors] = useState<{ [key: string]: string }>({});
  const [activeColorPickerCat, setActiveColorPickerCat] = useState<string | null>(null);

  // Migration states for Base64 covers to Cloud Storage
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [showStorageInstructions, setShowStorageInstructions] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  const getTodayMaxSeq = (booksList: Book[]): number => {
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                    (now.getMonth() + 1).toString().padStart(2, '0') + 
                    now.getDate().toString().padStart(2, '0');
    const prefix = `KB-${dateStr}-`;
    let maxSeq = 0;
    for (const b of booksList) {
      if (b.productId && b.productId.startsWith(prefix)) {
        const parts = b.productId.split('-');
        if (parts.length === 3) {
          const numPart = parseInt(parts[2], 10);
          if (!isNaN(numPart) && numPart > maxSeq) {
            maxSeq = numPart;
          }
        }
      }
    }
    return maxSeq;
  };

  const resetImportState = () => {
    setIsImportModalOpen(false);
    setImportStatus(null);
    setSelectedFile(null);
    setImportStep('upload');
    setPendingImportRows([]);
    setUnrecognizedCategories([]);
    setPendingNewBooksCount(0);
    setAllowNewBooks(true);
    setChosenColors({});
    setActiveColorPickerCat(null);
  };

  const headerMap: { [key: string]: string } = {
    'nama buku': 'bookName',
    'nama': 'bookName',
    'book name': 'bookName',
    'title': 'bookName',
    'pengarang': 'author',
    'author': 'author',
    'penulis': 'author',
    'kategori': 'category',
    'category': 'category',
    'shopee price': 'shopeePrice',
    'shopee price (twd)': 'shopeePrice',
    'harga shopee': 'shopeePrice',
    'general price': 'generalPrice',
    'general price (twd)': 'generalPrice',
    'harga umum': 'generalPrice',
    'safety stock': 'minOrder',
    'minimum safety stock': 'minOrder',
    'stok aman': 'minOrder',
    'min order': 'minOrder',
    'product id': 'productId',
    'id produk': 'productId',
    'product_id': 'productId',
    'link cover': 'cover',
    'cover': 'cover',
    'foto cover': 'cover',
    'link foto cover': 'cover',
    'shopee sku': 'shopeeId',
    'shopee id': 'shopeeId',
    'sku shopee': 'shopeeId',
    'website sku': 'websiteId',
    'website id': 'websiteId',
    'sku website': 'websiteId',
    'deskripsi': 'description',
    'description': 'description',
    'catatan': 'description'
  };

  function parseCSV(text: string): string[][] {
    const firstLine = text.split('\n')[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';

    const lines: string[][] = [];
    let row: string[] = [];
    let inQuotes = false;
    let currentVal = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentVal += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(currentVal.trim());
        currentVal = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
        row.push(currentVal.trim());
        lines.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    if (currentVal || row.length > 0) {
      row.push(currentVal.trim());
      lines.push(row);
    }
    return lines;
  }

  const downloadCSVTemplate = () => {
    const headers = [
      'Product ID',
      'Nama Buku',
      'Pengarang',
      'Kategori',
      'Shopee Price (TWD)',
      'General Price (TWD)',
      'Safety Stock',
      'Link Cover (Optional)',
      'Shopee SKU (Optional)',
      'Website SKU (Optional)',
      'Deskripsi (Optional)'
    ].join(',');
    const row1 = [
      '',
      'Laskar Pelangi',
      'Andrea Hirata',
      'Novel',
      '300',
      '350',
      '10',
      'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80',
      'SHP-LASKAR',
      'WEB-LASKAR',
      'Buku novel populer Indonesia'
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');

    const row2 = [
      '',
      'The Psychology Of Money',
      'Morgan Housel',
      'Self - Improvement, Finance, Business & Management, Islamic',
      '350',
      '400',
      '5',
      'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80',
      'SHP-PSYCH',
      'WEB-PSYCH',
      'Buku tentang psikologi keuangan'
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    
    const csvContent = "\uFEFF" + headers + "\n" + row1 + "\n" + row2;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "template_impor_buku.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportCatalogToCSV = () => {
    const headers = [
      'Product ID',
      'Nama Buku',
      'Pengarang',
      'Kategori',
      'Shopee Price (TWD)',
      'General Price (TWD)',
      'Safety Stock',
      'Link Cover',
      'Shopee SKU',
      'Website SKU',
      'Deskripsi'
    ].join(',');

    const rows = filteredBooks.map(book => {
      return [
        book.productId || '',
        book.bookName,
        book.author || '',
        getBookCategoryObjects(book).map(c => c.name).join(', '),
        (book.shopeePrice / 100).toString(),
        book.generalPrice ? (book.generalPrice / 100).toString() : '',
        book.minOrder?.toString() || '0',
        book.cover || '',
        book.shopeeId || '',
        book.websiteId || '',
        book.description || ''
      ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ekspor_katalog_buku.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const PRESET_COLORS = [
    '#6366f1', // Indigo (existing default)
    '#0ea5e9', // Sky/Light Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red/Rose
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f97316', // Orange
  ];

  const getDefaultColorForName = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PRESET_COLORS.length;
    return PRESET_COLORS[index];
  };

  const handleAcceptUnrecognizedCategory = async (catName: string, customColor?: string) => {
    try {
      const titleCaseCategory = toTitleCase(catName);
      const catId = doc(collection(db, 'categories')).id;
      const colorToUse = customColor || getDefaultColorForName(catName);
      await setDoc(doc(db, 'categories', catId), {
        id: catId,
        name: titleCaseCategory,
        color: colorToUse,
        createdAt: Timestamp.now()
      });
      
      // Update unrecognizedCategories state
      setUnrecognizedCategories(prev => 
        prev.map(cat => 
          (cat.name || '').toLowerCase() === (catName || '').toLowerCase() 
            ? { ...cat, status: 'accepted', resolvedId: catId } 
            : cat
        )
      );
      showToast(`Kategori "${titleCaseCategory}" berhasil didaftarkan`);
    } catch (error: any) {
      console.error("Error registering category", error);
      alert(`Gagal mendaftarkan kategori: ${error.message || error}`);
    }
  };

  const handleSkipUnrecognizedCategory = (catName: string) => {
    setUnrecognizedCategories(prev => 
      prev.map(cat => 
        (cat.name || '').toLowerCase() === (catName || '').toLowerCase() 
          ? { ...cat, status: 'skipped' } 
          : cat
      )
    );
  };

  const executeDirectImport = async (
    rows: any[], 
    colIndices: { [key: string]: number }, 
    resolutions: { name: string; status: 'pending' | 'accepted' | 'skipped'; resolvedId?: string }[],
    shouldAllowNewBooks: boolean = true
  ) => {
    setImporting(true);
    setImportStatus(null);
    let successCount = 0;
    let failCount = 0;
    
    let currentMaxSeq = getTodayMaxSeq(books);
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                    (now.getMonth() + 1).toString().padStart(2, '0') + 
                    now.getDate().toString().padStart(2, '0');
    const prefix = `KB-${dateStr}-`;

    try {
      for (const row of rows) {
        // Skip empty rows
        if (row.length === 0 || (row.length === 1 && !row[0])) continue;

        // Extract fields
        const rawName = colIndices['bookName'] !== undefined ? row[colIndices['bookName']] : '';
        const productIdRaw = colIndices['productId'] !== undefined && row[colIndices['productId']] ? row[colIndices['productId']].trim() : '';
        
        let existingBook: Book | undefined;
        if (productIdRaw) {
          existingBook = books.find(b => b.productId === productIdRaw);
        }

        if (!existingBook && !shouldAllowNewBooks) {
           // Skip if it's a new book and we're not allowing them
           continue;
        }

        if (!existingBook && (!rawName || !rawName.trim())) {
          failCount++;
          continue;
        }

        const bookName = existingBook ? existingBook.bookName : toTitleCase(rawName.trim());
        const author = colIndices['author'] !== undefined && row[colIndices['author']] ? row[colIndices['author']].trim() : (existingBook ? existingBook.author : '');
        const categoryRaw = colIndices['category'] !== undefined && row[colIndices['category']] ? row[colIndices['category']].trim() : '';
        
        let resolvedCategoryIds: string[] = existingBook ? (Array.isArray(existingBook.category) ? existingBook.category : [existingBook.category]) : [];
        
        if (categoryRaw) {
          // Split multi-category by comma
          const categoryNames = categoryRaw.split(',').map(s => s.trim()).filter(Boolean);
          resolvedCategoryIds = [];

          for (const catName of (categoryNames.length === 0 ? ['Lainnya'] : categoryNames)) {
            const titleCased = toTitleCase(catName);
            
            // Check in current categories
            const foundCat = categories.find(cat => cat && cat.name && typeof cat.name === 'string' && cat.name.toLowerCase() === titleCased.toLowerCase());
            if (foundCat) {
              resolvedCategoryIds.push(foundCat.id);
            } else {
              // Check if it is in resolutions
              const resolved = resolutions.find(r => r && (r.name || '').toLowerCase() === titleCased.toLowerCase());
              if (resolved) {
                if (resolved.status === 'accepted' && resolved.resolvedId) {
                  resolvedCategoryIds.push(resolved.resolvedId);
                }
                // skipped is simply ignored (not added to this book's categories list)
              } else {
                // fallback auto-creation
                const catId = doc(collection(db, 'categories')).id;
                await setDoc(doc(db, 'categories', catId), {
                  id: catId,
                  name: titleCased,
                  color: getDefaultColorForName(titleCased),
                  createdAt: Timestamp.now()
                });
                resolvedCategoryIds.push(catId);
              }
            }
          }
        } else if (!existingBook) {
           // New book without category provided, default to Lainnya
           const titleCased = 'Lainnya';
           const foundCat = categories.find(cat => cat && cat.name && typeof cat.name === 'string' && cat.name.toLowerCase() === titleCased.toLowerCase());
           if (foundCat) {
             resolvedCategoryIds.push(foundCat.id);
           }
        }

        const shopeePriceRaw = colIndices['shopeePrice'] !== undefined ? row[colIndices['shopeePrice']] : undefined;
        const generalPriceRaw = colIndices['generalPrice'] !== undefined ? row[colIndices['generalPrice']] : undefined;
        const minOrderRaw = colIndices['minOrder'] !== undefined ? row[colIndices['minOrder']] : undefined;

        const cleanShopee = shopeePriceRaw ? shopeePriceRaw.replace(/[^\d.]/g, '') : null;
        const cleanGeneral = generalPriceRaw ? generalPriceRaw.replace(/[^\d.]/g, '') : null;
        const cleanMinOrder = minOrderRaw ? minOrderRaw.replace(/[^\d.]/g, '') : null;

        const shopeeCents = cleanShopee !== null ? Math.round((parseFloat(cleanShopee) || 0) * 100) : (existingBook ? existingBook.shopeePrice : 0);
        const generalCents = cleanGeneral !== null ? Math.round((parseFloat(cleanGeneral) || 0) * 100) : (existingBook ? existingBook.generalPrice : 0);
        const minO = cleanMinOrder !== null ? parseInt(cleanMinOrder) || 0 : (existingBook ? existingBook.minOrder : 0);

        const cover = colIndices['cover'] !== undefined && row[colIndices['cover']] 
          ? row[colIndices['cover']].trim() 
          : (existingBook ? existingBook.cover : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80');
        const shopeeId = colIndices['shopeeId'] !== undefined && row[colIndices['shopeeId']] ? row[colIndices['shopeeId']].trim() : (existingBook ? existingBook.shopeeId : '');
        const websiteId = colIndices['websiteId'] !== undefined && row[colIndices['websiteId']] ? row[colIndices['websiteId']].trim() : (existingBook ? existingBook.websiteId : '');
        const description = colIndices['description'] !== undefined && row[colIndices['description']] ? row[colIndices['description']].trim() : (existingBook ? existingBook.description : '');

        if (existingBook) {
          // Update
          const bookRef = doc(db, 'catalog', existingBook.id);
          const updatePayload: Partial<Book> = {
            author,
            category: resolvedCategoryIds,
            shopeePrice: shopeeCents,
            generalPrice: generalCents,
            minOrder: minO,
            description,
            cover,
            shopeeId,
            websiteId,
            updatedAt: Timestamp.now()
          };
          if (rawName && rawName.trim()) {
             const newName = toTitleCase(rawName.trim());
             updatePayload.bookName = newName;
             updatePayload.bookNameLower = newName.toLowerCase();
             if (existingBook && existingBook.bookName !== newName) {
               await propagateBookNameChange(existingBook.id, newName);
             }
          }
          await updateDoc(bookRef, updatePayload);
          successCount++;
        } else {
          // Insert new
          const bookId = doc(collection(db, 'catalog')).id;
          const bookRef = doc(db, 'catalog', bookId);
          
          let newProductId = productIdRaw;
          if (!newProductId) {
            currentMaxSeq++;
            newProductId = `${prefix}${currentMaxSeq.toString().padStart(4, '0')}`;
          }

          const bookPayload = {
            id: bookId,
            productId: newProductId,
            bookName,
            bookNameLower: bookName.toLowerCase(),
            author,
            category: resolvedCategoryIds,
            shopeePrice: shopeeCents,
            generalPrice: generalCents,
            minOrder: minO,
            description,
            cover,
            shopeeId,
            websiteId,
            isActive: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
          };

          await setDoc(bookRef, bookPayload);

          // Save default state to inventory
          const invRef = doc(db, 'inventory', bookId);
          await setDoc(invRef, {
            bookId,
            initialStock: 0,
            totalPurchased: 0,
            totalDispatched: 0,
            endingStock: 0,
            readyStock: 0,
            shippedStock: 0,
            inTransitStock: 0,
            ordersPlaced: 0,
            ordersShipped: 0,
            movingAverageCost: 0,
            totalInventoryValue: 0,
            stockStatus: 'sold_out',
            lastUpdated: Timestamp.now()
          });

          successCount++;
        }
      }

      setImportStatus({
        success: true,
        message: `Berhasil memproses ${successCount} baris.${failCount > 0 ? ` Gagal memproses ${failCount} baris.` : ''}`
      });
      setSelectedFile(null);
      setPendingImportRows([]);
      setUnrecognizedCategories([]);
      setImportStep('upload');
    } catch (err) {
      console.error("Error during CSV import", err);
      setImportStatus({ success: false, message: 'Gagal memproses file CSV: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setImporting(false);
    }
  };

  const handleCSVImportExecution = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportStatus(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          setImportStatus({ success: false, message: 'File kosong atau gagal dibaca.' });
          setImporting(false);
          return;
        }

        const lines = parseCSV(text);
        if (lines.length < 2) {
          setImportStatus({ success: false, message: 'File CSV minimal harus memiliki 1 baris header dan 1 baris data.' });
          setImporting(false);
          return;
        }

        const rawHeaders = lines[0];
        const rows = lines.slice(1);

        // Map column headers to field names
        const colIndices: { [key: string]: number } = {};
        rawHeaders.forEach((h, idx) => {
          const cleanH = h.trim().toLowerCase();
          // Find if there is a match in headerMap
          for (const key of Object.keys(headerMap)) {
            if (cleanH === key || cleanH.includes(key)) {
              colIndices[headerMap[key]] = idx;
              break;
            }
          }
        });

        // Fallback or validation: must have at least bookName
        if (colIndices['bookName'] === undefined) {
          setImportStatus({ 
            success: false, 
            message: 'Kolom "Nama Buku" tidak ditemukan. Pastikan nama kolom di file CSV memuat kata "Nama Buku" atau "Book Name".' 
          });
          setImporting(false);
          return;
        }

        // Gather unique categories from the CSV file
        const uniqueCatsInFile = new Set<string>();
        rows.forEach(row => {
          if (row.length === 0 || (row.length === 1 && !row[0])) return;
          const rawName = colIndices['bookName'] !== undefined ? row[colIndices['bookName']] : '';
          if (!rawName || !rawName.trim()) return;

          const categoryRaw = colIndices['category'] !== undefined && row[colIndices['category']] ? row[colIndices['category']].trim() : 'Lainnya';
          const categoryNames = categoryRaw.split(',').map(s => s.trim()).filter(Boolean);
          if (categoryNames.length === 0) {
            uniqueCatsInFile.add(toTitleCase('Lainnya'));
          } else {
            categoryNames.forEach(catName => {
              uniqueCatsInFile.add(toTitleCase(catName));
            });
          }
        });

        // Check against registered categories
        const unrecognizedList: { name: string; status: 'pending' | 'accepted' | 'skipped'; resolvedId?: string }[] = [];
        uniqueCatsInFile.forEach(catName => {
          const exists = categories.some(c => c && c.name && typeof c.name === 'string' && c.name.toLowerCase() === catName.toLowerCase());
          if (!exists) {
            unrecognizedList.push({ name: catName, status: 'pending' });
          }
        });

        // Check for new books
        let newBooksCount = 0;
        rows.forEach(row => {
          if (row.length === 0 || (row.length === 1 && !row[0])) return;
          const productIdRaw = colIndices['productId'] !== undefined && row[colIndices['productId']] ? row[colIndices['productId']].trim() : '';
          const rawName = colIndices['bookName'] !== undefined ? row[colIndices['bookName']] : '';
          
          if (productIdRaw) {
            const exists = books.some(b => b.productId === productIdRaw);
            if (!exists && rawName && rawName.trim()) {
               newBooksCount++;
            }
          } else if (rawName && rawName.trim()) {
            newBooksCount++;
          }
        });

        if (unrecognizedList.length > 0 || newBooksCount > 0) {
          setPendingImportRows(rows);
          setColIndicesState(colIndices);
          setUnrecognizedCategories(unrecognizedList);
          setPendingNewBooksCount(newBooksCount);
          setAllowNewBooks(true);
          setImportStep('validation');
          setImporting(false);
        } else {
          await executeDirectImport(rows, colIndices, [], true);
        }
      } catch (err) {
        console.error("Error during CSV import parse phase", err);
        setImportStatus({ success: false, message: 'Gagal memproses file CSV: ' + (err instanceof Error ? err.message : String(err)) });
        setImporting(false);
      }
    };

    reader.readAsText(selectedFile);
  };

  // Load Realtime Data
  useEffect(() => {
    const unsubBooks = onSnapshot(collection(db, 'catalog'), (snap) => {
      const bList: Book[] = [];
      snap.forEach((d) => bList.push({ id: d.id, ...d.data() } as Book));
      setBooks(bList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'catalog');
    });

    const unsubCats = onSnapshot(collection(db, 'categories'), (snap) => {
      const cList: Category[] = [];
      snap.forEach((d) => {
        if (!d.id.startsWith('config_')) {
          cList.push({ id: d.id, ...d.data() } as Category);
        }
      });
      setCategories(cList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });

    return () => {
      unsubBooks();
      unsubCats();
    };
  }, []);

  const handleSort = (field: 'shopeePrice' | 'generalPrice' | 'minOrder' | 'productId' | 'bookName' | 'author' | 'category' | 'isActive') => {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortField(null);
      setSortDirection(null);
    }
  };

  const handleToggleActive = async (book: Book) => {
    try {
      const newStatus = !book.isActive;
      await updateDoc(doc(db, 'catalog', book.id), {
        isActive: newStatus,
        updatedAt: Timestamp.now()
      });
      showToast(newStatus ? 'Buku diaktifkan' : 'Buku dinonaktifkan');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'catalog');
    }
  };

  // Filter books based on search query and category filter
  const unfilteredAndSortedBooks = books.filter(b => {
    if (!b) return false;
    
    const bookCats = getBookCategoryObjects(b);

    // Check category filter
    if (selectedCategoryFilter) {
      const hasMatch = bookCats.some(cat => 
        cat && (
          cat.id === selectedCategoryFilter || 
          (cat.name && typeof cat.name === 'string' && cat.name.toLowerCase() === selectedCategoryFilter.toLowerCase())
        )
      );
      if (!hasMatch) {
        return false;
      }
    }

    // Check search query
    const s = searchQuery.toLowerCase();
    const matchesCategorySearch = bookCats.some(cat => cat && cat.name && typeof cat.name === 'string' && cat.name.toLowerCase().includes(s));
    return (
      (b.bookNameLower && b.bookNameLower.includes(s)) ||
      (b.author && b.author.toLowerCase().includes(s)) ||
      matchesCategorySearch
    );
  });

  const filteredBooks = [...unfilteredAndSortedBooks].sort((a, b) => {
    if (!sortField || !sortDirection) {
      const aVal = a.productId || '';
      const bVal = b.productId || '';
      if (aVal === bVal) return 0;
      return aVal < bVal ? 1 : -1; // Z-A (descending)
    }
    let aVal = 0;
    let bVal = 0;

    if (sortField === 'shopeePrice') {
      aVal = a.shopeePrice || 0;
      bVal = b.shopeePrice || 0;
    } else if (sortField === 'generalPrice') {
      aVal = a.generalPrice || 0;
      bVal = b.generalPrice || 0;
    } else if (sortField === 'minOrder') {
      aVal = a.minOrder || 0;
      bVal = b.minOrder || 0;
    } else if (sortField === 'productId') {
      aVal = (a.productId || '').toLowerCase();
      bVal = (b.productId || '').toLowerCase();
    } else if (sortField === 'bookName') {
      aVal = (a.bookName || '').toLowerCase();
      bVal = (b.bookName || '').toLowerCase();
    } else if (sortField === 'author') {
      aVal = (a.author || '').toLowerCase();
      bVal = (b.author || '').toLowerCase();
    } else if (sortField === 'category') {
      const aCat = Array.isArray(a.category) ? a.category.join(',') : (a.category || '');
      const bCat = Array.isArray(b.category) ? b.category.join(',') : (b.category || '');
      aVal = aCat.toLowerCase();
      bVal = bCat.toLowerCase();
    } else if (sortField === 'isActive') {
      aVal = a.isActive ? 1 : 0;
      bVal = b.isActive ? 1 : 0;
    }

    if (aVal === bVal) return 0;
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const booksPerPage = 50;
  const totalCatalogPages = Math.ceil(filteredBooks.length / booksPerPage) || 1;
  const currentCatalogPage = Math.min(Math.max(1, catalogPage), totalCatalogPages);
  const paginatedBooks = filteredBooks.slice((currentCatalogPage - 1) * booksPerPage, currentCatalogPage * booksPerPage);

  // Helper to compress image using Canvas to keep size tiny (<25KB)
  const compressImage = (file: File, maxWidth = 300, maxHeight = 400, quality = 0.7): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions keeping aspect ratio
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Helper to read file/blob as Base64 Data URL
  const fileToBase64 = (fileOrBlob: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(fileOrBlob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  // Handle uploading cover image to Firebase Storage with automatic local Base64 fallback
  const handleCoverUpload = async (file: File) => {
    setIsUploadingCover(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      // 1. Compress the image first to keep it lightweight (extremely important for both Storage and Firestore Base64 fallback)
      const compressedBlob = await compressImage(file, 300, 400, 0.75);
      
      // Safety check: ensure compressed image stays well under ~200KB to prevent Firestore bloat (Max 150KB Blob size)
      const maxBlobSizeBytes = 150 * 1024; // 150 KB
      if (compressedBlob.size > maxBlobSizeBytes) {
        throw new Error(`Ukuran gambar hasil kompresi (${Math.round(compressedBlob.size / 1024)}KB) melebihi batas 150KB untuk kestabilan database. Silakan gunakan gambar lain.`);
      }
      
      try {
        // 2. Try uploading to Firebase Storage
        const extension = 'jpg'; // Since we compressed to image/jpeg
        const storagePath = `catalog/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
        const storageRef = ref(storage, storagePath);
        
        const uploadTask = uploadBytesResumable(storageRef, compressedBlob);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setUploadProgress(progress);
            },
            (error) => {
              reject(error);
            },
            () => {
              resolve();
            }
          );
        });

        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setFormCover(downloadURL);
      } catch (storageErr: any) {
        console.warn("Firebase Storage failed or permission denied, falling back to Base64 in Firestore:", storageErr);
        
        // Convert to Base64
        const base64String = await fileToBase64(compressedBlob);
        setFormCover(base64String);
        
        // Show a helpful info warning about the Storage permission
        const isUnauthorized = storageErr?.code === 'storage/unauthorized';
        if (isUnauthorized) {
          setUploadError("Penyimpanan Cloud Storage terkunci. Gambar berhasil dikompresi dan disimpan langsung di database!");
          // Clear notification after 6 seconds
          setTimeout(() => setUploadError(null), 6000);
        } else {
          setUploadError(`Storage gagal: ${storageErr?.message || "Menggunakan fallback database"}`);
          setTimeout(() => setUploadError(null), 6000);
        }
      }
    } catch (err) {
      console.error("Error processing cover image:", err);
      setUploadError(err instanceof Error ? err.message : "Gagal mengolah gambar");
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Migrate existing Base64 book covers to Cloud Storage (One-time migration script)
  const migrateBase64ToStorage = async () => {
    setIsMigrating(true);
    setMigrationStatus("Memulai migrasi...");
    
    let successCount = 0;
    let failCount = 0;
    let lastError = "";

    try {
      for (const book of books) {
        if (book.cover && book.cover.startsWith('data:image/')) {
          try {
            // 1. Fetch base64 data and convert to Blob
            const response = await fetch(book.cover);
            const blob = await response.blob();
            
            // 2. Upload to Cloud Storage
            const extension = 'jpg';
            const storagePath = `catalog/${book.id}_migrated.${extension}`;
            const storageRef = ref(storage, storagePath);
            
            const uploadTask = await uploadBytesResumable(storageRef, blob);
            const downloadURL = await getDownloadURL(uploadTask.ref);
            
            // 3. Update Firestore Document
            const bookRef = doc(db, 'catalog', book.id);
            await updateDoc(bookRef, { cover: downloadURL });
            successCount++;
          } catch (err: any) {
            console.error(`Gagal migrasi buku ${book.bookName || book.id}:`, err);
            failCount++;
            lastError = err?.message || err?.code || "Upload failed";
          }
        }
      }

      if (successCount > 0 && failCount === 0) {
        setMigrationStatus(`Sukses memigrasikan ${successCount} gambar ke Cloud Storage!`);
      } else if (successCount > 0 && failCount > 0) {
        setMigrationStatus(`Migrasi sebagian selesai: ${successCount} sukses, ${failCount} gagal. Error terakhir: ${lastError}`);
      } else if (failCount > 0) {
        setMigrationStatus(`Migrasi gagal: ${failCount} gambar gagal diunggah. Error: ${lastError}. Pastikan Storage Security Rules sudah diperbarui di Firebase Console.`);
      } else {
        setMigrationStatus("Tidak ada gambar Base64 yang perlu dimigrasikan.");
      }
    } catch (globalErr: any) {
      console.error("Global migration error:", globalErr);
      setMigrationStatus(`Migrasi dibatalkan karena error: ${globalErr.message}`);
    } finally {
      setIsMigrating(false);
      // Clear status after 10 seconds
      setTimeout(() => setMigrationStatus(null), 10000);
    }
  };

  // Handle Book Form Submit
  const handleBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let hasValidationError = false;
    if (!formName.trim()) {
      triggerShake('formName');
      hasValidationError = true;
    }
    if (formCategories.length === 0) {
      triggerShake('formCategories');
      hasValidationError = true;
    }
    if (!formShopeePrice.trim()) {
      triggerShake('formShopeePrice');
      hasValidationError = true;
    }
    if (!formGeneralPrice.trim()) {
      triggerShake('formGeneralPrice');
      hasValidationError = true;
    }

    if (hasValidationError) {
      return;
    }

    try {
      // Auto-capitalize name using Title Case
      const capitalizedName = smartTitleCase(formName.trim());

      const cleanShopee = formShopeePrice.replace(/,/g, '');
      const cleanGeneral = formGeneralPrice.replace(/,/g, '');
      const cleanMinOrder = formMinOrder.replace(/,/g, '').trim() || '0';

      const shopeeCents = Math.round(parseFloat(cleanShopee) * 100) || 0;
      const generalCents = Math.round(parseFloat(cleanGeneral) * 100) || 0;
      const minO = parseInt(cleanMinOrder) || 0;

      const bookPayload = {
        bookName: capitalizedName,
        bookNameLower: capitalizedName.toLowerCase(),
        author: smartTitleCase(formAuthor.trim()),
        category: formCategories, // array of stable category IDs
        shopeePrice: shopeeCents,
        generalPrice: generalCents,
        minOrder: minO,
        description: formDescription.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
        cover: formCover.trim() || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80',
        shopeeId: formShopeeId.trim() || '',
        websiteId: formWebsiteId.trim() || '',
        isActive: formIsActive,
        updatedAt: Timestamp.now()
      };

      if (editingBook) {
        // Edit existing book
        const bookRef = doc(db, 'catalog', editingBook.id);
        await updateDoc(bookRef, bookPayload);
        if (editingBook.bookName !== capitalizedName) {
          await propagateBookNameChange(editingBook.id, capitalizedName);
        }
      } else {
        // Create new book
        const bookId = doc(collection(db, 'catalog')).id;
        const bookRef = doc(db, 'catalog', bookId);
        
        let currentMaxSeq = getTodayMaxSeq(books);
        const now = new Date();
        const dateStr = now.getFullYear().toString().slice(-2) + 
                        (now.getMonth() + 1).toString().padStart(2, '0') + 
                        now.getDate().toString().padStart(2, '0');
        const prefix = `KB-${dateStr}-`;
        const newProductId = `${prefix}${(currentMaxSeq + 1).toString().padStart(4, '0')}`;

        await setDoc(bookRef, {
          ...bookPayload,
          id: bookId,
          productId: newProductId,
          createdAt: Timestamp.now()
        });

        // Initialize inventory for new book
        const invRef = doc(db, 'inventory', bookId);
        await setDoc(invRef, {
          bookId,
          initialStock: 0,
          totalPurchased: 0,
          totalDispatched: 0,
          endingStock: 0,
          readyStock: 0,
          shippedStock: 0,
          inTransitStock: 0,
          ordersPlaced: 0,
          ordersShipped: 0,
          movingAverageCost: 0,
          totalInventoryValue: 0,
          stockStatus: 'sold_out',
          lastUpdated: Timestamp.now()
        });
      }

      setIsBookModalOpen(false);
      resetBookForm();
    } catch (err) {
      console.error("Error saving book", err);
    }
  };

  const openBookModal = (book?: Book) => {
    if (book) {
      setEditingBook(book);
      setFormName(book.bookName);
      setFormAuthor(book.author);
      // Map legacy category string or modern array of IDs to stable category IDs
      const rawCategories = getBookCategories(book.category);
      const mappedIds = rawCategories.map(item => {
        const found = resolveCategory(item);
        return found ? found.id : item; // fallback to name string if it doesn't match any category
      });
      setFormCategories(mappedIds);
      setFormCategory('');
      setCatSearchText('');
      setFormShopeePrice(book.shopeePrice ? formatInputNumber(Math.round(book.shopeePrice / 100).toString()) : '');
      setFormGeneralPrice(book.generalPrice ? formatInputNumber(Math.round(book.generalPrice / 100).toString()) : '');
      setFormMinOrder(book.minOrder !== undefined && book.minOrder !== null ? formatInputNumber(book.minOrder.toString()) : '0');
      setFormDescription(book.description);
      setFormCover(book.cover);
      setFormShopeeId(book.shopeeId || '');
      setFormWebsiteId(book.websiteId || '');
      setFormIsActive(book.isActive);
    } else {
      resetBookForm();
    }
    setIsBookModalOpen(true);
  };

  const resetBookForm = () => {
    setEditingBook(null);
    setFormName('');
    setFormAuthor('');
    setFormCategory('');
    setFormCategories([]);
    setCatSearchText('');
    setFormShopeePrice('');
    setFormGeneralPrice('');
    setFormMinOrder('0');
    setFormDescription('');
    setFormCover('');
    setFormShopeeId('');
    setFormWebsiteId('');
    setFormIsActive(true);
  };

  const deleteBook = async (bookId: string) => {
    try {
      // Laporan Bulanan menelusuri koleksi catalog. Menghapus buku yang masih punya
      // mutasi persediaan akan MENYEMBUNYIKAN nilainya dari laporan sementara buku
      // besar tetap memperhitungkannya - itu yang dulu menimbulkan selisih
      // rekonsiliasi NT$142,00 yang butuh skrip pemulihan untuk dibereskan.
      const ledgerSnap = await getDocs(
        query(collection(db, 'inventoryLedger'), where('bookId', '==', bookId))
      );
      if (!ledgerSnap.empty) {
        const invSnap = await getDoc(doc(db, 'inventory', bookId));
        const stock = invSnap.exists() ? (invSnap.data().endingStock || 0) : 0;
        window.alert(
          `Buku ini tidak bisa dihapus karena masih punya ${ledgerSnap.size} riwayat mutasi persediaan` +
          (stock ? ` dan stok ${stock} unit` : '') + `.\n\n` +
          `Menghapusnya akan membuat nilainya hilang dari Laporan Bulanan padahal buku besar tetap ` +
          `mencatatnya, sehingga muncul selisih rekonsiliasi.\n\n` +
          `Nonaktifkan saja lewat tombol Edit (hilangkan centang "Aktif") - buku akan hilang dari ` +
          `pencarian penjualan tapi riwayat dan nilainya tetap utuh.`
        );
        return;
      }

      if (!window.confirm("Apakah anda yakin ingin menghapus buku ini?") && !isOwner) return;

      await deleteDoc(doc(db, 'catalog', bookId));
      await deleteDoc(doc(db, 'inventory', bookId));
    } catch (err) {
      console.error("Error deleting book", err);
      window.alert('Gagal menghapus buku. Coba lagi.');
    }
  };

  // Category Handlers
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      triggerShake('newCatName');
      return;
    }

    try {
      const catId = doc(collection(db, 'categories')).id;
      await setDoc(doc(db, 'categories', catId), {
        id: catId,
        name: newCatName,
        color: newCatColor,
        createdAt: Timestamp.now()
      });
      setNewCatName('');
    } catch (err) {
      console.error("Error adding category", err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (err) {
      console.error("Error deleting category", err);
    }
  };

  const getPopupStyle = () => {
    const popupWidth = 240;
    const popupHeight = 320;
    
    let left = previewCoords.x + 15;
    let top = previewCoords.y - 120; // center/raise slightly relative to cursor
    
    if (typeof window !== 'undefined') {
      if (left + popupWidth > window.innerWidth) {
        left = previewCoords.x - popupWidth - 15; // flip to left side
      }
      if (left < 10) left = 10;
      
      if (top + popupHeight > window.innerHeight) {
        top = window.innerHeight - popupHeight - 15;
      }
      if (top < 10) top = 10;
    }
    
    return {
      position: 'fixed' as const,
      left: `${left}px`,
      top: `${top}px`,
      width: `${popupWidth}px`,
      height: `${popupHeight}px`,
      zIndex: 9999,
      pointerEvents: 'none' as const,
    };
  };

  const incompleteBooks = books.filter(b => 
    !b.shopeeId || b.shopeeId.trim() === '' || 
    !b.websiteId || b.websiteId.trim() === ''
  );

  return (
    <div className="space-y-6" style={{ fontFamily: 'var(--font-text)' }}>
      {/* Top Banner Control */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-500" /> Katalog Buku
          </h2>
        </div>

        {isStaffValue && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              id="open-category-drawer"
              onClick={() => setIsCategoryOpen(true)}
              className="flex items-center justify-center p-2.5 border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition select-none"
              title="Kategori"
            >
              <Tag className="h-4 w-4" />
            </button>
            <button
              id="open-category-ai-button"
              onClick={() => setIsCategoryAiOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition select-none font-semibold text-xs shadow-2xs"
              title="AI Asisten Kategori Buku"
            >
              <Sparkles className="h-4 w-4 text-indigo-500 animate-pulse" />
              <span>AI Kategori</span>
            </button>
            {hasPerm('catalog.export') && (
              <button
                id="export-catalog-button"
                onClick={exportCatalogToCSV}
                className="flex items-center justify-center p-2.5 border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition select-none"
                title="Ekspor (CSV)"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            {hasPerm('catalog.import') && (
              <button
                id="import-catalog-button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center justify-center p-2.5 border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition select-none"
                title="Impor (CSV)"
              >
                <Upload className="h-4 w-4" />
              </button>
            )}

            {/* Metadata Completeness Notification Icon */}
            <div className="relative">
              <button
                onClick={() => setIsMetadataPanelOpen(!isMetadataPanelOpen)}
                className="relative flex items-center justify-center p-2.5 border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-lg transition select-none"
                title="Pemberitahuan Kelengkapan Metadata"
              >
                <AlertCircle className={`h-4 w-4 ${incompleteBooks.length > 0 ? 'text-amber-500 font-bold' : ''}`} />
                {incompleteBooks.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-bold text-[10px] w-5 h-5 flex items-center justify-center rounded-full shadow-xs">
                    {incompleteBooks.length}
                  </span>
                )}
              </button>

              {isMetadataPanelOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsMetadataPanelOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl z-50 p-4 max-h-96 overflow-y-auto">
                    <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-100 border-b border-neutral-150 dark:border-neutral-800 pb-2 mb-3 flex items-center justify-between">
                      <span>Metadata Belum Lengkap</span>
                      <span className="text-xs bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-bold px-2 py-0.5 rounded-full">
                        {incompleteBooks.length} Buku
                      </span>
                    </h4>
                    {incompleteBooks.length === 0 ? (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 py-4 text-center">
                        Semua buku memiliki metadata lengkap! ✨
                      </p>
                    ) : (
                      <div className="space-y-3 divide-y divide-neutral-100 dark:divide-neutral-800">
                        {incompleteBooks.map((book, idx) => {
                          const isShopeeMissing = !book.shopeeId || book.shopeeId.trim() === '';
                          const isWebsiteMissing = !book.websiteId || book.websiteId.trim() === '';

                          const currentShopeeVal = pendingMetadataUpdates[book.id]?.shopeeId !== undefined 
                            ? pendingMetadataUpdates[book.id].shopeeId 
                            : '';
                          const currentWebsiteVal = pendingMetadataUpdates[book.id]?.websiteId !== undefined 
                            ? pendingMetadataUpdates[book.id].websiteId 
                            : '';

                          return (
                            <div key={book.id} className={`${idx > 0 ? 'pt-3' : ''} space-y-2 text-left`}>
                              <p className="text-xs font-bold text-neutral-700 dark:text-neutral-350 truncate">
                                {book.bookName}
                              </p>
                              <div className="flex items-end gap-2">
                                <div className="flex-1 space-y-1.5 text-left">
                                  {isShopeeMissing && (
                                    <div>
                                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 text-left">
                                        Shopee ID
                                      </label>
                                      <input
                                        type="text"
                                        value={currentShopeeVal}
                                        onChange={(e) => setPendingMetadataUpdates(prev => ({
                                          ...prev,
                                          [book.id]: {
                                            ...prev[book.id],
                                            shopeeId: e.target.value
                                          }
                                        }))}
                                        placeholder="Masukkan Shopee ID"
                                        className="w-full text-xs px-2.5 py-1.5 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-100 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                      />
                                    </div>
                                  )}
                                  {isWebsiteMissing && (
                                    <div>
                                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 text-left">
                                        Website ID
                                      </label>
                                      <input
                                        type="text"
                                        value={currentWebsiteVal}
                                        onChange={(e) => setPendingMetadataUpdates(prev => ({
                                          ...prev,
                                          [book.id]: {
                                            ...prev[book.id],
                                            websiteId: e.target.value
                                          }
                                        }))}
                                        placeholder="Masukkan Website ID"
                                        className="w-full text-xs px-2.5 py-1.5 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-100 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                      />
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0 pb-0.5">
                                  <button
                                    onClick={async () => {
                                      try {
                                        const updates: any = {};
                                        if (isShopeeMissing) {
                                          const shopeeVal = (pendingMetadataUpdates[book.id]?.shopeeId || '').trim();
                                          if (shopeeVal !== '') {
                                            updates.shopeeId = shopeeVal;
                                          }
                                        }
                                        if (isWebsiteMissing) {
                                          const websiteVal = (pendingMetadataUpdates[book.id]?.websiteId || '').trim();
                                          if (websiteVal !== '') {
                                            updates.websiteId = websiteVal;
                                          }
                                        }

                                        if (Object.keys(updates).length > 0) {
                                          await updateDoc(doc(db, 'catalog', book.id), {
                                            ...updates,
                                            updatedAt: Timestamp.now()
                                          });
                                          // Clear updates state for this book
                                          setPendingMetadataUpdates(prev => {
                                            const copy = { ...prev };
                                            delete copy[book.id];
                                            return copy;
                                          });
                                        }
                                      } catch (err) {
                                        handleFirestoreError(err, OperationType.WRITE, 'catalog');
                                      }
                                    }}
                                    className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md transition shadow-xs"
                                    title="Simpan"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setPendingMetadataUpdates(prev => {
                                        const copy = { ...prev };
                                        delete copy[book.id];
                                        return copy;
                                      });
                                    }}
                                    className="p-1.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded-md transition"
                                    title="Batal"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              id="add-book-button"
              onClick={() => openBookModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition select-none"
            >
              <Plus className="h-4 w-4" />
              Tambah Buku
            </button>
          </div>
        )}
      </div>

      {/* Base64 Fallback Mode Terbatas Notification and Migration Panel */}
      {(() => {
        const base64CoversCount = books.filter(b => b.cover && b.cover.startsWith('data:image/')).length;
        if (base64CoversCount === 0) return null;
        
        const storageRulesText = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}`;

        const handleCopyRules = () => {
          navigator.clipboard.writeText(storageRulesText);
          setCopiedRules(true);
          setTimeout(() => setCopiedRules(false), 3000);
        };

        return (
          <div className="bg-amber-50/95 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-6 shadow-md flex flex-col gap-5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-xl shrink-0 mt-0.5">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 flex-wrap">
                    <span>Mode Terbatas Aktif</span>
                    <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 text-[11px] px-2.5 py-0.5 rounded-full font-bold border border-amber-200/50 dark:border-amber-900/40">
                      Terdeteksi {base64CoversCount} Cover Buku di Database
                    </span>
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5 leading-relaxed max-w-3xl">
                    Sistem saat ini tidak dapat mengunggah gambar baru ke Firebase Cloud Storage karena mengembalikan error <code className="font-numeric bg-amber-100/50 dark:bg-amber-950/40 px-1 py-0.5 rounded text-[11px]">storage/unauthorized</code> (Akses Ditolak). 
                    Sebagai solusi aman sementara, gambar dikompresi menjadi sangat kecil (&lt;25KB) dan disimpan langsung di database. 
                    Harap buka <strong>Firebase Console</strong> Anda untuk mengaktifkan Cloud Storage dan memperbarui Security Rules.
                  </p>
                  
                  {migrationStatus && (
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 mt-3 bg-indigo-50/80 dark:bg-neutral-900/60 px-4 py-2 rounded-xl border border-indigo-100 dark:border-neutral-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                      ℹ️ {migrationStatus}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0">
                <button
                  onClick={() => setShowStorageInstructions(!showStorageInstructions)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-lg border border-amber-300 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-950/30 transition select-none w-full sm:w-auto"
                >
                  {showStorageInstructions ? (
                    <>
                      Tutup Panduan
                      <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Cara Perbaiki / Rules
                      <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>

                {isStaffValue && (
                  <button
                    onClick={migrateBase64ToStorage}
                    disabled={isMigrating}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition select-none w-full sm:w-auto ${
                      isMigrating 
                        ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed' 
                        : 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm hover:shadow-md'
                    }`}
                  >
                    {isMigrating ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-amber-800 dark:text-amber-200" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Memigrasikan...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Coba Migrasi Lagi
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Step by Step Guide Container with Rules */}
            {showStorageInstructions && (
              <div className="mt-2 pt-5 border-t border-amber-200/60 dark:border-amber-900/40 grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
                <div className="lg:col-span-7 flex flex-col gap-4">
                  <h5 className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                    Panduan Perbaikan Langkah Demi Langkah:
                  </h5>
                  
                  <div className="flex gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-[10px] font-bold text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">1</span>
                    <div>
                      <h6 className="text-xs font-bold text-amber-900 dark:text-amber-200">Aktifkan Cloud Storage</h6>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                        Masuk ke <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-amber-900 dark:hover:text-white inline-flex items-center gap-0.5">Firebase Console <ExternalLink className="h-3 w-3 inline" /></a>, pilih proyek Anda, masuk ke menu <strong>Storage</strong> di sidebar kiri, lalu klik <strong>Get Started / Mulai</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-[10px] font-bold text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">2</span>
                    <div>
                      <h6 className="text-xs font-bold text-amber-900 dark:text-amber-200">Tempel Security Rules Baru</h6>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                        Buka tab <strong>Rules (Aturan)</strong> di dalam panel Storage, lalu ganti seluruh aturan bawaan dengan kode di sebelah kanan ini. Klik <strong>Publish</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-[10px] font-bold text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">3</span>
                    <div>
                      <h6 className="text-xs font-bold text-amber-900 dark:text-amber-200">Catatan Paket Berlangganan (Billing)</h6>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                        Jika Anda masih mendapatkan error, periksa apakah proyek Firebase Anda membutuhkan peningkatan ke paket <strong>Blaze (Pay-as-you-go)</strong>. Beberapa wilayah Firebase mengharuskan Blaze untuk membuat bucket Cloud Storage baru.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-[10px] font-bold text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">4</span>
                    <div>
                      <h6 className="text-xs font-bold text-amber-900 dark:text-amber-200">Klik "Coba Migrasi Lagi"</h6>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                        Setelah melakukan langkah 1 &amp; 2, klik tombol <strong>"Coba Migrasi Lagi"</strong> di kanan atas untuk memindahkan semua cover buku dari database ke Cloud Storage. Gambar yang berhasil dimigrasi akan terhapus dari dokumen Firestore secara otomatis untuk menghemat ruang penyimpanan.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                      Storage Security Rules:
                    </span>
                    <button
                      onClick={handleCopyRules}
                      className="text-[11px] font-semibold text-amber-850 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/80 px-2.5 py-1 rounded-md transition flex items-center gap-1 shrink-0"
                    >
                      {copiedRules ? (
                        <>
                          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                          Tersalin!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Salin Rules
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="relative">
                    <pre className="text-[10px] font-numeric p-4 bg-white/90 dark:bg-neutral-950/90 text-neutral-800 dark:text-neutral-300 rounded-xl border border-amber-200/60 dark:border-amber-900/40 overflow-x-auto leading-relaxed shadow-inner">
                      {storageRulesText}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Filter and View Toggles */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-neutral-50 dark:bg-[#121212] p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              id="book-search-input"
              type="text"
              placeholder="Cari buku atau pengarang..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div className="relative w-full sm:w-56">
            <select
              id="book-category-filter"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-neutral-200 cursor-pointer appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1rem 1rem',
                backgroundRepeat: 'no-repeat',
                paddingRight: '2rem'
              }}
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <span className="text-xs text-neutral-500 dark:text-neutral-400 mr-2">
            Total Buku: <strong>{filteredBooks.length}</strong>
          </span>
          <button
            id="toggle-view-grid"
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg border transition ${
              viewMode === 'grid' 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-indigo-400' 
                : 'bg-white border-neutral-300 text-neutral-600 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-400'
            }`}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
          <button
            id="toggle-view-table"
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg border transition ${
              viewMode === 'table' 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-indigo-400' 
                : 'bg-white border-neutral-300 text-neutral-600 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-400'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {paginatedBooks.map((book) => {
            return (
              <div 
                key={book.id}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden hover:shadow-md transition duration-200 flex flex-col group"
                style={{ fontFamily: 'var(--font-text)' }}
              >
                <div 
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
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex flex-col items-center justify-center p-3 text-white select-none">
                      <BookOpen className="h-8 w-8 mb-1.5 opacity-80" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-center line-clamp-2">
                        {book.bookName}
                      </span>
                    </div>
                  )}
                  {!book.isActive && (
                    <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center">
                      <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Nonaktif
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <TruncatedTooltip content={book.bookName} className="font-semibold text-neutral-800 dark:text-neutral-100 text-[11px] line-clamp-2 leading-tight">
                      {book.bookName}
                    </TruncatedTooltip>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      oleh {book.author || 'Anonim'}
                    </p>
                    {(() => {
                      const bookCats = getBookCategoryObjects(book);
                      if (bookCats.length === 0) return null;
                      const firstCat = bookCats[0];
                      const remainingCount = bookCats.length - 1;
                      const fullNamesList = bookCats.map(c => c.name).join(', ');

                      return (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span 
                            style={{ 
                              backgroundColor: firstCat.color ? `${firstCat.color}15` : undefined, 
                              color: firstCat.color || undefined, 
                              borderColor: firstCat.color ? `${firstCat.color}30` : undefined 
                            }}
                            className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${!firstCat.color ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-transparent' : ''}`}
                            title={firstCat.name}
                          >
                            {firstCat.name}
                          </span>
                          {remainingCount > 0 && (
                            <span 
                              className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 text-[8px] font-bold px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 cursor-help relative group"
                              title={fullNamesList}
                            >
                              +{remainingCount}
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-neutral-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap normal-case font-normal">
                                {fullNamesList}
                              </span>
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-1">
                    <div className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-350">
                      <span className="text-neutral-400">Shopee:</span>
                      <span className="font-semibold font-numeric text-neutral-700 dark:text-neutral-300">
                        {formatNTD(book.shopeePrice)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-neutral-600 dark:text-neutral-350">
                      <span className="text-neutral-400">Umum:</span>
                      <span className="font-semibold font-numeric text-neutral-700 dark:text-neutral-300">
                        {formatNTD(book.generalPrice)}
                      </span>
                    </div>

                    {isStaffValue && (
                      <div className="flex items-center gap-1.5 pt-1.5 justify-end">
                        <button
                          onClick={() => openBookModal(book)}
                          className="p-1 text-neutral-500 hover:text-indigo-600 dark:text-neutral-400 dark:hover:text-indigo-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded transition"
                          title="Edit Buku"
                        >
                          <Edit className="h-3 w-3" />
                        </button>
                        {isOwner && (
                          <button
                            onClick={() => deleteBook(book.id)}
                            className="p-1 text-neutral-500 hover:text-rose-600 dark:text-neutral-400 dark:hover:text-rose-450 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded transition"
                            title="Hapus Buku"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table / Mobile Stacked View */
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
          {/* Mobile Stacked Cards (<768px) */}
          <div className="block md:hidden divide-y divide-neutral-100 dark:divide-neutral-800">
            {paginatedBooks.map((book) => (
              <div key={`m-${book.id}`} className="p-4 flex gap-3 items-start bg-white dark:bg-neutral-900">
                <div 
                  className="h-16 w-16 bg-neutral-100 dark:bg-neutral-950 rounded-lg overflow-hidden shrink-0 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center cursor-pointer"
                  onClick={() => {
                    if (!brokenImages[book.id] && book.cover) {
                      setPreviewImage({ url: book.cover, title: book.bookName });
                    }
                  }}
                >
                  {!brokenImages[book.id] && book.cover ? (
                    <img referrerPolicy="no-referrer" src={book.cover} alt="" className="w-full h-full object-contain" onError={() => setBrokenImages(prev => ({ ...prev, [book.id]: true }))} />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                      {book.bookName ? book.bookName.substring(0, 2).toUpperCase() : 'B'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-numbers text-[11px] text-neutral-400 font-semibold">{book.productId || '-'}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${book.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'}`}>
                      {book.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <h4 className="font-bold text-neutral-900 dark:text-neutral-100 text-xs mt-0.5 truncate">{book.bookName}</h4>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{book.author || 'Anonim'}</p>
                  
                  <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-neutral-400 block">Harga Mkt</span>
                      <span className="font-bold font-numbers text-indigo-600 dark:text-indigo-400">{formatNTD(book.shopeePrice)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block">Harga Umum</span>
                      <span className="font-semibold font-numbers text-neutral-700 dark:text-neutral-300">{formatNTD(book.generalPrice)}</span>
                    </div>
                    {isStaffValue && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => openBookModal(book)} className="p-1.5 text-neutral-600 hover:text-indigo-600 dark:text-neutral-400 rounded-md">
                          <Edit className="h-4 w-4" />
                        </button>
                        {isOwner && (
                          <button onClick={() => deleteBook(book.id)} className="p-1.5 text-neutral-600 hover:text-rose-600 dark:text-neutral-400 rounded-md">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (>=768px) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase border-b border-neutral-200 dark:border-neutral-800">
                  <th className="p-4 text-center">Cover</th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('productId')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Product ID</span>
                      {sortField === 'productId' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('bookName')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Nama Buku</span>
                      {sortField === 'bookName' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('author')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Pengarang</span>
                      {sortField === 'author' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Kategori</span>
                      {sortField === 'category' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('shopeePrice')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Harga Marketplace (NT$)</span>
                      {sortField === 'shopeePrice' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('generalPrice')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Harga Umum (NT$)</span>
                      {sortField === 'generalPrice' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('minOrder')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Stok Minimum</span>
                      {sortField === 'minOrder' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 text-center w-24 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900 transition select-none"
                    onClick={() => handleSort('isActive')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Status</span>
                      {sortField === 'isActive' && (
                        <span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                  {isStaffValue && <th className="p-4 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
                {paginatedBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 text-neutral-700 dark:text-neutral-300">
                    <td className="p-4 text-center">
                      <div 
                        onMouseEnter={(e) => handleThumbnailMouseEnter(e, book)}
                        onMouseMove={handleThumbnailMouseMove}
                        onMouseLeave={handleThumbnailMouseLeave}
                        className="h-20 w-20 bg-neutral-100 dark:bg-neutral-950 rounded overflow-hidden mx-auto flex items-center justify-center border border-neutral-250 dark:border-neutral-800 hover:scale-110 hover:border-indigo-500 hover:shadow-sm transition-all duration-150 cursor-zoom-in"
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
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold select-none pointer-events-none" title={book.bookName}>
                            {book.bookName ? book.bookName.substring(0, 2).toUpperCase() : 'B'}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center font-mono text-xs text-neutral-500">{book.productId || '-'}</td>
                    <td className="p-4 text-center font-semibold max-w-[200px] truncate"><TruncatedTooltip content={book.bookName}>{book.bookName}</TruncatedTooltip></td>
                    <td className="p-4 text-center text-neutral-500 dark:text-neutral-400">{book.author}</td>
                    <td className="p-4 text-center">
                      {(() => {
                        const bookCats = getBookCategoryObjects(book);
                        if (bookCats.length === 0) {
                          return <span className="text-neutral-400 select-none">-</span>;
                        }
                        const firstCat = bookCats[0];
                        const remainingCount = bookCats.length - 1;
                        const fullNamesList = bookCats.map(c => c.name).join(', ');

                        return (
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <span 
                              style={{ 
                                backgroundColor: firstCat.color ? `${firstCat.color}15` : undefined, 
                                color: firstCat.color || undefined, 
                                borderColor: firstCat.color ? `${firstCat.color}30` : undefined 
                              }}
                              className={`px-2 py-0.5 rounded text-xs select-none inline-block font-semibold border ${!firstCat.color ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-transparent' : ''}`}
                              title={firstCat.name}
                            >
                              {firstCat.name}
                            </span>
                            {remainingCount > 0 && (
                              <span 
                                className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-1.5 py-0.5 rounded text-[10px] font-bold select-none cursor-help border border-neutral-200 dark:border-neutral-700 relative group"
                                title={fullNamesList}
                              >
                                +{remainingCount}
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-neutral-900 text-white text-[10px] px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap">
                                  {fullNamesList}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 text-center font-numeric font-semibold">{formatNTD(book.shopeePrice)}</td>
                    <td className="p-4 text-center font-numeric font-semibold">{formatNTD(book.generalPrice)}</td>
                    <td className="p-4 text-center font-text">{formatNumber(book.minOrder || 0)}</td>
                    <td className="p-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(book)}
                        className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors duration-200 ease-in-out focus:outline-none shrink-0 cursor-pointer ${
                          book.isActive 
                            ? 'bg-green-500 border-green-600 dark:border-green-400' 
                            : 'bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                            book.isActive ? 'translate-x-[14px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </button>
                    </td>
                    {isStaffValue && (
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => openBookModal(book)}
                            className="p-1.5 text-neutral-500 hover:text-indigo-600 dark:text-neutral-400 dark:hover:text-indigo-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded transition"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => deleteBook(book.id)}
                              className="p-1.5 text-neutral-500 hover:text-rose-600 dark:text-neutral-400 dark:hover:text-rose-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalCatalogPages > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 pt-4 mt-6 font-text">
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
            Menampilkan <span className="font-bold text-neutral-800 dark:text-neutral-200">{((currentCatalogPage - 1) * booksPerPage) + 1}</span> - <span className="font-bold text-neutral-800 dark:text-neutral-200">{Math.min(currentCatalogPage * booksPerPage, filteredBooks.length)}</span> dari <span className="font-bold text-neutral-800 dark:text-neutral-200">{filteredBooks.length}</span> buku
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={currentCatalogPage === 1}
              onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            
            {Array.from({ length: totalCatalogPages }).map((_, i) => {
              const pageNum = i + 1;
              if (totalCatalogPages > 5 && Math.abs(pageNum - currentCatalogPage) > 1 && pageNum !== 1 && pageNum !== totalCatalogPages) {
                if (pageNum === 2 || pageNum === totalCatalogPages - 1) {
                  return <span key={pageNum} className="text-xs text-neutral-400 px-1 select-none">...</span>;
                }
                return null;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCatalogPage(pageNum)}
                  className={`h-6 w-6 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                    currentCatalogPage === pageNum
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-850'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              disabled={currentCatalogPage === totalCatalogPages}
              onClick={() => setCatalogPage((p) => Math.min(totalCatalogPages, p + 1))}
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-850 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-600 dark:text-neutral-300 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Book Add/Edit Modal */}
      {isBookModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const hasChanges = editingBook 
                ? (
                    formName.trim() !== (editingBook.bookName || '').trim() ||
                    formAuthor.trim() !== (editingBook.author || '').trim() ||
                    ([...formCategories].sort().join(',') !== [...getBookCategories(editingBook.category).map(item => {
                      const found = resolveCategory(item);
                      return found ? found.id : item;
                    })].sort().join(',')) ||
                    formCover.trim() !== (editingBook.cover || '').trim() ||
                    formDescription.trim() !== (editingBook.description || '').trim() ||
                    formShopeeId.trim() !== (editingBook.shopeeId || '').trim() ||
                    formWebsiteId.trim() !== (editingBook.websiteId || '').trim()
                  )
                : (
                    formName.trim() !== '' ||
                    formAuthor.trim() !== '' ||
                    formCategories.length > 0 ||
                    formCover.trim() !== '' ||
                    formDescription.trim() !== '' ||
                    formShopeeId.trim() !== '' ||
                    formWebsiteId.trim() !== ''
                  );

              if (hasChanges) {
                if (!window.confirm("Apakah kamu yakin ingin keluar? Perubahan belum disimpan.")) {
                  return;
                }
              }
              setIsBookModalOpen(false);
            }
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                {editingBook ? '✏️ Edit Data Buku' : '📖 Tambah Buku Baru'}
              </h3>
              <button 
                onClick={() => setIsBookModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleBookSubmit} noValidate className="flex flex-col max-h-[75vh]">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Identitas Buku Card */}
                <div className="bg-neutral-50/50 dark:bg-neutral-950/25 border border-neutral-200/60 dark:border-neutral-800/60 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800/40">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4.5 w-4.5 text-indigo-500 shrink-0" />
                      <h4 className="text-xs font-extrabold tracking-wider text-neutral-800 dark:text-neutral-200 uppercase select-none">
                        Identitas Buku
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase select-none">
                        Status
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormIsActive(!formIsActive)}
                        className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors duration-200 ease-in-out focus:outline-none shrink-0 cursor-pointer ${
                          formIsActive 
                            ? 'bg-green-500 border-green-600 dark:border-green-400' 
                            : 'bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                            formIsActive ? 'translate-x-[14px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1.5 select-none">
                        Nama Buku <span className="text-indigo-500 font-black">*</span>
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => handleTextCapitalization(e, setFormName)}
                        placeholder="Contoh: Laskar Pelangi Penerbit Bentang"
                        className={`w-full px-3.5 py-2 border rounded-xl text-sm transition-all focus:outline-none ${
                          shakeFields['formName']
                            ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                            : 'border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-white focus:ring-2 focus:ring-indigo-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1.5 select-none flex items-center justify-between">
                        <span>Pengarang / Penulis</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal normal-case">Opsional</span>
                      </label>
                      <input
                        type="text"
                        value={formAuthor}
                        onChange={(e) => handleTextCapitalization(e, setFormAuthor)}
                        placeholder="Contoh: Andrea Hirata"
                        className="w-full px-3.5 py-2 border border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-xl text-sm text-neutral-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="relative">
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1.5 select-none">
                        Kategori <span className="text-indigo-500 font-black">*</span>
                      </label>
                      <div
                        className={`w-full px-3 py-2 border rounded-xl bg-white dark:bg-neutral-950 text-sm text-neutral-800 dark:text-white flex flex-wrap gap-2 items-center min-h-[42px] focus-within:ring-2 focus-within:ring-indigo-500 transition-all focus-within:outline-none ${
                          shakeFields['formCategories']
                            ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                            : 'border-neutral-250 dark:border-neutral-700'
                        }`}
                      >
                        {formCategories.map((catIdOrName) => {
                          const catObj = resolveCategory(catIdOrName) || { id: catIdOrName, name: catIdOrName, color: '#6366f1' };
                          return (
                            <span
                              key={catIdOrName}
                              style={{
                                backgroundColor: catObj.color ? `${catObj.color}15` : undefined,
                                color: catObj.color || undefined,
                                borderColor: catObj.color ? `${catObj.color}30` : undefined,
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${
                                !catObj.color ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-transparent' : ''
                              }`}
                            >
                              <span>{catObj.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormCategories(prev => prev.filter(id => id !== catIdOrName));
                                }}
                                className="text-neutral-400 hover:text-rose-500 transition cursor-pointer p-0.5 rounded"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                        <input
                          type="text"
                          value={catSearchText}
                          onChange={(e) => {
                            setCatSearchText(e.target.value);
                            setIsCatDropdownOpen(true);
                          }}
                          onFocus={() => setIsCatDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setIsCatDropdownOpen(false), 250)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = catSearchText.trim();
                              if (trimmed) {
                                const titleCaseText = toTitleCase(trimmed);
                                const foundCat = categories.find(c => c && (c.name || '').toLowerCase() === titleCaseText.toLowerCase());
                                
                                let targetId = '';
                                if (foundCat) {
                                  targetId = foundCat.id;
                                } else {
                                  try {
                                    const catId = doc(collection(db, 'categories')).id;
                                    await setDoc(doc(db, 'categories', catId), {
                                      id: catId,
                                      name: titleCaseText,
                                      color: '#6366f1',
                                      createdAt: Timestamp.now()
                                    });
                                    targetId = catId;
                                    showToast(`Kategori baru "${titleCaseText}" dibuat`);
                                  } catch (err) {
                                    console.error("Error creating category", err);
                                    return;
                                  }
                                }
                                
                                if (!formCategories.includes(targetId)) {
                                  setFormCategories(prev => [...prev, targetId]);
                                }
                                setCatSearchText('');
                              }
                            }
                          }}
                          placeholder={formCategories.length === 0 ? "Pilih atau ketik kategori..." : "Tambah..."}
                          className="flex-1 bg-transparent border-none outline-none text-sm text-neutral-800 dark:text-white min-w-[100px] focus:ring-0 p-0"
                        />
                      </div>
                      {isCatDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {categories
                            .filter(cat => {
                              const isSelected = cat && (formCategories.includes(cat.id) || (cat.name && formCategories.includes(cat.name)));
                              const matchesSearch = cat && cat.name && typeof cat.name === 'string' && cat.name.toLowerCase().includes(catSearchText.toLowerCase());
                              return !isSelected && matchesSearch;
                            })
                            .map(cat => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  setFormCategories(prev => [...prev, cat.id]);
                                  setCatSearchText('');
                                  setIsCatDropdownOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm text-neutral-750 dark:text-neutral-300 transition flex items-center justify-between"
                              >
                                <span>{cat.name}</span>
                                <Plus className="h-3.5 w-3.5 text-neutral-400" />
                              </button>
                            ))
                          }
                          {catSearchText.trim() && !categories.some(cat => cat && cat.name && typeof cat.name === 'string' && cat.name.toLowerCase() === catSearchText.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onClick={async () => {
                                const trimmed = catSearchText.trim();
                                const titleCaseText = toTitleCase(trimmed);
                                try {
                                  const catId = doc(collection(db, 'categories')).id;
                                  await setDoc(doc(db, 'categories', catId), {
                                    id: catId,
                                    name: titleCaseText,
                                    color: '#6366f1',
                                    createdAt: Timestamp.now()
                                  });
                                  setFormCategories(prev => [...prev, catId]);
                                  setCatSearchText('');
                                  setIsCatDropdownOpen(false);
                                  showToast(`Kategori baru "${titleCaseText}" dibuat`);
                                } catch (err) {
                                  console.error("Error creating category", err);
                                }
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-xs text-indigo-600 dark:text-indigo-400 font-bold transition border-t border-neutral-100 dark:border-neutral-800"
                            >
                              + Buat Kategori Baru: "{toTitleCase(catSearchText.trim())}"
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Harga & Stok Card */}
                <div className="bg-neutral-50/50 dark:bg-neutral-950/25 border border-neutral-200/60 dark:border-neutral-800/60 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-100 dark:border-neutral-800/40">
                    <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                    <h4 className="text-xs font-extrabold tracking-wider text-neutral-800 dark:text-neutral-200 uppercase select-none">
                      Harga &amp; Stok
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1.5 select-none">
                        Harga Marketplace (NT$) <span className="text-indigo-500 font-black">*</span>
                      </label>
                      <input
                        type="text"
                        value={formShopeePrice}
                        onChange={(e) => setFormShopeePrice(formatInputNumber(e.target.value))}
                        placeholder="0"
                        className={`w-full px-3.5 py-2 border rounded-xl text-sm transition-all focus:outline-none ${
                          shakeFields['formShopeePrice']
                            ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                            : 'border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-white focus:ring-2 focus:ring-indigo-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1.5 select-none">
                        Harga Umum (NT$) <span className="text-indigo-500 font-black">*</span>
                      </label>
                      <input
                        type="text"
                        value={formGeneralPrice}
                        onChange={(e) => setFormGeneralPrice(formatInputNumber(e.target.value))}
                        placeholder="0"
                        className={`w-full px-3.5 py-2 border rounded-xl text-sm transition-all focus:outline-none ${
                          shakeFields['formGeneralPrice']
                            ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                            : 'border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-white focus:ring-2 focus:ring-indigo-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase mb-1.5 select-none">
                        Stok Minimum <span className="text-indigo-500 font-black">*</span>
                      </label>
                      <input
                        type="text"
                        value={formMinOrder}
                        onChange={(e) => setFormMinOrder(formatInputNumber(e.target.value))}
                        placeholder="0"
                        className={`w-full px-3.5 py-2 border rounded-xl text-sm transition-all focus:outline-none ${
                          shakeFields['formMinOrder']
                            ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                            : 'border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-white focus:ring-2 focus:ring-indigo-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Metadata & Deskripsi Card */}
                <div className="bg-neutral-50/50 dark:bg-neutral-950/25 border border-neutral-200/60 dark:border-neutral-800/60 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-100 dark:border-neutral-800/40">
                    <FileText className="h-4.5 w-4.5 text-purple-500 shrink-0" />
                    <h4 className="text-xs font-extrabold tracking-wider text-neutral-800 dark:text-neutral-200 uppercase select-none">
                      Metadata &amp; Deskripsi
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-750 dark:text-neutral-300 uppercase mb-1.5 select-none flex items-center justify-between">
                        <span>Shopee ID</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal normal-case">Opsional</span>
                      </label>
                      <input
                        type="text"
                        value={formShopeeId}
                        onChange={(e) => setFormShopeeId(e.target.value)}
                        placeholder="Contoh: 1926"
                        className="w-full px-3.5 py-2 border border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-xl text-sm text-neutral-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-750 dark:text-neutral-300 uppercase mb-1.5 select-none flex items-center justify-between">
                        <span>Website ID</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal normal-case">Opsional</span>
                      </label>
                      <input
                        type="text"
                        value={formWebsiteId}
                        onChange={(e) => setFormWebsiteId(e.target.value)}
                        placeholder="Contoh: 16377537288"
                        className="w-full px-3.5 py-2 border border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-xl text-sm text-neutral-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-neutral-755 dark:text-neutral-300 uppercase mb-1.5 select-none flex items-center justify-between">
                        <span>Deskripsi Buku</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal normal-case">Opsional</span>
                      </label>
                      <textarea
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Ketikan rincian deskripsi buku..."
                        rows={8}
                        className="w-full px-3.5 py-2 border border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950 rounded-xl text-sm text-neutral-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[180px] resize-y"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Cover Buku Card */}
                <div className="bg-neutral-50/50 dark:bg-neutral-950/25 border border-neutral-200/60 dark:border-neutral-800/60 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-100 dark:border-neutral-800/40">
                    <Image className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                    <h4 className="text-xs font-extrabold tracking-wider text-neutral-800 dark:text-neutral-200 uppercase select-none">
                      Cover Buku
                    </h4>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-neutral-750 dark:text-neutral-300 uppercase select-none">
                        Cover Buku (jpg, png, webp) <span className="text-indigo-500 font-black">*</span>
                      </label>
                      {formCover && formCover.startsWith('data:image/') && (
                        <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 text-[10px] px-2.5 py-0.5 rounded-full font-bold border border-amber-200/50 dark:border-amber-900/40 flex items-center gap-1 select-none">
                          ⚠️ Mode Terbatas (Base64)
                        </span>
                      )}
                    </div>
                    
                    {formCover && formCover.startsWith('data:image/') && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/30 rounded-xl p-3">
                        <strong>Info Mode Terbatas</strong>: Firebase Storage tidak merespons (unauthorized). Gambar berhasil dikompresi agar berukuran sangat kecil (&lt;25KB) dan akan disimpan langsung ke database Firestore. Ini aman untuk dokumen tunggal namun batasi penggunaan berlebih.
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                      {/* Cover Preview */}
                      <div className="relative group h-28 w-20 bg-neutral-100 dark:bg-neutral-950 rounded-xl border border-neutral-250 dark:border-neutral-800 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                        {formCover ? (
                          <>
                            <img
                              referrerPolicy="no-referrer"
                              src={formCover}
                              alt="Cover Preview"
                              className="h-full w-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80";
                              }}
                            />
                            {/* Clear / Hapus Cover Button Overlay */}
                            <div className="absolute inset-0 bg-neutral-900/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFormCover('');
                                }}
                                className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full transition-transform hover:scale-115 shadow-md active:scale-95 cursor-pointer"
                                title="Hapus Cover"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-[10px] text-white font-bold tracking-wider uppercase select-none">Hapus</span>
                            </div>
                          </>
                        ) : (
                          <BookOpen className="h-8 w-8 text-neutral-400 dark:text-neutral-600" />
                        )}
                      </div>

                      {/* Drag and drop / Upload Area */}
                      <div className="flex-1 w-full">
                        <div
                          className={`border-2 border-dashed rounded-xl p-4 text-center transition cursor-pointer hover:border-indigo-500 flex flex-col items-center justify-center min-h-[112px] ${
                            isUploadingCover 
                              ? 'border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 cursor-wait' 
                              : 'border-neutral-250 dark:border-neutral-700 bg-white dark:bg-neutral-950'
                          }`}
                          onClick={() => {
                            if (!isUploadingCover) {
                              document.getElementById('cover-file-input')?.click();
                            }
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                          }}
                          onDrop={async (e) => {
                            e.preventDefault();
                            if (isUploadingCover) return;
                            const file = e.dataTransfer.files?.[0];
                            if (file && file.type.startsWith('image/')) {
                              await handleCoverUpload(file);
                            }
                          }}
                        >
                          <Upload className={`h-6 w-6 mb-1 text-neutral-400 ${isUploadingCover ? 'animate-bounce text-indigo-500' : ''}`} />
                          {isUploadingCover ? (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Sedang mengunggah... {uploadProgress}%</p>
                              <div className="w-32 bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden mx-auto">
                                <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-0.5">
                              <p><span className="font-semibold text-indigo-600 dark:text-indigo-400">Klik untuk unggah</span> atau seret gambar ke sini</p>
                              <p className="text-[10px] text-neutral-400">Menerima PNG, JPG, WEBP</p>
                            </div>
                          )}
                          <input
                            id="cover-file-input"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              if (e.target.files && e.target.files[0]) {
                                await handleCoverUpload(e.target.files[0]);
                              }
                            }}
                          />
                        </div>
                        {uploadError && (
                          <p className="text-xs text-rose-500 font-semibold mt-1">⚠️ {uploadError}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Fixed Footer Buttons */}
              <div className="flex items-center justify-end gap-3 p-5 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-100 dark:border-neutral-800/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBookModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl text-sm font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition active:scale-98"
                >
                  Batal
                </button>
                <button
                  id="submit-book-form"
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-indigo-500/10 transition active:scale-98"
                >
                  {editingBook ? 'Simpan Perubahan' : 'Tambah Buku'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories Drawer/Modal */}
      {isCategoryOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const hasChanges = newCatName.trim() !== '';
              if (hasChanges) {
                if (!window.confirm("Apakah kamu yakin ingin keluar? Perubahan belum disimpan.")) {
                  return;
                }
              }
              setIsCategoryOpen(false);
            }
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-end z-50"
        >
          <div className="bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="p-6 border-b border-neutral-150 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                <Tag className="h-5 w-5 text-indigo-500" />
                Manajemen Kategori
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryAiOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900 transition"
                  title="Tanya AI Asisten"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Tanya AI</span>
                </button>
                <button 
                  onClick={() => setIsCategoryOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Category Form */}
            <form onSubmit={handleAddCategory} className="p-6 border-b border-neutral-150 dark:border-neutral-800 space-y-4">
              <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Tambah Kategori Baru</h4>
              <div>
                <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Nama Kategori</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Novel, Agama, Biografi"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg text-sm tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    shakeFields['newCatName']
                      ? 'border-red-500 ring-2 ring-red-500 animate-shake bg-red-50/50 dark:bg-red-950/20'
                      : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-500 uppercase font-bold mb-1">Warna Label</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="h-9 w-18 border border-neutral-300 dark:border-neutral-700 rounded-md cursor-pointer bg-transparent p-0.5"
                  />
                  <span className="text-xs font-numeric font-bold uppercase">{newCatColor}</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-neutral-800 hover:bg-neutral-750 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
              >
                Tambah Kategori
              </button>
            </form>

            {/* List */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <h4 className="text-xs font-bold text-neutral-450 uppercase tracking-wider">Kategori Terdaftar</h4>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50 dark:bg-neutral-950/40">
                    <div className="flex items-center gap-2">
                      <span 
                        style={{ backgroundColor: cat.color }}
                        className="h-3 w-3 rounded-full"
                      />
                      <span className="text-sm font-medium text-neutral-705 dark:text-neutral-300">{cat.name}</span>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1 text-neutral-400 hover:text-rose-500 transition"
                        title="Hapus Kategori"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                {categories.length === 0 && (
                  <p className="text-xs text-neutral-500 text-center py-6">Belum ada kategori terdaftar.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const hasChanges = selectedFile !== null;
              if (hasChanges) {
                if (!window.confirm("Apakah kamu yakin ingin keluar? Perubahan belum disimpan.")) {
                  return;
                }
              }
              resetImportState();
            }
          }}
          className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
        >
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                <Upload className="h-5 w-5 text-indigo-600 animate-pulse" />
                Impor Pembaruan Masal Buku
              </h3>
              <button
                onClick={resetImportState}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {importStep === 'upload' ? (
              <>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Gunakan fitur ini untuk menambah data katalog buku dan produk secara bulk dari file CSV. Bidang yang wajib adalah <strong className="text-neutral-800 dark:text-neutral-100">Nama Buku</strong>, <strong className="text-neutral-800 dark:text-neutral-100">Kategori</strong>, <strong className="text-neutral-800 dark:text-neutral-100">Harga Marketplace</strong>, dan <strong className="text-neutral-800 dark:text-neutral-100">Safety Stock</strong>.
                  </p>

                  {/* Template Download Section */}
                  <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-4 border border-indigo-100 dark:border-indigo-900/30 rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-indigo-950 dark:text-indigo-300">Format Template CSV</h4>
                      <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80 mt-0.5">Unduh template standar kolom buku.</p>
                    </div>
                    <button
                      onClick={downloadCSVTemplate}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Template CSV
                    </button>
                  </div>

                  {/* File Upload Selector */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase">Pilih File CSV</label>
                    <div 
                      className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer hover:border-indigo-500 ${
                        selectedFile ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/5' : 'border-neutral-300 dark:border-neutral-700'
                      }`}
                      onClick={() => document.getElementById('csv-file-input')?.click()}
                    >
                      <FileSpreadsheet className="h-8 w-8 text-neutral-450 mx-auto mb-2" />
                      {selectedFile ? (
                        <div className="text-sm font-medium text-neutral-850 dark:text-neutral-200">
                          {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </div>
                      ) : (
                        <div className="text-sm text-neutral-500">
                          Klik atau seret file CSV ke sini untuk memilih
                        </div>
                      )}
                      <input
                        id="csv-file-input"
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setSelectedFile(e.target.files[0]);
                            setImportStatus(null);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Status Message */}
                  {importStatus && (
                    <div className={`p-4 rounded-xl text-sm border ${
                      importStatus.success 
                        ? 'bg-emerald-50 text-emerald-850 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/30' 
                        : 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900/30'
                    }`}>
                      {importStatus.message}
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 flex justify-end gap-2">
                  <button
                    onClick={resetImportState}
                    className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-750 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm font-semibold rounded-lg transition"
                  >
                    Batal
                  </button>
                  <button
                    disabled={!selectedFile || importing}
                    onClick={handleCSVImportExecution}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-800 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-sm transition"
                  >
                    {importing ? 'Mengimpor...' : 'Mulai Impor'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                  {unrecognizedCategories.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl text-amber-800 dark:text-amber-400">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-sm">Kategori Baru</h4>
                          <p className="text-xs mt-1 leading-relaxed text-amber-800/80 dark:text-amber-400/80">
                            Terdapat kategori yang tidak ada di 'Manajemen Kategori', apakah ingin menambah?
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {unrecognizedCategories.map((cat, idx) => {
                          const currentColor = chosenColors[cat.name] || getDefaultColorForName(cat.name);
                          return (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/30"
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{cat.name}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {cat.status === 'pending' ? (
                                  <div className="relative flex items-center gap-2">
                                    {/* Color Swatch Picker */}
                                    <div className="relative flex items-center">
                                      <button
                                        type="button"
                                        onClick={() => setActiveColorPickerCat(activeColorPickerCat === cat.name ? null : cat.name)}
                                        className="h-8 w-8 rounded-full border-2 border-white dark:border-neutral-800 shadow-md transition transform hover:scale-105 cursor-pointer"
                                        style={{ backgroundColor: currentColor }}
                                        title="Pilih Warna"
                                      />
                                      {activeColorPickerCat === cat.name && (
                                        <>
                                          <div 
                                            className="fixed inset-0 z-40" 
                                            onClick={() => setActiveColorPickerCat(null)} 
                                          />
                                          <div className="absolute right-0 bottom-full mb-2 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl p-2.5 w-36">
                                            <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase mb-1.5 text-center">Pilih Warna</p>
                                            <div className="grid grid-cols-3 gap-1.5">
                                              {PRESET_COLORS.map((color) => (
                                                <button
                                                  key={color}
                                                  type="button"
                                                  onClick={() => {
                                                    setChosenColors(prev => ({ ...prev, [cat.name]: color }));
                                                    setActiveColorPickerCat(null);
                                                  }}
                                                  className={`h-6 w-6 rounded-full border border-neutral-200 dark:border-neutral-700 transition transform hover:scale-110 cursor-pointer ${currentColor === color ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''}`}
                                                  style={{ backgroundColor: color }}
                                                />
                                              ))}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    {/* Plus Button (Daftarkan) */}
                                    <button
                                      onClick={() => handleAcceptUnrecognizedCategory(cat.name, currentColor)}
                                      className="flex items-center justify-center h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition cursor-pointer"
                                      title="Daftarkan"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>

                                    {/* Skip Button (Abaikan) */}
                                    <button
                                      onClick={() => handleSkipUnrecognizedCategory(cat.name)}
                                      className="flex items-center justify-center h-8 w-8 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition cursor-pointer"
                                      title="Abaikan"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : cat.status === 'accepted' ? (
                                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                                    <Check className="h-3.5 w-3.5" />
                                    Didaftarkan
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1 rounded-full border border-rose-100 dark:border-rose-900/30">
                                    <X className="h-3.5 w-3.5" />
                                    Diabaikan
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {pendingNewBooksCount > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-3.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl text-blue-800 dark:text-blue-400">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-sm">Buku Baru Ditemukan</h4>
                          <p className="text-xs mt-1 leading-relaxed text-blue-800/80 dark:text-blue-400/80">
                            Terdapat {pendingNewBooksCount} baris buku yang tidak memiliki Product ID atau Product ID-nya belum ada di sistem.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Tambahkan ke Katalog Buku?</span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Jika dicentang, buku akan dibuatkan Product ID baru. Jika tidak, akan diabaikan.</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={allowNewBooks}
                            onChange={(e) => setAllowNewBooks(e.target.checked)}
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 flex justify-between items-center">
                  <span className="text-xs text-neutral-500">
                    {unrecognizedCategories.filter(c => c.status !== 'pending').length} dari {unrecognizedCategories.length} kategori diselesaikan
                  </span>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={resetImportState}
                      className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-750 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-sm font-semibold rounded-lg transition"
                    >
                      Batal
                    </button>
                    <button
                      disabled={importing || !unrecognizedCategories.every(c => c.status !== 'pending')}
                      onClick={() => executeDirectImport(pendingImportRows, colIndicesState, unrecognizedCategories)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-800 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-sm transition cursor-pointer"
                    >
                      {importing ? 'Mengimpor...' : 'Selesaikan Impor'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Cover Hover Preview */}
      <AnimatePresence>
        {showPreview && hoveredBook && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={getPopupStyle()}
            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl p-1.5 overflow-hidden flex flex-col pointer-events-none"
          >
            <div className="w-full h-full bg-neutral-50 dark:bg-neutral-950 rounded-lg overflow-hidden flex items-center justify-center relative">
              {!brokenImages[hoveredBook.id] && hoveredBook.cover ? (
                <img
                  referrerPolicy="no-referrer"
                  src={hoveredBook.cover}
                  alt={hoveredBook.bookName}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex flex-col items-center justify-center p-4 text-white select-none">
                  <BookOpen className="h-16 w-16 mb-2 opacity-80" />
                  <span className="text-xs font-bold uppercase tracking-wider text-center line-clamp-3 px-2">
                    {hoveredBook.bookName}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-neutral-900 dark:bg-neutral-850 text-white rounded-xl shadow-xl border border-neutral-850 dark:border-neutral-800"
          >
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold tracking-wide">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <ImagePreviewModal 
        isOpen={!!previewImage} 
        onClose={() => setPreviewImage(null)} 
        imageUrl={previewImage?.url || ''} 
        title={previewImage?.title} 
      />

      <CategoryAiModal
        isOpen={isCategoryAiOpen}
        onClose={() => setIsCategoryAiOpen(false)}
        categories={categories}
      />
    </div>
  );
};
