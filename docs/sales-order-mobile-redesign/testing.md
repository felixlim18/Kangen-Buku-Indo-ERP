# Sales Order Mobile Redesign — Living Testing & QA Document

> **Document Version:** 1.1.0  
> **Last Updated:** 2026-08-29  
> **Status:** Living Document  
> **Target Scope:** Sales Order Mobile UX (`< 768px`), Hybrid Drawers, Lightboxes, and Cross-Screen Preservation.

---

## 1. Executive Summary

This living testing document records all quality assurance procedures, known issue resolutions, architectural invariants, and manual/automated test scenarios for the **Sales Order Mobile Redesign** project in the Kangen Buku Indo ERP codebase.

---

## 2. Incident & Bug Resolution Log

### Incident #1: Modal Stacking Inversion (Image Lightbox Behind Drawer)

* **Date:** 2026-08-29
* **Component:** `src/components/ui/ImagePreviewModal.tsx` & `src/components/sales/SalesOrderDetailDrawer.tsx`
* **Severity:** High (UI Blocked)

#### A. Problem Statement
When a mobile user tapped *"Foto Alamat / Kode Toko"* or a book cover thumbnail from inside `SalesOrderDetailDrawer`, `ImagePreviewModal` mounted underneath the drawer backdrop. The image preview was invisible and could not be interacted with.

#### B. Root Cause Analysis
1. **Z-Index Layer Inversion:**
   - `SalesOrderDetailDrawer` portals to `document.body` via `vaul` with its content container configured at **`z-[10000]`**.
   - `ImagePreviewModal` portaled to `document.body` with its backdrop configured at **`z-[9999]`**.
   - Because `10000 > 9999`, the drawer physically covered the lightbox scrim.
2. **State Ownership & Preservation Constraint:**
   - Unmounting the drawer during preview would destroy its DOM nodes, causing the user to lose their scroll position (`scrollTop = 0`) upon returning.

#### C. Resolution Applied
- Elevated `ImagePreviewModal` overlay z-index to **`z-[10050]`**.
- Elevated `BookRecommendationsModal` overlay z-index to **`z-[10050]`**.
- Kept `SalesOrderDetailDrawer` mounted underneath at `z-[10000]`.
- **Result:** Lightbox renders on the topmost layer; closing the lightbox restores the user to the exact same scroll position in the drawer without re-animation.

---

### Incident #2: ImagePreviewModal Exit & Touch Dismiss Failure

* **Date:** 2026-08-29
* **Component:** `src/components/ui/ImagePreviewModal.tsx` & `src/mobile.css`
* **Severity:** High (Usability Trap / Unable to Exit)

#### A. Problem Statement
After fixing the stacking z-index, `ImagePreviewModal` opened over the screen, but mobile users had no visible or functional way to exit the preview (close button missing/off-screen, tapping background did not dismiss).

#### B. Root Cause Analysis
1. **CSS Containing Block Trap (`transform` vs `position: fixed`):**
   - The inner frame container applied a scale transition (`transform: scale(...)`). In CSS standards, `transform` creates a local containing block for all `position: fixed` descendants.
   - The CSS rule `.kbi-lightbox__close { position: fixed !important; top: 12px; right: 12px; }` positioned the button relative to the vertically centered frame box (clipping/obscuring it behind the image) rather than fixed at the viewport corner.
2. **Backdrop Event Propagation Interception:**
   - The inner frame captured and stopped all click propagation across the full viewport width, preventing taps around the image from reaching the backdrop's `onClick={onClose}` handler.
3. **Missing Safe-Area & Touch Hitbox Standards:**
   - The close button lacked explicit safe-area top clearance (`env(safe-area-inset-top)`) and a dedicated 44px touch target.

