# Purchase Order Mobile Redesign — Living Testing & Acceptance Document

> **Document Version:** 1.0.0  
> **Last Updated:** 2026-08-29  
> **Status:** Living Document  
> **Target Scope:** Mobile UX (`< 768px`), Purchase Order Cards, Hybrid Drawers, Modal Stacking Engine, and Cross-Screen Integrity.

---

## 1. Executive Summary

This living testing document defines all quality assurance protocols, modal stack verification procedures, architectural invariants, and manual/automated test scenarios for the **Purchase Orders Mobile Redesign** in the Kangen Buku Indo ERP application.

---

## 2. Modal Stack & Interaction Invariants

All modals, drawers, bottom sheets, and popups in the Purchase Order module must adhere to these strict invariants:

1. **Inert Background Guarantee:** Whenever any modal layer (drawer, bottom sheet, full-screen form, or dialog) is active, the background page MUST become completely inert.
   - User cannot click buttons or cards behind the modal.
   - User cannot scroll the background page.
   - Touch drag gestures on the background page must not trigger scrolling or event bleeding.
2. **Backdrop Interception:** The backdrop overlay (`z-[9999]`) must capture all tap events outside the active modal container and dismiss non-critical sheets cleanly.
3. **Strict Layer Ordering:**
   - Background Page: `z-0`
   - Backdrop Overlay Scrim: `z-[9999]`
   - Active Drawer / Sheet: `z-[10000]`
   - Nested Dialog / Confirmation / Lightbox: `z-[10050]`
   - Feedback Toasts / Badges: `z-[10100]`
4. **Child Modal Lifecycle Isolation:** Opening a nested confirmation dialog (e.g. Delete PO or Revert Status) from inside a Detail Drawer or Action Sheet must never unmount or reset the scroll position of the parent sheet. Dismissing the child modal returns focus smoothly to the parent sheet.
5. **No Accidental Swipe on Confirmations:** Confirmation dialogs for financial or inventory transactions are centered and strictly non-swipeable.

---

## 3. Comprehensive Acceptance Testing Checklist

### Section A: Mobile Card & Quick Lifecycle Actions (`< 768px`)
- [ ] **Glanceability:** PO Code, Platform badge, Order/Tracking Resi, Order date, Qty progress bar, and Total Amount are visible without horizontal scrolling.
- [ ] **1-Tap Clipboard Copy:** Tapping copy icon next to PO Code, Supplier Order Number, or Tracking Number copies text to clipboard and displays a green checkmark (`Check`) for 1.5s (zero `window.alert()` popups).
- [ ] **1-Tap Status Progression:**
  - [ ] Status **Menunggu (Pending):** Primary CTA displays **Terima Barang** (`handleOpenReceiveGoods`).
  - [ ] Status **Sebagian (Partial):** Primary CTA displays **Lanjut Terima** (`handleOpenReceiveGoods`).
  - [ ] Status **Diterima (Received):** Primary CTA displays **Lihat Detail** (`handleViewPO`).
  - [ ] Status **Cancel:** Primary CTA displays **Lihat Detail** (`handleViewPO`).
- [ ] **Safe Card Tap:** Tapping the main card body opens the read-only **`PurchaseDetailDrawer`** (never triggers edit form unexpectedly).

### Section B: Action Sheet (`...` Menu)
- [ ] **Touch Target:** Tapping `...` opens the bottom Action Sheet.
- [ ] **48px Row Height:** Every action item has at least 48px row height for comfortable thumb tapping.
- [ ] **Lihat Rincian:** Opens the full `PurchaseDetailDrawer`.
- [ ] **Edit Pembelian:** Opens the full-screen edit form (allowed for draft/pending purchases).
- [ ] **Revert Status:** Triggers the centered confirmation dialog to revert received status to pending.
- [ ] **Tutup PO / Refund:** Opens the close PO and refund calculation dialog.
- [ ] **Hapus PO:** Styled with rose/red destructive theme and requires explicit confirmation.

### Section C: PurchaseDetailDrawer
- [ ] **Swipe & Drag Ergonomics:** Drawer smoothly pulls up to `94dvh`; swiping down on grab handle or header dismisses the sheet.
- [ ] **Gesture Conflict Prevention (`data-vaul-no-drag`):** Scrolling inside item list, tapping copy buttons, or interacting with inputs does not accidentally trigger drawer dismissal.
- [ ] **Single Scroll Container:** The drawer body scrolls as a single unified container; zero nested dual scrollbars.
- [ ] **Sticky Top Bar:** PO Code, status badge, copy button, and 44px close button stay pinned to top while scrolling.
- [ ] **Sticky Bottom Bar:** Action buttons ("Terima Barang", "Edit", "Tutup") stay pinned to bottom above safe area inset (`env(safe-area-inset-bottom)`).
- [ ] **Information Completeness:**
  - [ ] Platform and supplier details correctly formatted with currency tags.
  - [ ] Book items list displays book title, quantity ordered vs received, unit price, and subtotal.
  - [ ] Goods receipt log lists every historical receiving event with date, receiver name, and notes.
  - [ ] Financial summary displays subtotal, discount, forwarder fee proration, and total payment.

### Section D: Mobile Filter & Search Toolbar
- [ ] **Compact Single Row:** Search input and Filter button fit neatly on a single line.
- [ ] **1-Tap Search Reset:** Tapping the `X` clear icon resets the query and restores full list instantly.
- [ ] **Horizontal Status Pill Carousel:**
  - [ ] Switching between `Semua`, `Menunggu`, `Sebagian`, `Diterima`, and `Cancel` requires exactly 1 tap.
  - [ ] Live count badges and pending NT$ sum counters update dynamically.
- [ ] **Filter Drawer:** Tapping "Filter" opens slide-up bottom drawer for Date Range Presets (Hari Ini, 7 Hari, Bulan Ini, dsb.) and Platform selection.

### Section E: Modal Stacking & Performance
- [ ] **Opening Speed (< 100ms):** Modals, drawers, and action sheets mount smoothly with 60fps animations.
- [ ] **Zero Z-Index Collisions:** All modals portal to `document.body` and follow Layer 1 to Layer 5 hierarchy.
- [ ] **Body Scroll Lock:** Scrolling on the background page is completely locked while any drawer or modal is active.
- [ ] **No Accidental Double Submissions:** Buttons disable and display spinner state during active Firestore batch transactions.

### Section F: Cross-Screen & System Integrity
- [ ] **Small Mobile (360px):** Layout reflows cleanly without horizontal overflow or clipped text.
- [ ] **Standard Mobile (390px–412px):** Spacing, typography, and hitboxes are fully optimized.
- [ ] **Tablet & Desktop (≥ 768px):** Desktop spreadsheet table, header actions, and verification checklist remain 100% untouched and functional.
- [ ] **Zero Business Logic Mutations:** No accounting journal helpers, Firestore rules, or database models are modified.
- [ ] **Build Validation:** `tsc --noEmit` and `npm run build` pass with 0 errors.
