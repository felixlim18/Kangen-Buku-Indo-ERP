# Purchase Order Mobile Redesign Plan

> **Document Version:** 1.0.0  
> **Status:** Planning Phase (Ready for Review & Approval)  
> **Target Scope:** Mobile UX (`< 768px`), Purchase Order Cards, Hybrid Drawer Architecture, Modal Stacking Engine, Performance & Touch Ergonomics.

---

## 1. Project Objective

The **Purchase Orders Tab** is one of the core transactional hubs in the Kangen Buku Indo ERP application, handling hundreds of procurement transactions across international suppliers, multi-currency conversions (IDR, NTD, USD), barcode receiving, goods receipt logs, and financial journal entries.

Following the successful architecture and patterns established during the **Sales Order Mobile Redesign**, the objective of this project is to transform the Purchase Orders Mobile Tab into a **fast, intuitive, native-feeling mobile experience** for warehouse staff and business owners on mobile devices (`< 768px`).

### Key Goals:
1. **Modern Mobile-First UX:** Replace squeezed desktop layouts with intentional, thumb-friendly mobile patterns.
2. **Glanceability & Information Hierarchy:** Enable operators to read PO Number, Platform/Supplier, Status, Order/Tracking Number, Qty progress, and Total Amount in under 2 seconds.
3. **100% WCAG 2.2 AA Touch Target Compliance:** All interactive elements have a minimum 44×44px touch hitbox; secondary actions organized in a 48px row Action Sheet.
4. **Instant, Lag-Free Modal & Drawer Interaction:** Eliminate opening lag, component re-render freezing, and dual scrollbar traps using `vaul` drawers and memoized components.
5. **Strict Modal Stack Architecture:** Standardize portal mounting, background scrolling locks, backdrop event capture, and multi-tier z-index stacking to completely eliminate overlay leaks.
6. **Zero Desktop Regressions:** Keep the desktop spreadsheet table (`hidden md:flex`, `.hidden md:block`) and business transaction logic 100% intact.

---

## 2. Current Implementation Analysis & Problem Identification

### 2.1 Header & Masthead Section
* **Current State:** The top masthead (`Package` icon, "Purchase Orders", PO count) is hidden on mobile (`hidden md:flex`). Mobile users rely solely on a small header portal icon and a floating action button (FAB).
* **UX Problems:**
  - Lack of clear page context and active filter indicators on mobile.
  - Secondary management tools (Platform configuration, Verifikasi Pengiriman, Import CSV/Excel, Scan Terima Barang) are buried in a separate generic menu.

### 2.2 Summary & Status Pipeline Section
* **Current State:** The desktop summary card and a 5-item status chip carousel (`.kbi-sostat flex overflow-x-auto`) are rendered directly on mobile.
* **UX Problems:**
  - Squeezes excessive vertical space (~300px), pushing the actual order cards below the initial viewport fold.
  - Horizontal chip overflow is clunky and lacks clear visual tactile feedback.

### 2.3 Search & Filter Controls
* **Current State:** A full-width search input paired with a "Filter" button that expands an inline container (`isFilterDrawerOpen`) inside the page.
* **UX Problems:**
  - Expanding the filter container pushes the entire order list down abruptly.
  - Date filtering is cumbersome on mobile touch screens without quick-select preset chips.
  - Search input lacks a 1-tap instant clear (`X`) button.

### 2.4 Purchase Order Mobile Cards (`.kbi-ocards`)
* **Current State:** Inline mapped article elements with desktop-like typography and crowded button clusters.
* **UX & Technical Problems:**
  - **Dangerous Accidental Edit Trigger:** Tapping anywhere on the card card body directly triggers `isNewPoOpen` in edit mode (`setEditingPoId(po.id); setIsNewPoOpen(true)`). Users attempting to inspect progress or scroll often accidentally trigger the full edit form.
  - **Fat-Finger Risk in Action Buttons:** The card footer packs 3–5 tiny icons (`34x30px`) closely together (`Eye`, `Pencil`, `Revert`, `Delete`, `Receive`), causing frequent mis-taps.
  - **Native Browser `alert()` Blocking:** Copying order numbers or tracking numbers triggers synchronous `alert('Nomor Order berhasil disalin!')` dialogs, freezing the JavaScript thread and degrading mobile feel.
  - **Hidden / Confusing Item Expansion:** Tapping the status pill toggles `expandedPoId`, but there is no visual affordance that the status pill is an expansion toggle.