#### C. Resolution Applied
- **Fixed Full-Bleed Top Header:** Placed the top bar as a direct child of the fixed overlay outside the transform frame with `calc(env(safe-area-inset-top, 0px) + 8px)` safe-area padding.
- **Prominent 44 × 44 px Close Button:** High-contrast `w-11 h-11` round button (`bg-white/20 hover:bg-white/35 text-white`) with explicit `aria-label="Tutup pratinjau"`.
- **Backdrop Click Dismissal:** Tapping anywhere on the dark backdrop outside the image invokes `onClose()`.
- **Bottom Dismiss Pill:** Added a *"Tutup Pratinjau"* button at the bottom (`pb-[calc(env(safe-area-inset-bottom,0px)+8px)]`) for thumb convenience.
- **Cleaned CSS:** Removed conflicting `.kbi-lightbox__frame` and `.kbi-lightbox__close` overrides from `src/mobile.css`.

---

## 3. Living Test Suite & Acceptance Checklist

Use this checklist before merging any changes to the Sales Order module or related mobile presentation components:

### Section A: Mobile Card & Quick Lifecycle Actions (`< 768px`)
- [ ] **Glanceability:** Order code, channel badge, status pill, customer name, delivery tags, and total NT$ amount are visible without scrolling.
- [ ] **1-Tap Copy Code:** Tapping the copy icon on order code or order number copies text to clipboard and swaps icon to a green checkmark (`Check`) for 1.5 seconds.
- [ ] **1-Tap Status Progression (Staff Role):**
  - [ ] Status **Pending / Draft** ➔ Primary CTA displays **Kemas Orderan** (`onKemasClick`).
  - [ ] Status **Packed** ➔ Primary CTA displays **Kirim Pesanan** (`onProsesKirimClick`).
  - [ ] Status **Shipped / Confirmed** ➔ Primary CTAs display **Selesai** (`onSelesaiClick`) & **Return** (`onReturnClick`).
  - [ ] Status **Returned** ➔ Primary CTA displays **Diambil Pemilik** (`onDiambilClick`).
  - [ ] Other / Non-staff ➔ Primary CTA displays **Lihat Rincian** (`onOpenDetail`).

### Section B: Action Sheet (`...` Menu)
- [ ] **Touch Target:** Tapping `...` opens the bottom Action Sheet.
- [ ] **48px Row Height:** All action sheet rows have a minimum 48px touch target.
- [ ] **Cetak Invoice:** Calls `onPrintInvoice` to trigger the invoice generation flow.
- [ ] **Edit Orderan:** Opens the edit order flow for draft orders.
- [ ] **QR Code Resi:** Displays barcode modal if tracking number is present; alerts gracefully if absent.
- [ ] **Rekomendasi Buku:** Opens the cross-sell book recommendation dialog.
- [ ] **Pin / Unpin:** Toggles top-priority order pin state.
- [ ] **Revert Status:** Triggers the confirmation dialog to step back one status lifecycle stage.
- [ ] **Hapus Orderan:** Styled with rose/red destructive theme and requires confirmation.

### Section C: SalesOrderDetailDrawer
- [ ] **Swipe & Drag Ergonomics:** Drawer opens smoothly to `94dvh`; swiping down on grab handle or top bar dismisses the drawer.
- [ ] **Gesture Conflict Prevention (`data-vaul-no-drag`):** Swiping or scrolling inside the book list, payment breakdown, or tapping copy buttons does not trigger accidental drawer closure.
- [ ] **Single Scroll Container:** The drawer body scrolls as a single unified container; no nested `.book-scroll` scroll traps exist.
- [ ] **Sticky Top Bar:** Order code, status pill, recommendation trigger, and 44px close button stay fixed at the top while scrolling.
- [ ] **Sticky Bottom Action Bar:** Action buttons (Cetak, Split, Edit, Selesai, Return, Tutup) stay pinned to the bottom above the safe-area inset (`env(safe-area-inset-bottom)`).

### Section D: Filter Bar & Status Carousel
- [ ] **Instant Search & Clear:** Typing filters cards in real time; tapping `X` clears the query immediately.
- [ ] **Status Carousel:** Horizontally scrollable status pills (`Semua`, `Pending`, `Dikemas`, `Dikirim`, `Selesai`, `Return`, `Cancel`) display live count badges and switch filters in 1 tap.
- [ ] **Filter Drawer:** Tapping the filter trigger opens the slide-up drawer with `DateRangePicker`, channel filters, and logistics filters.
- [ ] **Reset Filter:** Tapping "Reset Filter" clears all active filters and resets date range.

