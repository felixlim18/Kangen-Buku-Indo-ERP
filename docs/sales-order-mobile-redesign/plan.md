# Sales Order Mobile Redesign Plan

## 1. Current Problems

### A. Modal & Dialog Issues
* **Opening Delay & Lag:** Opening modals (detail, edit, process, etc.) on mobile exhibits noticeable delay due to massive component re-evaluations and deeply nested render trees.
* **Click Interaction Failures & Blocked Overlays:** Backdrops occasionally trap pointer events or prevent clicking on underlying elements after closing. Clicks inside the modal sometimes miss targets.
* **Vertical Squishing & Layout Compression:** Detail modals squeeze into vertical viewports without adequate clearance for browser address bars, keyboards, or safe areas, making text difficult to read.
* **Unavailable / Clipped Close Button:** On smaller screens, long order titles or wide status badge rows push the 32px close button partially or fully off-screen.
* **Dual & Nested Scrollbars:** Scrollable regions inside modal cards (e.g. book lists) fight the modal container's outer scrollbar, creating scroll hijacking and erratic drag behavior.

### B. Layout & Information Hierarchy Issues
* **Desktop-Oriented Design:** Mobile screens receive a desktop layout adaptation rather than an intentional mobile-first experience.
* **Dense, Crowded Button Rows:** Mobile cards cram up to 7 small icons (24px) in a single row (`Print`, `Edit`/`Eye`, `Pin`, `Recommendations`, `Revert`, `Delete`), leading to frequent accidental taps (fat-finger errors).
* **High Cognitive Load:** Vital order details (Order Code, Customer, Status, Date, Total NTD) compete visually with secondary metadata.
* **Desktop Filter Toolbar:** Filter and search bars occupy excessive vertical space on mobile and require navigating multi-select dropdowns designed for mice.

---

## 2. Root Cause Analysis

| Problem | Root Cause | Technical Impact |
| :--- | :--- | :--- |
| **Z-Index & Backdrop Trapping** | Modals were mounted directly in the component DOM tree instead of portaling to `document.body`. Parent containers with CSS transforms, overflow constraints, and sidebar margins created conflicting stacking contexts. | Modals render under navigation bars or fail to receive click events. |
| **Vertical Squishing & Dual Scrolling** | Desktop CSS (`SalesOrderDetail.css`) applied static widths (`1100px`, `max-height: 90vh`) and hardcoded grid columns (`1fr 312.312px`), while `mobile.css` forced `100dvh` and added nested `.book-scroll` containers. | Dual scrollbars fight each other; inner cards are clipped into tiny 300px viewports. |
| **Clipped Close Actions** | Desktop headers (`.mhead`) allowed title text (`.htx`) to expand without truncating, pushing flex-none close buttons beyond screen bounds. | Users are unable to dismiss modals without reloading or using browser navigation. |
| **Re-render Bottlenecks** | The entire 9,200+ line `SalesTab.tsx` re-rendered on every state change because modal markup, filter lookups, and inventory queries were defined inline without memoization. | Interaction delays, sluggish scrolling, and input latency on mobile devices. |

---

## 3. Redesign Concept

The mobile redesign is built on a **Mobile-First Product Design** philosophy:

```
+-------------------------------------------------------------+
| [🔍 Cari order, nama, resi...]               [ ⚙️ Filter ]  |
+-------------------------------------------------------------+
| ( Semua 124 ) ( Pending 18 ) ( Dikemas 12 ) ( Dikirim 45 )  |
+-------------------------------------------------------------+
|                                                             |
|  +-------------------------------------------------------+  |
|  || #SO-2608001 [📋]  [ WhatsApp ]         [ • PENDING ] |  |
|  || Budi Santoso (0912-345-678)                          |  |
|  || 2026/08/29 · ✓ Stok siap · COD · 7-Eleven            |  |
|  || Qty: 3 Pcs · Diskon: -NT$50         Total: NT$ 1,250 |  |
|  || [      🚀 Kemas Orderan      ]         [  ••• More ] |  |
|  +-------------------------------------------------------+  |
|                                                             |
|  +-------------------------------------------------------+  |
|  || #SO-2608002 [📋]  [ Shopee ]           [ • DIKIRIM ] |  |
|  || Siti Rahma (TW1234567890)                            |  |
|  || 2026/08/28 · FamilyMart · Transfer                   |  |
|  || Qty: 1 Pcs                          Total: NT$   450 |  |
|  || [  ✓ Selesai  ]  [ ↩ Return ]          [  ••• More ] |  |
|  +-------------------------------------------------------+  |
|                                                             |
+-------------------------------------------------------------+
```

### Core UX Principles
1. **Glanceability:** Important information (Order Number, Customer, Date, Status, Total NT$) is readable in under 2 seconds.
2. **Thumb-Driven Actions:** Primary actions feature prominent, wide touch buttons (min. 44px height).
3. **Action Sheet Architecture:** Secondary actions (`Cetak Invoice`, `Edit`, `QR Code Resi`, `Rekomendasi Buku`, `Pin/Unpin`, `Revert`, `Hapus`) are neatly organized in a bottom action sheet.
4. **Hybrid Drawer & Full-Screen Sheet:** Order details open smoothly as a swipeable bottom sheet (powered by `vaul`), with the option to expand to full screen.

### 3.1 Context-Driven Modal Pattern Matrix

Rather than forcing a single pattern across all interactions, every popup, modal, sheet, and overlay in the Sales Order Tab is matched to its optimal UI pattern based on information density, user task complexity, frequency, keyboard needs, thumb accessibility, and transaction safety:

| # | Interaction / Component Name | Recommended UI Pattern | Why Pattern Is Appropriate | Interaction & Contextual Requirements |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Detail Sales Order**<br>`viewingOrderDetail`<br>`SalesOrderDetailDrawer` | **Drawer**<br>*(Expandable Bottom Drawer)* | Allows rapid order inspection without losing list context. Users can peek at order status and swipe down to close, or drag up to inspect long book lists. | • **Info Amount:** High (Customer info, book lines, payments, timeline, actions).<br>• **Complexity:** Medium (Inspection + action execution).<br>• **Frequency:** Very High (Daily primary flow).<br>• **Thumb Reach:** High (Drag handle, sticky bottom CTA bar).<br>• **Keyboard:** None (Read-only browsing).<br>• **Scroll:** Single momentum scroll (`max-h-[94dvh]`), no nested scroll traps. |
| **2** | **More Actions Menu**<br>`SalesOrderMobileCard`<br>`Action Sheet (...)` | **Bottom Sheet**<br>*(Action Sheet)* | Follows iOS/Android native ActionSheet convention for secondary actions. Keeps main card uncluttered while placing 6–8 actions in easy thumb reach. | • **Info Amount:** Low-Medium (List of 6–8 action buttons with icons).<br>• **Complexity:** Low (Single tap selection).<br>• **Frequency:** High.<br>• **Thumb Reach:** Maximum (Bottom thumb zone, 48px touch targets).<br>• **Keyboard:** None.<br>• **Scroll:** No scroll needed (auto-height wraps content). |
| **3** | **Mobile Filter & Search Drawer**<br>`SalesOrderMobileFilter`<br>`Filter Drawer` | **Bottom Sheet**<br>*(Filter Drawer)* | Slides up from bottom to configure date ranges, sales channels, and couriers without taking over the whole screen. | • **Info Amount:** Medium (Date presets, Platform select, Courier select, Notes query).<br>• **Complexity:** Medium.<br>• **Frequency:** Medium-High.<br>• **Thumb Reach:** High (Anchored to lower screen half).<br>• **Keyboard:** Low (1 text input, mostly selector buttons).<br>• **Scroll:** Vertical scroll with `pb-safe` for keyboard/home-bar clearance. |
| **4** | **Create New Order**<br>`NewOrderModalWrapper`<br>`openNewOrder` | **Full Screen Modal**<br>*(Page Sheet)* | High-density transactional form with autocomplete, price overrides, file attachments, and date pickers. Prevents mobile virtual keyboard from crushing inputs. | • **Info Amount:** Very High (Customer, books, pricing, discounts, shipping, photos).<br>• **Complexity:** High (Multi-field financial record creation).<br>• **Frequency:** High.<br>• **Thumb Reach:** Fixed top navigation bar (`Batal` / `Simpan`), full-width bottom submit CTA.<br>• **Keyboard:** Very Heavy (Extensive text/number inputs).<br>• **Scroll:** Full viewport vertical scroll (`100dvh`) with keyboard avoidance. |
| **5** | **Edit Order**<br>`handleEditOrderClick`<br>`editingOrder` | **Full Screen Modal**<br>*(Page Sheet)* | Full canvas needed to modify book lines, quantities, prices, discounts, and customer details with clear visibility. | • **Info Amount:** Very High.<br>• **Complexity:** High.<br>• **Frequency:** Medium.<br>• **Thumb Reach:** Fixed top bar, bottom action buttons.<br>• **Keyboard:** Very Heavy.<br>• **Scroll:** Full viewport vertical scroll (`100dvh`). |
| **6** | **Split Order Modal**<br>`handleOpenSplitOrderModal`<br>`splitOrderModalData` | **Full Screen Modal**<br>*(Page Sheet)* | Complex mathematical workflow: selecting split quantities per book line, calculating split balances, and generating secondary order records. | • **Info Amount:** High (Book checklist, qty steppers, remaining balance summary).<br>• **Complexity:** High.<br>• **Frequency:** Low-Medium.<br>• **Thumb Reach:** Top bar cancel, bottom execute split button.<br>• **Keyboard:** Medium (Qty adjustments, split notes).<br>• **Scroll:** Full-screen list scroll. |
| **7** | **Bulk Process Modal**<br>`BulkProcessModal`<br>`setIsBulkProcessOpen` | **Full Screen Modal**<br>*(Page Sheet)* | Multi-order batch operations (changing status for 20+ orders, batch shipping dates, packing labels). Requires maximum screen area. | • **Info Amount:** High (Order checklists, batch status selector, packing dates).<br>• **Complexity:** High.<br>• **Frequency:** Low-Medium.<br>• **Thumb Reach:** Full screen with sticky execution bar.<br>• **Keyboard:** Medium.<br>• **Scroll:** Full-screen table/card list scroll. |
| **8** | **Manage Sales Config**<br>`setIsManageConfigOpen`<br>Platform / Courier settings | **Full Screen Modal**<br>*(Page Sheet)* | Tabbed configuration interface for Platforms, Order Types, and Logistics with toggle switches and inline add/edit capabilities. | • **Info Amount:** Medium-High.<br>• **Complexity:** High.<br>• **Frequency:** Low.<br>• **Thumb Reach:** Top close button, tabbed navigation.<br>• **Keyboard:** Medium.<br>• **Scroll:** Tab-level vertical scroll. |
| **9** | **Packing Checklist**<br>`PackingChecklist`<br>`isChecklistOpen` | **Full Screen Modal**<br>*(Page Sheet)* | Dedicated warehouse picker tool displaying aggregated items grouped by book title with interactive checklist checkboxes. | • **Info Amount:** High (Grouped items, quantities, warehouse checklist).<br>• **Complexity:** Medium (Physical picking verification).<br>• **Frequency:** Medium-High.<br>• **Thumb Reach:** Large tap targets for warehouse operators.<br>• **Keyboard:** None.<br>• **Scroll:** Long list scroll. |
| **10** | **Book Recommendations**<br>`BookRecommendationsModal`<br>`recoOrderData` | **Drawer / Bottom Sheet** | Browsing cross-sell recommendations while keeping the current order context active. | • **Info Amount:** Medium (Cross-sell book cards with cover, price, stock status).<br>• **Complexity:** Low-Medium (Browse & add to order).<br>• **Frequency:** Medium.<br>• **Thumb Reach:** High (Bottom drag sheet).<br>• **Keyboard:** None.<br>• **Scroll:** Card list scroll inside sheet. |
| **11** | **Confirmation Dialogs**<br>• `confirmingKemasOrder`<br>• `isProsesConfirmOpen`<br>• `openSelesaiConfirm`<br>• `confirmingDiambilOrder`<br>• `revertConfirmState`<br>• `isDeleteOrderSubmitting`<br>• `refundConfirmOrder` | **Dialog**<br>*(Centered Alert Modal)* | **Safety-Critical Financial / Inventory Gates:** Prevents accidental dismissals or unintended state mutations. Requires deliberate confirmation. | • **Info Amount:** Low (Order code, prompt warning, consequence summary).<br>• **Complexity:** Low (Decisive verification step).<br>• **Frequency:** High.<br>• **Thumb Reach:** Centered box (`max-w-[360px]`), distinct `Batal` vs `Konfirmasi` buttons (min. 44px).<br>• **Keyboard:** Low (Optional tracking number input on Kirim).<br>• **Scroll:** No scroll.<br>• **Safety Rule:** Explicitly non-swipeable. |
| **12** | **QR Code Resi Modal**<br>`qrCodeModalOrder` | **Dialog**<br>*(Centered Barcode Modal)* | High-contrast display for scanning shipping barcodes at convenience store drop-off counters (7-Eleven / FamilyMart). | • **Info Amount:** Low (Courier, tracking number, high-res scanable QR code).<br>• **Complexity:** Low (Visual scan).<br>• **Frequency:** High during drop-off dispatch.<br>• **Thumb Reach:** Centered display, large close button.<br>• **Keyboard:** None.<br>• **Scroll:** No scroll. |
| **13** | **Image Preview / Lightbox**<br>`previewImage`<br>`ImagePreviewModal` | **Lightbox**<br>*(Full Screen Overlay)* | Inspecting recipient address slips, store photos, and cover images with full visual fidelity and maximum contrast. | • **Info Amount:** Single Image.<br>• **Complexity:** Low (Visual inspection).<br>• **Frequency:** Medium.<br>• **Thumb Reach:** Tap anywhere to close, top-right `X` button.<br>• **Keyboard:** None.<br>• **Scroll:** Pinch-to-zoom / Pan. |