### 2.5 Detail Inspection & Form Modals
* **Current State:** Inspecting PO details (`handleViewPO`) opens the desktop modal `isNewPoOpen` in view-only mode (`w-[94%] max-w-5xl max-h-[90vh]`).
* **UX & Technical Problems:**
  - **Dual Scrollbar Traps:** The modal outer frame and inner form/table both scroll vertically, causing scroll hijacking on iOS Safari and Android Chrome.
  - **Modal Stacking & Z-Index Inversion:** Modals are mounted in-place using `getModalOverlayClass` with inconsistent z-indexes (`z-50`, `z-55`, `z-[60]`). Nested dialogs (e.g. Delete confirm inside PO modal) suffer from backdrop trapping or pointer-event bleeding.

---

## 3. Root Cause Analysis Matrix

| Problem Area | Root Cause | Impact on User Experience |
| :--- | :--- | :--- |
| **Accidental Edit Opening** | Card container `onClick` was wired directly to `setIsNewPoOpen(true)` with edit state rather than opening a read-only detail drawer. | High frustration; users accidentally modify or lock records when trying to read or scroll. |
| **Dual Scrollbar Traps** | Desktop CSS (`max-h-[90vh]` and inner `max-h-[80vh] overflow-y-auto`) applied to mobile viewports. | Jerky, non-momentum scrolling; users get trapped inside nested cards. |
| **Fat-Finger Touch Errors** | Desktop icon groups (`34×30px`) placed side-by-side with `< 4px` gap without thumb margins. | Frequent accidental clicks on destructive or irreversible status revert actions. |
| **UI Freezing on Copy** | Use of `window.alert()` instead of inline state transitions (e.g., `copiedKey` toast/checkmark). | Browser displays modal alert popups that halt user interactions. |
| **Backdrop Bleed & Trapping** | Modals rendered inside the component tree without uniform `createPortal(..., document.body)` and standardized z-index layers. | Clicks pass through to background page or backdrop traps touch events after dismissal. |
| **Re-render Lag** | All 50+ mobile cards and inline handlers re-evaluate on every keypress in the search bar. | Keyboard typing stutter, scroll jitter, and laggy animations. |

---

## 4. Proposed Redesign Architecture

The redesigned mobile experience follows the **Mobile-First Product Architecture** proven in the Sales Order redesign:

```
+-------------------------------------------------------------+
| [🔍 Cari No. PO, Supplier, Resi...]          [ ⚙️ Filter ]  |
+-------------------------------------------------------------+
| ( Semua 86 ) ( Menunggu 14 ) ( Sebagian 8 ) ( Diterima 64 ) |
+-------------------------------------------------------------+
|                                                             |
|  +-------------------------------------------------------+  |
|  || #PO-2608001 [📋]  [ Shopee ID ]         [ • MENUNGGU ]|  |
|  || Gramedia Official Store                               |  |
|  || Order: 240829ABC123 [📋] · Resi: SPXID098765 [📋]    |  |
|  || Beli: 2026/08/29 · Progress: 0/12 Pcs (0%)            |  |
|  || Qty: 12 Pcs                     Total: NT$ 3,450      |  |
|  || [      📦 Terima Barang      ]         [  ••• More ]  |  |
|  +-------------------------------------------------------+  |
|                                                             |
|  +-------------------------------------------------------+  |
|  || #PO-2608002 [📋]  [ Tokopedia ]         [ • SEBAGIAN ]|  |
|  || Mizan Official                                        |  |
|  || Beli: 2026/08/25 · Progress: 5/10 Pcs (50%)           |  |
|  || [======================                      ] 50%    |  |
|  || Qty: 10 Pcs                     Total: Rp 1.250.000   |  |
|  || [    ✓ Lanjut Terima         ]         [  ••• More ]  |  |
|  +-------------------------------------------------------+  |
|                                                             |
+-------------------------------------------------------------+
```

### 4.1 Core UX & Usability Principles
1. **Read-First Tap Interaction:** Tapping anywhere on the card opens the **`PurchaseDetailDrawer`** (read-only inspection). Edit mode is deliberately moved to an explicit action inside the detail drawer or Action Sheet.
2. **Contextual Primary Lifecycle CTA:**
   - Status **Menunggu (Pending):** Primary CTA is **"Terima Barang"** (`handleOpenReceiveGoods`).
   - Status **Sebagian (Partial):** Primary CTA is **"Lanjut Terima"** (`handleOpenReceiveGoods`).
   - Status **Diterima (Received) / Cancel:** Primary CTA is **"Lihat Detail"** (`handleViewPO`).
