#!/usr/bin/env node
/**
 * CSS scope linter.
 *
 * The responsive redesign rests on a claim that is easy to state and easy to
 * break silently: every rule belonging to a sub-desktop tier must live inside a
 * media query that cannot match a desktop viewport. One stray rule outside a
 * media block changes the desktop app.
 *
 * This turns that claim into a check. It parses the built stylesheet, finds
 * every rule whose selector mentions a tier-scoped class, and verifies the
 * enclosing @media chain caps the width at or below the desktop threshold.
 *
 *   node scripts/check-css-scope.cjs [path/to/built.css]
 *
 * Exits non-zero and prints the offending selectors when the claim fails.
 */

const fs = require('fs');
const path = require('path');

/* Classes that must never take effect at >= 1024px. */
const TIER_SCOPED =
  /kbi-(ocard|ocards|orow|olist|sofab|sosheet|sopane|sosplit|sostat|sofoot|rincian--pane|lightbox|fullpage|mtop|mdock|msheet|mtile|mhero|boot|auth|sheet-back|modal-backdrop|modal-panel|modal-head|modal-body)/;

const DESKTOP_MIN = 1024;

const findBuiltCss = () => {
  const dir = path.join(__dirname, '..', 'dist', 'assets');
  if (!fs.existsSync(dir)) return null;
  const hit = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  return hit || null;
};

/**
 * Extracts the max-width ceiling a media query imposes, in px.
 * Returns Infinity when the query places no upper bound.
 */
const ceilingOf = (query) => {
  let ceiling = Infinity;

  /* `(max-width: 767.98px)` and the range form `(width <= 767.98px)` */
  const maxWidth = /max-width\s*:\s*([\d.]+)px|width\s*<=\s*([\d.]+)px/g;
  let m;
  while ((m = maxWidth.exec(query))) {
    ceiling = Math.min(ceiling, parseFloat(m[1] ?? m[2]));
  }

  /* A comma is a disjunction: `A, B` matches if EITHER side matches, so the
     effective ceiling is the loosest branch, not the tightest. */
  if (query.includes(',')) {
    const branches = query.split(',');
    ceiling = Math.max(...branches.map((b) => ceilingOf(b)));
  }
  return ceiling;
};

/**
 * Walks the stylesheet tracking the stack of enclosing at-rule preludes, and
 * reports every tier-scoped selector together with its effective ceiling.
 */
const audit = (css) => {
  const violations = [];
  const stack = [];
  let i = 0;
  let buf = '';

  while (i < css.length) {
    const ch = css[i];

    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';

      if (prelude.startsWith('@')) {
        stack.push(prelude);
      } else {
        /* A style rule. Its ceiling is the tightest of all enclosing media. */
        if (TIER_SCOPED.test(prelude)) {
          let ceiling = Infinity;
          for (const at of stack) {
            if (at.startsWith('@media')) {
              ceiling = Math.min(ceiling, ceilingOf(at.slice(6)));
            }
          }
          if (ceiling >= DESKTOP_MIN) {
            violations.push({
              selector: prelude.length > 120 ? prelude.slice(0, 120) + '…' : prelude,
              ceiling: ceiling === Infinity ? 'none' : ceiling + 'px',
              enclosing: stack.filter((a) => a.startsWith('@media')).join(' / ') || '(top level)',
            });
          }
        }
        /* Skip the declaration body; nested style rules are not expected here. */
        let depth = 1;
        i++;
        while (i < css.length && depth > 0) {
          if (css[i] === '{') depth++;
          else if (css[i] === '}') depth--;
          i++;
        }
        continue;
      }
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else {
      buf += ch;
    }
    i++;
  }
  return violations;
};

const file = process.argv[2] || findBuiltCss();
if (!file || !fs.existsSync(file)) {
  console.error('✗ No built CSS found. Run `npx vite build` first.');
  process.exit(2);
}

const violations = audit(fs.readFileSync(file, 'utf8'));

console.log(`CSS scope linter — ${path.basename(file)}`);
console.log(`  rule: tier-scoped classes must be capped below ${DESKTOP_MIN}px\n`);

if (violations.length === 0) {
  console.log('✓ PASS — no tier-scoped rule can reach a desktop viewport.');
  process.exit(0);
}

console.log(`✗ FAIL — ${violations.length} rule(s) leak to desktop:\n`);
for (const v of violations) {
  console.log(`  ${v.selector}`);
  console.log(`     ceiling: ${v.ceiling}   in: ${v.enclosing}\n`);
}
process.exit(1);