---

## 4. Technical Approach

1. **Portal-First Architecture:** All modals portal directly to `document.body` via `createPortal`, isolating them from parent container styles and stacking contexts.
2. **Vaul Gesture Engine:** Utilize `vaul` `Drawer` for fluid bottom sheets, smooth touch dismissals, and hardware-accelerated animations.
3. **Responsive CSS Modernization:** Replace hardcoded pixel columns (`312.312px`) with responsive CSS grid and flexbox (`minmax(0, 1fr)`).
4. **Performance & Memoization:**
   - Extract mobile subcomponents into dedicated, memoized modules (`React.memo`).
   - Eliminate redundant calculations during typing and scrolling.
   - Use CSS safe area insets (`env(safe-area-inset-bottom)`) for notch and navigation bar compatibility.
5. **Ponytail Simplicity:** Eliminate bloated CSS overrides and keep dependencies standard and native.

---

## 5. Component Changes

### A. New Components (`src/components/sales/`)

#### 1. `SalesOrderDetailDrawer.tsx`
* **Purpose:** Mobile-native hybrid bottom sheet & full-screen detail view.
* **Features:**
  * Fixed top header with order code, 1-tap copy, status badge, recommendation trigger, and 44px close button.
  * Single momentum-scroll container (no nested dual scrollbars).
  * Structured cards: **Informasi Pesanan**, **Daftar Buku** (covers, qty, price), **Ringkasan Pembayaran** (subtotal, discounts, total), and **Riwayat Transaksi** (status timeline).
  * Sticky bottom action bar for primary actions (`Cetak`, `Split`, `Edit`, `Selesai`, `Return`).