3. **Action Sheet Architecture (`...`):** Secondary actions (`Edit Pembelian`, `Lihat Rincian`, `Revert Status`, `Tutup PO / Refund`, `Hapus PO`, `Salin Info`) are consolidated in a smooth bottom sheet with 48px row heights.
4. **1-Tap Clipboard Copy with Checkmark Feedback:** Copying PO number, supplier order number, or tracking number replaces the icon with a green checkmark (`Check`) for 1.5s with zero alert popups.
5. **Horizontal Status Pill Carousel:** 1-tap filtering across `Semua`, `Menunggu`, `Sebagian`, `Diterima`, and `Cancel` with live order count badges and pending NT$ sum counters.

---

## 5. Context-Driven Modal Pattern Matrix

Every popup, modal, sheet, and overlay in the Purchase Orders module is assigned to its optimal mobile UI pattern based on information density, user task complexity, thumb accessibility, and transaction safety:

| # | Feature / Component | Recommended Pattern | Architectural Justification & Context |
| :--- | :--- | :--- | :--- |
| **1** | **PO Detail**<br>`PurchaseDetailDrawer` | **Drawer**<br>*(Swipeable Bottom Sheet)* | Rapid inspection of procurement items, platform details, receiving logs, and journal breakdown. Users can swipe down to dismiss or pull up to `94dvh`. |
| **2** | **Card Actions Menu**<br>`PurchaseOrderMobileCard` (`...`) | **Bottom Sheet**<br>*(Action Sheet)* | Native mobile ActionSheet pattern. Places 5–7 secondary actions (`Edit`, `Detail`, `Revert`, `Tutup PO`, `Hapus`) in comfortable lower thumb reach (48px targets). |
| **3** | **Mobile Filter Drawer**<br>`PurchaseOrderMobileFilter` | **Bottom Sheet**<br>*(Filter Drawer)* | Slides up from bottom to configure date ranges (presets: Hari Ini, 7 Hari, Bulan Ini, Custom) and platform filters without layout shifting. |
| **4** | **Top Header More Actions**<br>`isActionsOpen` | **Bottom Sheet**<br>*(Action Sheet)* | Quick access to high-level modules: Platform Management, Verifikasi Pengiriman, Import CSV/Excel, and Bulk Scan Receiving. |
| **5** | **Tambah / Edit PO**<br>`isNewPoOpen`<br>`PurchaseOrderModal` | **Full Screen Modal**<br>*(Page Sheet)* | High-density multi-field procurement form (Platform select, date, items table, catalog search autocomplete, exchange rate, discount). Prevents keyboard squishing with `100dvh` and safe area clearance. |
| **6** | **Terima Barang (Goods Receipt)**<br>`isReceiveOpen`<br>`selectedPo` | **Full Screen Modal**<br>*(Page Sheet)* | Multi-item warehouse receiving verification: entering received quantities per line, damaged items, notes, and forwarder codes. Full screen allows comfortable number keypad inputs. |
| **7** | **Bulk Receive Scanner**<br>`isBulkReceiveScanOpen` | **Full Screen Modal**<br>*(Camera Overlay)* | Live camera scanner viewfinder (`Html5Qrcode`) + scanned PO queue list + quick "Terima Semua" batch processing. Requires full viewport isolation. |
| **8** | **Tutup PO / Refund Modal**<br>`isClosePoModalOpen`<br>`closingPo` | **Dialog / Sheet**<br>*(Centered Dialog)* | Financial reconciliation workflow (choosing refund amount in IDR/NTD vs write-off). Centered modal with explicit confirmation buttons. |
| **9** | **Platform Management**<br>`isPlatformOpen` | **Full Screen Modal**<br>*(Page Sheet)* | Managing purchasing platforms (Shopee, Tokopedia, Gramedia, etc.), currency options (IDR/NTD/USD), and active status. |
| **10** | **CSV / Excel Import**<br>`isCsvUploadOpen` | **Bottom Sheet / Modal** | File dropzone, format template instructions, and validation preview. |
| **11** | **Confirmation Dialogs**<br>• `deleteConfirmPoId`<br>• `revertConfirmState`<br>• `deletePlatformState` | **Dialog**<br>*(Centered Alert)* | **Safety-Critical Inventory / Financial Gates:** Non-swipeable centered modal (`max-w-[360px]`) with distinct "Batal" vs "Konfirmasi" buttons (min. 44px) to prevent accidental state mutations. |
| **12** | **Book Cover Preview**<br>`previewCoverIdx`<br>`ImagePreviewModal` | **Lightbox**<br>*(Full Screen Overlay)* | Full-screen image preview for book covers or receipt slips with pinch-to-zoom and top-right 44px dismiss button (`z-[10050]`). |

