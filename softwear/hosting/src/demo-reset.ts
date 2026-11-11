import catalogue from '../../backend/seed/catalog.sql?raw';
import authSeed from '../../.deploy/demo-auth.json';
import { authResetStatements, featureResetStatements } from './demo-data';

export async function resetDemo(db: D1Database, auth: D1Database): Promise<void> {
  // Each database batch is atomic. Neither migrations nor non-demo auth accounts
  // are removed. Demo sessions survive the reset so browsing can continue.
  await auth.batch(authResetStatements(authSeed.hash).map((sql) => auth.prepare(sql)));
  await db.batch(featureResetStatements(catalogue).map((sql) => db.prepare(sql)));
  console.log(JSON.stringify({ event: 'softwear_demo_reset', status: 'complete' }));
}