#### 2. `SalesOrderMobileCard.tsx`
* **Purpose:** High-performance, touch-friendly order card for mobile lists.
* **Features:**
  * Color-coded status spine on the left edge.
  * Header with copyable order code, dynamic channel color badge, and status pill.
  * Customer name, shipment tags (`Stok siap`, `Overdue`, `Disematkan`, `COD`), and tabular total NT$.
  * Prominent primary CTA button + `...` trigger for the secondary Action Sheet.

#### 3. `SalesOrderMobileFilter.tsx`
* **Purpose:** Compact mobile toolbar and filtering system.
* **Features:**
  * Compact search bar with instant clear (`X`) button.
  * Horizontally scrollable status pill carousel with live order counts.
  * Slide-up filter drawer for date range selection, channel filters, and logistics carriers.

### B. Modified Files

#### 1. `src/components/SalesTab.tsx`
* Imports and renders `SalesOrderMobileFilter`, `SalesOrderMobileCard`, and `SalesOrderDetailDrawer` for screens `< 768px`.
* Hides desktop-specific toolbar and pipeline cards on mobile (`hidden md:block`).
* Preserves desktop table and tablet master-detail split views completely intact.

---

## 6. Implementation Phases

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Foundation & CSS Cleanup                           │
│ - Validate responsive styles in SalesOrderDetail.css        │
│ - Ensure viewport safe area variables and eliminate blowout │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 2: Build Mobile Components                            │
│ - SalesOrderDetailDrawer.tsx                                │
│ - SalesOrderMobileCard.tsx                                  │
│ - SalesOrderMobileFilter.tsx                                │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 3: Integration into SalesTab.tsx                      │
│ - Wire mobile filters, cards, and detail drawer             │
│ - Connect all 20+ transaction and status transition handlers│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Phase 4: Verification & Quality Assurance                   │
│ - Run TypeScript check (tsc --noEmit)                       │
│ - Run Vite production build (vite build)                    │
│ - Test responsive breakpoints: 360px, 390px, 412px, 768px   │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Acceptance Criteria

- [ ] **Modal Reliability:** Detail modal opens instantly without lag, z-index clipping, or overlay blocking.
- [ ] **Scroll Ergonomics:** Detail sheet scrolls naturally as a single container without dual scroll traps.
- [ ] **Close Accessibility:** Close button is always visible, minimum 44px touch target, and responds to swipe-down gestures.
- [ ] **Thumb-Friendly Touch Targets:** All primary buttons are at least 44px in height; secondary actions are cleanly accessible via the `...` Action Sheet (48px targets).
- [ ] **Information Hierarchy:** Order Code, Customer, Date, Status, and Total Amount are prominently visible at first glance.
- [ ] **Filter & Search:** Compact search with instant reset and horizontal status pill carousel function smoothly.
- [ ] **Cross-Screen Compatibility:** Desktop table view and tablet split view remain 100% intact and unaffected.
- [ ] **Build Validation:** `npm run build` (`vite build`) completes with 0 errors.

---

## 8. Design Review Checkpoint & Risk Mitigation

### A. Assumptions Validated
1. **Zero New External Dependencies:** All proposed components leverage existing stack dependencies (`vaul` v1.1.2, `lucide-react`, React 19, Tailwind CSS 4).
2. **Strict Business Logic Isolation:** No database helpers, Firestore transaction functions, or period-closing logic are modified. Mobile components are pure presentation layers passing events to existing `SalesTab.tsx` handlers.
3. **Multi-Tier Screen Integrity:**
   - Mobile (`< 768px`): `SalesOrderMobileFilter` + `SalesOrderMobileCard` + `SalesOrderDetailDrawer`.
   - Tablet (`768px - 1023px`): Preserved side-by-side Master-Detail view (`.kbi-sosplit`).
   - Desktop (`>= 1024px`): Preserved full enterprise spreadsheet table (`.kbi-sotable`).

