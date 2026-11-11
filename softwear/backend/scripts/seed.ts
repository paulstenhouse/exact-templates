// Writes seed/catalog.sql from the app's own catalogue (../app/catalog.ts), so the store the
// backend serves is the one the app was drawn for: 46 styles, their stock, and the promo codes.
//
//   bun scripts/seed.ts            # rewrite seed/catalog.sql
//   npm run db:seed:local          # apply it to the local D1
//
// Stock is the same on every empty database: a few sizes sold out, some down to the last
// few, so a product page has something live to say. An order takes from it.
import { CATALOG } from '../../app/catalog.ts';

const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const seeded = (slug: string, size: string) => { const h = hash(`${slug}/${size}`) % 100; return h < 8 ? 0 : h < 28 ? 1 + (h % 3) : 6 + (h % 30); };
const q = (v: unknown) => (typeof v === 'number' ? String(v) : `'${(typeof v === 'string' ? v : JSON.stringify(v)).replaceAll("'", "''")}'`);
const AT = '2026-01-01T00:00:00.000Z', BY = 'system:script-seed';
const audit = `${q(AT)}, ${q(AT)}, ${q(BY)}, ${q(BY)}`;

const out: string[] = ['-- Written by scripts/seed.ts from ../app/catalog.ts. Do not edit; run the script again.'];
CATALOG.forEach((p, i) => {
  out.push(`INSERT OR REPLACE INTO products (id, slug, style, name, category, gender, fabric, weight, fit, description, details, colors, sizes, price_cents, compare_cents, tags, kind, photo, position, created_at, modified_at, created_by, modified_by) VALUES (${[`prod_${p.slug}`, p.slug, p.style, p.name, p.category, p.gender, p.fabric, p.weight, p.fit, p.description, p.details, p.colors, p.sizes, p.priceCents, p.compareCents, p.tags, p.kind, p.photo, i].map(q).join(', ')}, ${audit});`);
});
for (const p of CATALOG) for (const size of p.sizes) {
  out.push(`INSERT OR IGNORE INTO stock (id, product_slug, size, count, created_at, modified_at, created_by, modified_by) VALUES (${[`stock_${p.slug}_${size}`, p.slug, size, seeded(p.slug, size)].map(q).join(', ')}, ${audit});`);
}
for (const [code, pct, once] of [['WELCOME15', 15, 1], ['FLEECE10', 10, 0]] as const) {
  out.push(`INSERT OR IGNORE INTO promoCodes (id, code, pct, once_per_user, active, created_at, modified_at, created_by, modified_by) VALUES (${[`promo_${code}`, code, pct, once, 1].map(q).join(', ')}, ${audit});`);
}
await Bun.write(new URL('../seed/catalog.sql', import.meta.url), out.join('\n') + '\n');
console.log(`seed/catalog.sql: ${CATALOG.length} products, ${CATALOG.reduce((n, p) => n + p.sizes.length, 0)} stock rows, 2 promo codes`);
