/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE PRESENTATION LAYER  ·  KangenBukuIndo ERP
   ───────────────────────────────────────────────────────────────────────────
   A DOM-level enhancer that re-presents desktop markup as mobile-native UI.

   It writes ONLY presentational data-* attributes. It never reads app state,
   never dispatches events, never mutates text, never reorders nodes. Every
   behaviour — sorting, editing, submitting — stays exactly where it was.

   What it does, and why each part exists:

     1. TABLE → CARD        Reads each table's <thead> and stamps the column
                            name onto every <td> as data-kbi-label. CSS then
                            unfolds the row into a vertical card, which is what
                            kills horizontal scrolling for good.

     2. FIGURE DETECTION    Cells that read as numbers get data-kbi-num so the
                            stylesheet can switch them to Inter + tabular
                            figures, per the type spec.

     3. ROLE DETECTION      Identifies the row's headline cell, its action
                            cluster, and its empty cells so the card has a real
                            hierarchy instead of a flat list of key/value pairs.

     4. SHEET DEPTH         Numbers the open modals so the stylesheet can push
                            the first one up from the bottom and slide deeper
                            ones in from the right, iOS-style.

   Everything is inert above 768px — the observer never even starts.
   ═══════════════════════════════════════════════════════════════════════════ */

const MOBILE_QUERY = '(max-width: 767.98px)';

/* Attribute names are namespaced so they can never collide with app data-*. */
const A = {
  cards: 'data-kbi-cards',
  label: 'data-kbi-label',
  num: 'data-kbi-num',
  primary: 'data-kbi-primary',
  actions: 'data-kbi-actions',
  empty: 'data-kbi-empty',
  full: 'data-kbi-full',
  control: 'data-kbi-control',
  depth: 'data-kbi-depth',
  index: 'data-kbi-index',
} as const;

/* ── Cell classification ──────────────────────────────────────────────────── */

/**
 * True when a cell reads as a figure rather than prose: money, quantities,
 * dates, percentages, codes. Tolerates currency marks and short unit suffixes
 * ("NT$ 12.500", "1,204 pcs", "2026/08/05", "-3,5%").
 */
const readsAsFigure = (text: string): boolean => {
  const t = text.trim();
  if (!t || t.length > 24) return false;

  let digits = 0;
  let letters = 0;
  for (const ch of t) {
    if (ch >= '0' && ch <= '9') digits++;
    else if (/\p{L}/u.test(ch)) letters++;
  }
  return digits > 0 && letters <= 3;
};

/** Collapses all whitespace away so JSX indentation can't skew a comparison. */
const dense = (s: string): string => s.replace(/\s+/g, '');

/** A cell whose entire content is interactive — buttons, links, icon triggers. */
const isActionCell = (cell: HTMLTableCellElement): boolean => {
  const triggers = cell.querySelectorAll('button, a[href], [role="button"]');
  if (triggers.length === 0) return false;
  /* Text belonging to the triggers themselves isn't cell content. Compare with
     whitespace removed — the markup is indented, the rendered text is not. */
  const own = dense(cell.textContent || '');
  const inside = triggers.length
    ? dense(Array.from(triggers).map((t) => t.textContent || '').join(''))
    : '';
  return own.length - inside.length <= 2;
};

/** A cell that exists to hold a checkbox / radio / drag handle, not data. */
const isControlCell = (cell: HTMLTableCellElement): boolean => {
  if ((cell.textContent || '').trim()) return false;
  return !!cell.querySelector('input[type="checkbox"], input[type="radio"]');
};

/** Visually empty: no text, no controls, no imagery. */
const isEmptyCell = (cell: HTMLTableCellElement): boolean => {
  if ((cell.textContent || '').trim()) return false;
  return !cell.querySelector('input, select, textarea, button, a, img, svg');
};

/* ── Table enhancement ────────────────────────────────────────────────────── */

/**
 * Flattens a header row into a per-column label list, expanding colspans so
 * column N of a body row always lines up with label N.
 */
const readColumnLabels = (table: HTMLTableElement): string[] => {
  const head = table.tHead;
  if (!head) return [];

  /* The last header row carries the leaf column names when headers are tiered. */
  const rows = Array.from(head.rows);
  const row = rows[rows.length - 1];
  if (!row) return [];

  const labels: string[] = [];
  for (const cell of Array.from(row.cells)) {
    const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    const span = cell.colSpan || 1;
    for (let i = 0; i < span; i++) labels.push(text);
  }
  return labels;
};

