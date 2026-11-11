// Intentionally public credentials for this disposable flagship only.
export const demoAccounts = [
  { id: 'softwear-demo-shopper', email: 'shopper@quickback.dev', name: 'Demo Shopper', role: 'user' },
  { id: 'softwear-demo-admin', email: 'admin@quickback.dev', name: 'Demo Shop Admin', role: 'sysadmin' },
];
export const demoPassword = 'SoftwearDemo2026!';

export function featureResetStatements(catalogue: string): string[] {
  // Seed generator emits one complete INSERT statement per line; don't split on
  // semicolons inside product descriptions. Reject unexpected seed structure.
  const lines = catalogue.split('\n').filter((line) => line.trim() && !line.startsWith('--'));
  if (!lines.length || lines.some((line) => !/^INSERT OR (REPLACE|IGNORE) INTO (products|stock|promoCodes) .+;$/.test(line))) throw new Error('Unexpected catalogue seed format');
  return [
    ...['orderLines', 'orders', 'promoRedemptions', 'bagItems', 'savedStyles', 'restockRequests', 'subscribers', 'stock', 'products', 'promoCodes', 'custom_view', 'idempotency_keys'].map((table) => `DELETE FROM "${table}"`),
    ...lines.map((line) => line.slice(0, -1)),
    `INSERT INTO subscribers (id,email,created_at,modified_at,created_by,modified_by) VALUES ('demo-subscriber','fan@example.test',datetime('now'),datetime('now'),'system:demo-reset','system:demo-reset')`,
    `INSERT INTO restockRequests (id,email,product_slug,created_at,modified_at,created_by,modified_by) VALUES ('demo-restock','fan@example.test','challenger-eco-fleece-hoodie',datetime('now'),datetime('now'),'system:demo-reset','system:demo-reset')`,
    `INSERT INTO bagItems (id,owner_id,product_slug,color,size,qty,created_at,modified_at,created_by,modified_by) VALUES ('demo-bag','softwear-demo-shopper','challenger-eco-fleece-hoodie','Eco True Black','M',1,datetime('now'),datetime('now'),'system:demo-reset','system:demo-reset')`,
    `INSERT INTO orders (id,owner_id,number,status,email,ship_name,ship_address,ship_city,ship_zip,subtotal_cents,discount_cents,shipping_cents,total_cents,placed_at,created_at,modified_at,created_by,modified_by) VALUES ('demo-order','softwear-demo-shopper','SW-DEMO-1001','placed','shopper@quickback.dev','Demo Shopper','123 Example Street','Example City','00000',7400,0,0,7400,datetime('now'),datetime('now'),datetime('now'),'system:demo-reset','system:demo-reset')`,
    `INSERT INTO orderLines (id,owner_id,order_number,product_slug,name,color,size,qty,price_cents,created_at,modified_at,created_by,modified_by) VALUES ('demo-order-line','softwear-demo-shopper','SW-DEMO-1001','challenger-eco-fleece-hoodie','Challenger Eco-Fleece Hoodie','Eco True Black','M',1,7400,datetime('now'),datetime('now'),'system:demo-reset','system:demo-reset')`,
    `CREATE TABLE IF NOT EXISTS demo_reset_state (id INTEGER PRIMARY KEY CHECK(id=1), reset_at TEXT NOT NULL)`,
    `INSERT OR REPLACE INTO demo_reset_state VALUES (1,datetime('now'))`,
  ];
}

export function authResetStatements(hash: string): string[] {
  if (!/^[a-f0-9]+:[a-f0-9]+$/.test(hash)) throw new Error('Unexpected Better Auth password hash');
  return [...demoAccounts.flatMap((account) => [
    `INSERT INTO user (id,name,email,email_verified,role,updated_at) VALUES ('${account.id}','${account.name}','${account.email}',1,'${account.role}',unixepoch()*1000) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,email_verified=1,role=excluded.role,banned=0,ban_reason=NULL,ban_expires=NULL,updated_at=excluded.updated_at`,
    `INSERT INTO account (id,account_id,provider_id,user_id,password,updated_at) VALUES ('${account.id}-password','${account.id}','credential','${account.id}','${hash}',unixepoch()*1000) ON CONFLICT(id) DO UPDATE SET password=excluded.password,updated_at=excluded.updated_at`,
  ]),
    `INSERT INTO organization (id,name,slug,created_at) VALUES ('softwear-demo-store','Softwear demo','softwear-demo',unixepoch()*1000) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug`,
    `INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ('softwear-demo-admin-membership','softwear-demo-store','softwear-demo-admin','owner',unixepoch()*1000) ON CONFLICT(id) DO UPDATE SET organization_id=excluded.organization_id,user_id=excluded.user_id,role=excluded.role`,
  ];
}
