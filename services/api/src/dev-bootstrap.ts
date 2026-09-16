import { digest } from './auth.js';
import { connectDatabase, transaction } from './db.js';
import { appendMinuteEntry } from './minutes.js';

const databaseURL = process.env.DATABASE_URL ?? '', account = process.env.MURAL_DEV_ACCOUNT_ID ?? '', token = process.env.MURAL_DEV_ACCESS_TOKEN ?? '';
const url = new URL(databaseURL);
if (process.env.MURAL_DEV_BOOTSTRAP !== 'true' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
    !url.pathname.endsWith('_dev') || !/^[a-f0-9-]{36}$/.test(account) || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
  console.error('Development bootstrap requires a loopback *_dev database and explicit development credentials.'); process.exit(1);
}
const db = connectDatabase(databaseURL);
try {
  await transaction(db, async sql => {
    await sql.query("INSERT INTO accounts(id,email) VALUES($1,'local@mural.invalid') ON CONFLICT(id) DO UPDATE SET deleted_at=NULL", [account]);
    await sql.query('INSERT INTO wallets(account_id) VALUES($1) ON CONFLICT DO NOTHING', [account]);
    await sql.query('DELETE FROM auth_sessions WHERE account_id=$1', [account]);
    await sql.query("INSERT INTO auth_sessions(id,account_id,token_hash,expires_at) VALUES(gen_random_uuid(),$1,$2,now()+interval '12 hours')", [account, digest(token)]);
    await appendMinuteEntry(sql, account, `local-dev-gift:${account}`, 'gift', 600_000, 0, 'funded');
  });
  console.info('Local development account and ten conversation minutes are ready.');
} finally { await db.end(); }