---

## 6. Strict Modal Stack Architecture & Layer Hierarchy

To guarantee that background pages become completely inert and interaction leaks are eliminated, the following layer architecture is strictly enforced:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: High-Priority Toasts & Feedback (z-[10100])         │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Nested Modals, Dialogs & Lightboxes (z-[10050])     │
│          - Confirmation Dialogs (Delete, Revert)            │
│          - Image Preview Lightbox                           │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Active Primary Modal / Drawer (z-[10000])          │
│          - PurchaseDetailDrawer                             │
│          - Full-Screen Form Sheets (New PO, Receive)         │
│          - Bottom Sheets (Action Sheet, Filter Drawer)       │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Backdrop Scrim Overlay (z-[9999])                  │
│          - Captures all backdrop clicks                      │
│          - Locks background body scroll (overflow: hidden)   │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Background Page (z-0)                              │
│          - Completely inert and pointer-events disabled      │
└─────────────────────────────────────────────────────────────┘
```

### Stacking Rules & Behavioral Guarantees:
1. **Universal Portal Mounting:** Every modal, drawer, action sheet, and confirmation dialog MUST mount via `createPortal(..., document.body)` to escape parent CSS transforms and stacking context traps.
2. **Body Scroll Locking:** Whenever any modal layer opens, `document.body.style.overflow = 'hidden'` is applied. Closing the modal cleanly restores scrolling.
3. **Gesture Isolation (`data-vaul-no-drag`):** Interactive sub-elements (scrollable book lists, inputs, copy buttons, buttons) within `vaul` drawers include `data-vaul-no-drag` to prevent accidental drag-to-dismiss while scrolling or typing.
4. **Safe-Area Inset Handling:** Sticky footers and bottom action buttons apply `pb-[calc(env(safe-area-inset-bottom,0px)+12px)]` to prevent obstruction by iOS Home Indicators or Android navigation bars.
5. **State Preservation on Nested Open:** Opening a nested confirmation dialog (Layer 4) above a Detail Drawer (Layer 3) preserves the drawer's scroll position without unmounting. Dismissing Layer 4 returns focus to Layer 3 seamlessly.

---

## 7. Component Mapping

| Existing Code / Pattern | New Component | Location | Responsibility & Scope |
| :--- | :--- | :--- | :--- |
| Old Mobile Cards (`.kbi-ocards` inline in `PurchasesTab.tsx`) | `PurchaseOrderMobileCard.tsx` | `src/components/purchases/` | • Renders touch-optimized card with color-coded status spine.<br>• Displays PO Code (1-tap copy), platform badge, order/tracking resi, item count, received progress bar, and total currency.<br>• Houses primary lifecycle CTA button (`Terima Barang`, `Lanjut Terima`, `Lihat Detail`).<br>• Triggers the `...` **More Actions Bottom Sheet** (48px touch targets) for secondary actions. |
| Old Desktop Detail in View Mode (`isNewPoOpen` with viewOnly) | `PurchaseDetailDrawer.tsx` | `src/components/purchases/` | • Mobile-first hybrid swipeable drawer (swipe down to dismiss, pull up to `94dvh`).<br>• Sticky top bar with PO Code, copy button, status pill, and 44px close button.<br>• Unified single vertical scroll container: (1) Info PO & Supplier, (2) Book items list with cover previews, (3) Goods Receipt timeline log, (4) Financial & Journal breakdown.<br>• Sticky bottom action bar for primary operations. |
| Old Desktop Toolbar & Inline Filter in `PurchasesTab.tsx` | `PurchaseOrderMobileFilter.tsx` | `src/components/purchases/` | • Compact single-row mobile search with instant clear button (`X`).<br>• Horizontally scrollable status pill carousel (`Semua`, `Menunggu`, `Sebagian`, `Diterima`, `Cancel`) with live count and sum badges.<br>• Slide-up bottom drawer for Date Range Presets and Platform filters. |
| Desktop Table View (`.hidden md:flex`, table rows in `PurchasesTab.tsx`) | *Unchanged* (`PurchasesTab.tsx`) | `src/components/PurchasesTab.tsx` | • Preserves the full desktop spreadsheet-like table and verification view for screens ≥ 768px without any modifications. |
| Business Logic & Transaction Helpers (`ensureAutoAccountExists`, `generateReceivingJournals`, `prepareReceiptEventData`, etc.) | *Unchanged* (`journalAuto.ts` / `PurchasesTab.tsx`) | `src/lib/journalAuto.ts` | • 100% reused by passing callbacks from the new mobile presentation components. Zero transaction or accounting rules modified. |

---

## 8. Implementation Phases

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Planning, Review & Architecture Approval (Current) │
│ - Analyze current codebase and document UX/technical issues │
│ - Author docs/plan.md, progress.md, and testing.md          │
│ - Align with User on design decisions & modal stack rules   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 2: Mobile Filter & Status Carousel                    │
│ - Create src/components/purchases/PurchaseOrderMobileFilter │
│ - Implement compact search with 1-tap clear (X)             │
│ - Implement horizontal status carousel with count & NT$ sums│
│ - Implement slide-up Date & Platform filter drawer          │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 3: Purchase Order Mobile Card & Action Sheet          │
│ - Create src/components/purchases/PurchaseOrderMobileCard   │
│ - Implement status spine, progress bar, 1-tap copy feedback │
│ - Implement prominent primary lifecycle CTA button          │
│ - Implement ... More Actions bottom sheet (48px targets)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 4: Purchase Detail Drawer Architecture                │
│ - Create src/components/purchases/PurchaseDetailDrawer      │
│ - Implement swipe-to-dismiss vaul drawer (max 94dvh)        │
│ - Single vertical momentum scroll (eliminate dual scroll)   │
│ - Structured sections: Info, Book Items, Receiving Log, CoA │
│ - Sticky bottom action bar with safe area padding           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 5: Modal Stack & Dialog Hardening                     │
│ - Standardize createPortal and z-index layer hierarchy      │
│ - Port confirmation dialogs (Delete, Revert) to safe modals │
│ - Eliminate all window.alert() and window.confirm() calls   │
│ - Ensure body scroll locking and data-vaul-no-drag rules    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 6: Integration, Performance & End-to-End Verification │
│ - Connect mobile presentation components to PurchasesTab    │
│ - Verify TypeScript compilation (tsc --noEmit)              │
│ - Verify Production Build (vite build)                      │
│ - Test responsive breakpoints: 360px, 390px, 412px, 768px   │
│ - Execute complete manual & automated QA checklist          │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Performance & Lag Reduction Strategy

1. **Component Memoization (`React.memo`):**
   - Wrap `PurchaseOrderMobileCard` in `React.memo` with custom prop comparison to prevent unnecessary re-rendering of non-modified list items during search or status switching.
2. **Debounced Search Execution:**
   - Ensure search input updates UI state smoothly while filtering query execution occurs with minimal latency.
3. **Elimination of Blocking Native Alerts:**
   - Replace all instances of `window.alert(...)` and `window.confirm(...)` with inline React state feedback (toasts, custom centered dialogs).
4. **Single-Scroll Viewport Layouts:**
   - Remove nested `.book-scroll` containers in favor of a single unified container per sheet, unlocking native 60fps momentum hardware acceleration.
5. **Zero New External Dependencies:**
   - Utilize existing project packages exclusively (`vaul` v1.1.2, `lucide-react`, React 19, Tailwind CSS 4) without introducing bundle bloat.

---

## 10. Acceptance Criteria

- [ ] **Modal & Drawer Reliability:** `PurchaseDetailDrawer` and action sheets open in under 100ms without perceived delay or z-index collisions.
- [ ] **Background Interaction Lock:** Background page is completely non-scrollable and non-clickable whenever any drawer or modal is active.
- [ ] **Single Scroll Container:** Detail drawer contains exactly 1 vertical scroll container with zero dual scroll traps.
- [ ] **Touch Target Ergonomics:** All primary buttons are at least 44×44px; all action sheet menu items have at least 48px row height.
- [ ] **1-Tap Operations:**
  - 1-tap copy for PO Code, Order Number, and Tracking Resi with immediate visual checkmark feedback.
  - 1-tap status switching via horizontal status pill carousel.
  - 1-tap search reset via clear (`X`) button.
- [ ] **Safe Confirmation Dialogs:** Revert status and Delete PO actions trigger centered, non-swipeable dialogs with distinct confirm/cancel buttons.
- [ ] **Cross-Device Viewport Scaling:** Flawless rendering on Small Mobile (360px), Standard Mobile (390px–412px), Tablet (768px), and Desktop (≥ 1024px).
- [ ] **Desktop & Business Logic Preservation:** Desktop table view and all accounting/inventory transaction logic remain 100% unchanged.
- [ ] **Build Validation:** `tsc --noEmit` and `npm run build` pass with 0 errors.