const enhanceTable = (table: HTMLTableElement) => {
  const labels = readColumnLabels(table);

  /* A table with no header can't be labelled, but it still must not scroll —
     it becomes a plain stack rather than a labelled card. */
  table.setAttribute(A.cards, labels.length ? 'labelled' : 'plain');

  const bodies = table.tBodies.length
    ? Array.from(table.tBodies)
    : ([] as HTMLTableSectionElement[]);

  for (const body of bodies) {
    for (const row of Array.from(body.rows)) {
      /* Only touch rows belonging to THIS table — nested tables enhance
         themselves on their own pass. */
      if (row.closest('table') !== table) continue;

      const cells = Array.from(row.cells) as HTMLTableCellElement[];

      /* A single full-width cell is a message row ("no data", totals note):
         render it as a standalone notice, not as a card. */
      if (cells.length === 1 && (cells[0].colSpan || 1) > 1) {
        cells[0].setAttribute(A.full, '');
        row.setAttribute(A.full, '');
        continue;
      }
      row.removeAttribute(A.full);

      let column = 0;
      let headlineAssigned = false;

      for (const cell of cells) {
        const label = labels[column] || '';
        column += cell.colSpan || 1;

        cell.removeAttribute(A.primary);
        cell.removeAttribute(A.actions);
        cell.removeAttribute(A.empty);
        cell.removeAttribute(A.control);
        cell.removeAttribute(A.num);
        cell.removeAttribute(A.full);

        if (isControlCell(cell)) {
          cell.setAttribute(A.control, '');
          continue;
        }
        if (isEmptyCell(cell)) {
          cell.setAttribute(A.empty, '');
          continue;
        }
        if (isActionCell(cell)) {
          cell.setAttribute(A.actions, '');
          continue;
        }

        const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();

        /* The first substantive cell becomes the card headline: shown large,
           without a label, because it identifies the record. */
        if (!headlineAssigned && text) {
          cell.setAttribute(A.primary, '');
          headlineAssigned = true;
        } else if (label) {
          cell.setAttribute(A.label, label);
        }

        if (readsAsFigure(text)) cell.setAttribute(A.num, '');
      }
    }
  }
};

/* ── Sheet depth ──────────────────────────────────────────────────────────── */

/**
 * Numbers every open dialog by stacking order. Depth 0 rises from the bottom;
 * deeper sheets push in from the right so a nested dialog reads as a forward
 * step in a stack rather than a second layer of blur.
 *
 * Ordered by z-index rather than document order: a dialog opened on top of
 * another is frequently written earlier in the JSX (the confirm dialogs sit
 * near the end of the file but carry z-[60] or z-[100]). Numbering by document
 * position would hand depth 0 to whichever happens to be declared first and
 * play the two entrances backwards.
 */
const markSheetDepth = (root: ParentNode) => {
  const backdrops = Array.from(root.querySelectorAll('.kbi-modal-backdrop'));

  const stackOrder = backdrops
    .map((el, docIndex) => {
      const z = parseInt(window.getComputedStyle(el).zIndex, 10);
      return { el, z: Number.isNaN(z) ? 0 : z, docIndex };
    })
    /* Document order breaks ties, so equal z-index keeps mount sequence. */
    .sort((a, b) => a.z - b.z || a.docIndex - b.docIndex);

  stackOrder.forEach(({ el }, i) => {
    el.setAttribute(A.depth, String(i));
    el.setAttribute(A.index, String(stackOrder.length));
  });
};

/* ── Runner ───────────────────────────────────────────────────────────────── */

const sweep = () => {
  const tables = document.querySelectorAll<HTMLTableElement>('table');
  tables.forEach(enhanceTable);
  markSheetDepth(document);
};

export const initMobilePresentation = (): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};

  const mql = window.matchMedia(MOBILE_QUERY);
  let observer: MutationObserver | null = null;
  let frame = 0;

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      sweep();
    });
  };

  const start = () => {
    if (observer) return;
    document.documentElement.setAttribute('data-kbi-mobile', '');
    sweep();

    /* childList + characterData only. Attributes are deliberately NOT watched,
       so the attributes written above can never re-trigger this observer. */
    observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  const stop = () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    observer?.disconnect();
    observer = null;
    document.documentElement.removeAttribute('data-kbi-mobile');
    /* Leave the data-* attributes in place: they are inert above 768px because
       no desktop rule ever selects them, and clearing them would cost a full
       DOM walk on every resize. */
  };

  const onChange = () => (mql.matches ? start() : stop());

  onChange();
  mql.addEventListener('change', onChange);

  return () => {
    mql.removeEventListener('change', onChange);
    stop();
  };
};
