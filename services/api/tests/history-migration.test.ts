import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { connectDatabase } from '../src/db.js';

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith('_test')) throw new Error('Dedicated test database required.');
test('history cursor backfills old rows and enforces restricted runtime grants', { skip: !url }, async () => {
  const db = connectDatabase(url!);
  const name = `history_migration_${randomUUID().replaceAll('-', '')}`;
  const role = `${name}_role`;
  const sql = await db.connect();
  try {
    await sql.query(`CREATE SCHEMA ${name}`);
    await sql.query(`SET search_path=${name}`);
    // Minimal parent required by the real pre-cursor history migration.
    await sql.query('CREATE TABLE hosted_sessions(id uuid PRIMARY KEY,state text NOT NULL)');
    await sql.query(await readFile(new URL('../migrations/025_conversation_history.sql', import.meta.url), 'utf8'));
    const session = randomUUID(), other = randomUUID();
    await sql.query("INSERT INTO hosted_sessions(id,state) VALUES($1,'closed'),($2,'closed')", [session, other]);
    const insert = `INSERT INTO conversation_events(id,session_id,provider_event_id,speaker,text,source,created_at)
      VALUES($1,$2,$3,'user','Synthetic migration fixture','live',$4)`;
    await sql.query(insert, ['00000000-0000-4000-8000-000000000002', session, 'second', '2026-01-01']);
    await sql.query(insert, ['00000000-0000-4000-8000-000000000001', session, 'first', '2026-01-01']);
    await sql.query(insert, [randomUUID(), other, 'separate', '2026-01-01']);
    await sql.query(await readFile(new URL('../migrations/030_history_cursor.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await sql.query('SELECT provider_event_id,position FROM conversation_events WHERE session_id=$1 ORDER BY position',
      [session])).rows, [{ provider_event_id: 'first', position: '1' }, { provider_event_id: 'second', position: '2' }]);
    assert.equal((await sql.query('SELECT history_sequence FROM hosted_sessions WHERE id=$1', [other])).rows[0].history_sequence, '1');
    await sql.query(`CREATE ROLE ${role} NOLOGIN`);
    await sql.query(`GRANT USAGE ON SCHEMA ${name} TO ${role}`);
    await sql.query(`GRANT SELECT ON hosted_sessions TO ${role}`);
    await sql.query(`GRANT SELECT,INSERT,DELETE ON conversation_events,conversation_learning_results TO ${role}`);
    await sql.query(`SET ROLE ${role}`);
    await assert.rejects(sql.query(insert, [randomUUID(), session, 'denied', '2026-01-02']), { code: '42501' });
    await sql.query('RESET ROLE');
    const grants = await readFile(new URL('../operations/conversation-history-runtime-grants.sql', import.meta.url), 'utf8');
    await sql.query(grants.replaceAll('mural_runtime', role));
    await sql.query(`SET ROLE ${role}`);
    await sql.query(insert, [randomUUID(), session, 'after-migration', '2026-01-02']);
    assert.equal((await sql.query('SELECT position FROM conversation_events WHERE session_id=$1 AND provider_event_id=$2',
      [session, 'after-migration'])).rows[0].position, '3');
    await assert.rejects(sql.query("UPDATE hosted_sessions SET state='active' WHERE id=$1", [session]), { code: '42501' });
  } finally {
    await sql.query('RESET ROLE');
    await sql.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await sql.query(`DROP ROLE IF EXISTS ${role}`);
    sql.release(); await db.end();
  }
});