### B. Vaul Gesture Engine & Interaction Safeguards
* **Scroll vs Drag Conflict Prevention:** Add `data-vaul-no-drag` to scrollable containers, input fields, copy buttons, and action buttons to prevent accidental sheet dismissals when interacting with content.
* **Nested Modal Stacking Context:** Nested modals (Image preview lightbox, QR Code dialog, Split Order modal) use `z-[10001]+` with portals to ensure they overlay cleanly above the `z-[10000]` bottom drawer.
* **Virtual Keyboard & Safe Area Handling:** Use dynamic viewport height (`max-h-[94dvh]`) and `env(safe-area-inset-bottom)` to ensure sticky footers and buttons remain visible above on-screen keyboards and iOS home bars.

### C. UX Decision Confirmations
1. **Action Sheet (`...`) vs Floating Dropdown:** Action sheet chosen for thumb reachability and WCAG AA touch target compliance (48px targets vs 28px desktop menus).
2. **Horizontal Status Chips:** 1-tap status switching with real-time badges chosen over nested select dropdowns to minimize friction during high-volume order processing.
3. **Contextual Primary CTA:** Single prominent button matching the order's immediate next lifecycle action (`Kemas` -> `Kirim` -> `Selesai/Return` -> `Diambil`).

---

## 9. Vaul Audit & Component Impact Mapping

### A. Vaul Usage Audit in Existing Codebase
* **Installed Package:** `vaul` v1.1.2 (`package.json`).
* **Existing Project Implementation:** `NewOrderModalWrapper` in `SalesTab.tsx` (lines 255–277).
* **Established Project Patterns Reused:**
  1. **Portal Mounting:** `createPortal(..., document.body)` wrapping `Drawer.Root` to prevent CSS transform traps or parent clipping.
  2. **Layering Standards:** Overlay configured at `fixed inset-0 bg-black/60 z-[9999]`, content container configured at `fixed bottom-0 left-0 right-0 z-[10000]`.
  3. **Consistent Grab Handle:** `<div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-700 mb-4 cursor-grab active:cursor-grabbing" />`.
  4. **Safe Area Protection:** `pb-safe` / `env(safe-area-inset-bottom)` applied to bottom sheets for iOS home indicator clearance.
  5. **Gesture Conflict Mitigation:** `data-vaul-no-drag` applied on interactive elements (inputs, copy buttons, horizontal carousels).

### B. Component Impact Mapping Table

