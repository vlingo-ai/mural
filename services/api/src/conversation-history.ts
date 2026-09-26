import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import { ServiceError } from './errors.js';

const eventIDPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const validText = (value: unknown) => typeof value === 'string' && Boolean(value.trim()) &&
  Buffer.byteLength(value) <= 4_000 && !/[\uD800-\uDFFF]/u.test(value) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);

export type ConversationEventInput = { eventID: string; speaker: 'user' | 'assistant'; text: string; source: 'live' | 'typed' };

export function parseConversationEvent(value: unknown): ConversationEventInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceError('invalid_conversation_event');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['eventID','speaker','text','source'].includes(key)) ||
      typeof body.eventID !== 'string' || !eventIDPattern.test(body.eventID) ||
      !['user','assistant'].includes(String(body.speaker)) || !validText(body.text) ||
      !['live','typed'].includes(String(body.source))) throw new ServiceError('invalid_conversation_event');
  return { eventID: body.eventID, speaker: body.speaker as ConversationEventInput['speaker'],
    text: body.text as string, source: body.source as ConversationEventInput['source'] };
}

export async function appendConversationEvent(db: Database, account: string, sessionID: string, event: ConversationEventInput) {
  const result = await db.query(`INSERT INTO conversation_events(id,session_id,provider_event_id,speaker,text,source)
    SELECT $1,s.id,$4,$5,$6,$7 FROM hosted_sessions s WHERE s.id=$2 AND s.account_id=$3
    ON CONFLICT(session_id,provider_event_id) DO NOTHING RETURNING id,created_at`,
  [randomUUID(), sessionID, account, event.eventID, event.speaker, event.text, event.source]);
  if (result.rowCount) return { accepted: true, duplicate: false, createdAt: (result.rows[0].created_at as Date).toISOString() };
  if (!(await db.query('SELECT 1 FROM hosted_sessions WHERE id=$1 AND account_id=$2', [sessionID, account])).rowCount)
    throw new ServiceError('conversation_not_found', 404);
  const previous = (await db.query(`SELECT speaker,text,source FROM conversation_events
    WHERE session_id=$1 AND provider_event_id=$2`, [sessionID, event.eventID])).rows[0];
  if (!previous || previous.speaker !== event.speaker || previous.text !== event.text || previous.source !== event.source)
    throw new ServiceError('conversation_event_conflict', 409);
  return { accepted: true, duplicate: true };
}

export function parseHistoryPage(value: unknown, sessionID: string): { after: string; limit: number } {
  const query = value as Record<string, unknown>;
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !['cursor', 'limit'].includes(key)))
    throw new ServiceError('invalid_history_page');
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (query.limit !== undefined && (typeof query.limit !== 'string' || !/^[1-9][0-9]*$/.test(query.limit))))
    throw new ServiceError('invalid_history_page');
  if (query.cursor === undefined) return { after: '0', limit };
  if (typeof query.cursor !== 'string' || query.cursor.length > 128 || !/^[A-Za-z0-9_-]+$/.test(query.cursor))
    throw new ServiceError('invalid_history_page');
  const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
  const [version, owner, after, extra] = decoded.split(':');
  if (version !== '1' || owner !== sessionID || extra !== undefined || after === undefined || !/^(0|[1-9][0-9]{0,18})$/.test(after) ||
      BigInt(after) > 9223372036854775807n || Buffer.from(decoded).toString('base64url') !== query.cursor)
    throw new ServiceError('invalid_history_page');
  return { after, limit };
}