### Section E: ImagePreviewModal Lightbox
- [ ] **Top Layering:** Lightbox always mounts at Tier 4 (`z-[10050]`), completely above drawers and dialogs.
- [ ] **Background Event Blocking:** `SalesOrderDetailDrawer` receives `inert` and `pointer-events-none` while preview is active; underlying elements cannot be clicked or swiped.
- [ ] **Scroll Preservation:** Closing lightbox returns to the exact `scrollTop` position inside `SalesOrderDetailDrawer`.
- [ ] **Exit Accessibility:** Can exit via: (1) top 44px close button, (2) backdrop tap, (3) bottom pill button, (4) keyboard `Esc`.

### Section F: Cross-Screen & Breakpoint Preservation
- [ ] **Small Mobile (360px):** Layout reflows cleanly without horizontal overflow.
- [ ] **Standard Mobile (390px – 412px):** All buttons meet 44px+ hit target.
- [ ] **Tablet Tier (768px – 1023px):** Side-by-side master-detail view (`.kbi-sosplit`) is active and 100% operational.
- [ ] **Desktop Tier (≥ 1024px):** Full enterprise data table (`.kbi-sotable`) and header masthead are active and 100% operational.

---

## 4. Modal Stacking & Interaction Tier Architecture

| Tier | Name | Target Components | Z-Index Token | Backdrop Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | Base Page & Navigation | Tabs, Tables, Mobile Toolbar, FAB | `z-0` – `z-40` | Inline |
| **Tier 2** | Primary Drawers & Sheets | `SalesOrderDetailDrawer`, `FilterDrawer`, `ActionSheet`, `NewOrderModalWrapper` | `z-[10000]` | `fixed inset-0 bg-black/60` |
| **Tier 3** | Secondary Modals & Confirmation Gates | `Kemas`, `Kirim`, `Selesai`, `Diambil`, `Revert`, `Delete`, `SplitOrder`, `QrCodeModal`, `BookRecommendationsModal`, `RefundMarketplace` | `z-[10020]` (`MODAL_TIERS.DIALOG`) | `fixed inset-0 bg-black/60` (`createPortal` to `document.body`) |
| **Tier 4** | Media Lightbox | `ImagePreviewModal` | `z-[10050]` (`MODAL_TIERS.LIGHTBOX`) | `fixed inset-0 bg-black/90` (`createPortal` to `document.body`) |

---

## 5. Verification Matrix

| Test Suite / Command | Target Scope | Status | Notes |
| :--- | :--- | :--- | :--- |
| `npx vite build` | Compilation & type integrity across all tabs | **PASS ✅** | Exit code 0, 0 compilation errors. |
| Modal Stacking Hierarchy | Tier 1 ➔ Tier 2 ➔ Tier 3 ➔ Tier 4 | **PASS ✅** | All dialogs portaled to `document.body`. |
| Scroll Position Preservation | `SalesOrderDetailDrawer` ➔ `ImagePreviewModal` ➔ Drawer | **PASS ✅** | DOM node preserved, `scrollTop` unchanged via `inert`. |
| Full Viewport Scrim Coverage | `getModalOverlayClass` (`fixed inset-0`) | **PASS ✅** | Sidebar click pass-through completely blocked. |

---

## 6. Automated Build & Quality Gate

Every release must pass the production Vite build with 0 TypeScript/compilation errors:

```bash
# Run production build
npx vite build

# Expected Output:
# ✓ 3125+ modules transformed.
# ✓ built in ~17s
# Exit code: 0
```

---

## 7. Changelog & Revisions

| Date | Author / Agent | Changes & Notes |
| :--- | :--- | :--- |
| **2026-08-29** | Antigravity AI | Initial creation of living testing document. Recorded Incident #1 (Z-index stacking) and Incident #2 (Lightbox exit usability). Established complete QA test checklist and migrated all confirmation gates to centralized modal architecture (Phase 1–3). |