| Existing Code / Component | New Component | Responsibility & Scope |
| :--- | :--- | :--- |
| **Old Mobile Cards** (`.kbi-ocards` inline loop in `SalesTab.tsx`) | `SalesOrderMobileCard.tsx` | • Renders touch-optimized card with color-coded status spine ribbon.<br>• Displays order code (1-tap copy), customer platform details, channel badge, delivery tags, and tabular NT$ pricing.<br>• Houses primary lifecycle CTA button (`Kemas`, `Kirim`, `Selesai`, `Return`, `Diambil`).<br>• Triggers the `...` **More Actions Bottom Sheet** (48px targets) for secondary actions (`Cetak`, `Edit`, `QR Resi`, `Rekomendasi`, `Pin`, `Revert`, `Hapus`). |
| **Old Detail Modal** (`.kbi-rincian-modal` with desktop constraints in `SalesTab.tsx`) | `SalesOrderDetailDrawer.tsx` | • Mobile-first hybrid bottom sheet / drawer (swipe down to dismiss, pull up to `94dvh`).<br>• Fixed top bar with order code, 1-tap copy, status badge, and 44px close button.<br>• Single vertical scroll container organizing: (1) Order Info & Store Photos, (2) Book items with covers & subtotal, (3) Payment Breakdown, (4) Status History Timeline.<br>• Sticky bottom action bar (`Cetak`, `Split`, `Edit`, `Selesai`, `Return`). |
| **Old Desktop Toolbar** (Squeezed multiline controls on mobile in `SalesTab.tsx`) | `SalesOrderMobileFilter.tsx` | • Compact single-row mobile search with instant clear button (`X`).<br>• Horizontally scrollable status pill carousel (`Semua`, `Pending`, `Dikemas`, `Dikirim`, `Selesai`, `Return`, `Cancel`) with live count badges and total NT$ sums.<br>• Slide-up bottom drawer for Date Range Picker, Platform Channel filter, and Logistics carrier filter. |
| **Desktop Table View** (`.kbi-sotable`, `hidden lg:block` in `SalesTab.tsx`) | *Unchanged* (`SalesTab.tsx`) | • Preserves the full spreadsheet-like table for screens ≥ 1024px without any modifications or regressions. |
| **Tablet Master-Detail Tier** (`.kbi-sosplit`, `hidden md:grid lg:hidden` in `SalesTab.tsx`) | *Unchanged* (`SalesTab.tsx`) | • Preserves the side-by-side master list + detail pane for tablet viewports (768px–1023px). |
| **Business Logic & Helpers** (`confirmSalesOrderTransaction`, `splitSalesOrderTransaction`, `processMarketplaceRefundTransaction`, etc.) | *Unchanged* (`db-helpers.ts` / `SalesTab.tsx`) | • 100% reused by passing callbacks from the new mobile presentation components. Zero transaction or database logic is modified. |

---

## 10. UX Acceptance Checklist

A set of measurable, objective UX benchmarks to validate that the redesigned mobile experience meets enterprise-grade mobile standards:

### A. Interaction Efficiency & Steps
- [ ] **1-Tap Status Lifecycle Actions:** Primary lifecycle transition (`Kemas`, `Kirim`, `Selesai`, `Diambil`) can be executed in exactly **1 tap** directly from the card list.
- [ ] **1-Tap Order Code Copy:** Copying order code to clipboard completes in **1 tap** with immediate visual toast/alert feedback.
- [ ] **Max 2 Taps for Secondary Actions:** Any secondary action (`Cetak`, `Edit`, `QR Resi`, `Rekomendasi`, `Pin`, `Revert`, `Hapus`) is accessible within **maximum 2 taps** (Tap `...` ➔ Tap action row).
- [ ] **1-Tap Instant Filter Switching:** Switching between status tabs (`Semua`, `Pending`, `Dikemas`, `Dikirim`, `Selesai`, `Return`, `Cancel`) requires **1 tap** on horizontal pill carousel.
- [ ] **1-Tap Search Reset:** Clearing search queries takes **1 tap** on the `X` clear icon.

### B. Touch Target & Ergonomics (WCAG 2.2 AA)
- [ ] **Primary Action Buttons:** Minimum **44 × 44 px** touch target size.
- [ ] **Action Sheet Menu Items:** Minimum **48 px** row height across all secondary menu options for effortless thumb reachability.
- [ ] **Close Buttons:** Top-right `X` buttons and sheet handles have minimum **44 × 44 px** interactive hit-boxes.
- [ ] **No Cramped Icon Clusters:** Zero card rows with 5–7 small 24px icon buttons side-by-side; all secondary options safely consolidated inside the Action Sheet.