export async function conversationEventsPage(db: Database, account: string, sessionID: string, query: unknown) {
  const { after, limit } = parseHistoryPage(query, sessionID);
  if (!(await db.query('SELECT 1 FROM hosted_sessions WHERE id=$1 AND account_id=$2', [sessionID, account])).rowCount)
    throw new ServiceError('conversation_not_found', 404);
  const rows = (await db.query(`SELECT provider_event_id,speaker,text,source,created_at,position
    FROM conversation_events WHERE session_id=$1 AND position>$2::bigint ORDER BY position LIMIT $3`,
  [sessionID, after, limit + 1])).rows;
  const page = rows.slice(0, limit);
  const position = page.at(-1)?.position ?? after;
  return { events: page.map(row => ({ eventID: row.provider_event_id as string, speaker: row.speaker as string,
    text: row.text as string, source: row.source as string, createdAt: (row.created_at as Date).toISOString() })),
  nextCursor: Buffer.from(`1:${sessionID}:${position}`).toString('base64url'), hasMore: rows.length > limit };
}

export async function listConversations(db: Database, account: string, limit = 20) {
  const rows = (await db.query(`SELECT s.id,s.language,s.state,s.created_at,s.deadline,
    (SELECT e.text FROM conversation_events e WHERE e.session_id=s.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS preview,
    (SELECT count(*)::int FROM conversation_events e WHERE e.session_id=s.id) AS event_count,
    (SELECT count(*)::int FROM conversation_learning_results r WHERE r.session_id=s.id) AS result_count
    FROM hosted_sessions s WHERE s.account_id=$1 ORDER BY s.created_at DESC,s.id DESC LIMIT $2`, [account, limit])).rows;
  return { conversations: rows.map(row => ({ id: row.id as string, language: row.language as string | null,
    state: row.state as string, createdAt: (row.created_at as Date).toISOString(), deadline: (row.deadline as Date).toISOString(),
    preview: row.preview as string | null, eventCount: Number(row.event_count), resultCount: Number(row.result_count) })) };
}

export async function conversationDetail(db: Database, account: string, sessionID: string) {
  const session = (await db.query(`SELECT id,language,state,created_at,deadline,observed_ms,charged_ms
    FROM hosted_sessions WHERE id=$1 AND account_id=$2`, [sessionID, account])).rows[0];
  if (!session) throw new ServiceError('conversation_not_found', 404);
  const events = (await db.query(`SELECT provider_event_id,speaker,text,source,created_at FROM conversation_events
    WHERE session_id=$1 ORDER BY created_at,id`, [sessionID])).rows;
  const results = (await db.query(`SELECT kind,result,created_at FROM conversation_learning_results
    WHERE session_id=$1 ORDER BY created_at,id`, [sessionID])).rows;
  return { id: session.id as string, language: session.language as string | null, state: session.state as string,
    createdAt: (session.created_at as Date).toISOString(), deadline: (session.deadline as Date).toISOString(),
    observedMilliseconds: Number(session.observed_ms), chargedMilliseconds: session.charged_ms === null ? null : Number(session.charged_ms),
    events: events.map(row => ({ eventID: row.provider_event_id as string, speaker: row.speaker as string,
      text: row.text as string, source: row.source as string, createdAt: (row.created_at as Date).toISOString() })),
    results: results.map(row => ({ kind: row.kind as string, result: row.result as unknown,
      createdAt: (row.created_at as Date).toISOString() })) };
}

export async function recordLearningResult(db: Database, account: string, sessionID: string, key: string,
  kind: 'translation' | 'assessment' | 'teachingReply' | 'topicSearch', result: Record<string, unknown>): Promise<void> {
  const inserted = await db.query(`INSERT INTO conversation_learning_results(id,session_id,idempotency_key,kind,result)
    SELECT $1,s.id,$4,$5,$6::jsonb FROM hosted_sessions s WHERE s.id=$2 AND s.account_id=$3
    ON CONFLICT(session_id,idempotency_key) DO NOTHING`, [randomUUID(), sessionID, account, key, kind, JSON.stringify(result)]);
  if (!inserted.rowCount && !(await db.query('SELECT 1 FROM hosted_sessions WHERE id=$1 AND account_id=$2', [sessionID, account])).rowCount)
    throw new ServiceError('conversation_not_found', 404);
}