### C. Modal & Sheet Behavior
- [ ] **Instant Opening (< 100ms):** Modals and drawers mount without perceived freeze, jank, or layout re-computation delay.
- [ ] **Zero Z-Index Collisions:** All sheets and modals portal directly to `document.body` (`z-[9999]` overlay, `z-[10000]` content), completely immune to parent container clipping or sidebar margin offsets.
- [ ] **Fluid Gesture Dismissal:** Bottom sheets and drawers close smoothly via swipe-down gesture on the grab handle or top bar.
- [ ] **No Accidental Swipe on Confirmations:** Confirmation dialogs (Kemas, Kirim, Selesai, Return, Hapus) are centered and **strictly non-swipeable** to prevent accidental transaction execution or cancellation.

### D. Scrolling & Viewport Ergonomics
- [ ] **Single Scroll Container:** Detail drawer contains exactly **1 vertical scroll container**; nested child scrollbars (such as `.book-scroll`) are eliminated.
- [ ] **Over-scroll Containment:** Background list scroll is locked (`overflow: hidden` on body) while any sheet or modal is open, preventing background scroll leaks.
- [ ] **Safe Area Insets:** Dynamic `max-h-[94dvh]` and `pb-safe` / `env(safe-area-inset-bottom)` applied to guarantee bottom action buttons are never obscured by iOS Home Indicator bars or Android navigation gestures.

### E. Keyboard & Input Handling
- [ ] **Keyboard Avoidance:** In full-screen form modals and search drawers, on-screen virtual keyboard appearance does not squish fields or hide active inputs.
- [ ] **Auto-Scroll to Active Input:** Tapping on an input automatically scrolls it into clear view above the virtual keyboard.

### F. Error Prevention & Safety
- [ ] **Destructive Action Isolation:** Destructive operations (`Hapus Orderan`) are visually differentiated with rose/red styling and separated from standard actions.
- [ ] **Double-Submission Prevention:** Action and confirmation buttons disable and display loading states during active Firestore batch writes to prevent duplicate transactions.

### G. Accessibility & Contrast
- [ ] **Color Contrast:** All body text, status badges, and pricing numbers meet or exceed **4.5:1** contrast ratio against their respective light/dark card backgrounds.
- [ ] **Accessible Labels:** Icon-only buttons contain descriptive `aria-label` and `title` attributes.

### H. Multi-Device Viewport Scaling
- [ ] **Small Mobile (360px):** Layout reflows cleanly without horizontal overflow or clipped text.
- [ ] **Standard Mobile (390px – 412px):** Optimized typography and card spacing.
- [ ] **Large Mobile (430px):** Comfortable margin utilization.
- [ ] **Tablet (768px – 1023px):** Side-by-side master-detail tier operates smoothly.
- [ ] **Desktop (≥ 1024px):** Full spreadsheet table view operates completely unchanged.

---

## 11. Implementation Constraints

Strict architectural boundaries to safeguard the codebase during implementation:

1. **Zero Business Logic Modification:**
   - No database schema, Firestore rules, transaction helpers (`db-helpers.ts`), or journal auto-generation logic (`journalAuto.ts`, `period-closing-utils.ts`) may be altered.
   - All mobile components act strictly as presentation layers invoking existing handler callbacks.
2. **Desktop & Tablet Behavior Preservation:**
   - Desktop view (`hidden lg:block`) and Tablet split tier (`hidden md:grid lg:hidden`) must remain 100% untouched and functional.
   - Modifying one screen size must not cause visual or functional regressions on another.
3. **Component & Library Reuse:**
   - Maximize reuse of existing design system utilities and modals (`DateRangePicker.tsx`, `ImagePreviewModal.tsx`, `BookRecommendationsModal.tsx`, `TruncatedTooltip.tsx`).
4. **Zero New External Dependencies (Ponytail Principle):**
   - Strictly prohibit adding new npm packages.
   - All gestures, styling, and icons must rely exclusively on existing packages (`vaul` v1.1.2, `lucide-react`, Tailwind CSS 4, React 19).
5. **Scoped Task Execution:**
   - Scope is restricted strictly to the Sales Order Tab. Do not modify other tabs or shared global layouts outside Sales.



