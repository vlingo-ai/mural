#!/usr/bin/env python3
"""Read docker logs on stdin; emit counters only, never raw records or identifiers."""
import collections
import datetime as dt
import json
import sys

EVENTS = frozenset((
    'request_completed', 'request_failed', 'provider_completed', 'provider_failed',
    'voice_active', 'voice_close_requested', 'voice_closed', 'voice_connection_lost',
    'voice_watchdog_failed', 'voice_hangup_failed', 'background_failed',
    'service_started', 'service_failed', 'conversation_request_failed',
))


def summarize(lines):
    events = collections.Counter()
    seen = {}
    unknown = invalid = duplicates = 0
    first = last = None
    for line in lines:
        # --timestamps prefixes the diagnostic JSON with a Docker timestamp.
        raw = line.strip()
        if not raw.startswith('{'):
            raw = raw.partition(' ')[2]
        try:
            record = json.loads(raw)
        except (ValueError, TypeError):
            invalid += 1
            continue
        if not isinstance(record, dict) or record.get('event') not in EVENTS:
            unknown += 1
            continue
        try:
            timestamp = dt.datetime.fromisoformat(record['timestamp'].replace('Z', '+00:00'))
            if timestamp.tzinfo is None:
                raise ValueError('naive timestamp')
        except (KeyError, AttributeError, ValueError, TypeError):
            invalid += 1
            continue
        first = timestamp if first is None else min(first, timestamp)
        last = timestamp if last is None else max(last, timestamp)
        event = record['event']
        events[event] += 1
        if event not in ('request_completed', 'request_failed'):
            continue
        status = record.get('status')
        reference = record.get('reference')
        if (not isinstance(reference, str) or len(reference) != 12
                or any(c not in '0123456789abcdef' for c in reference)
                or type(status) is not int or not 100 <= status <= 599):
            raise ValueError('invalid request diagnostic')
        entry = (event, status, record.get('operation') == 'GET /healthz')
        if reference in seen:
            if seen[reference] != entry:
                raise ValueError('conflicting request diagnostics')
            duplicates += 1
        seen[reference] = entry

    def group(rows):
        total = len(rows)
        errors = sum(status >= 400 for _, status, _ in rows)
        return dict(requests=total, http_4xx=sum(400 <= s < 500 for _, s, _ in rows),
                    http_5xx=sum(s >= 500 for _, s, _ in rows),
                    handler_failures=sum(e == 'request_failed' for e, _, _ in rows),
                    http_error_rate=errors / total if total else None)

    return dict(scope='API diagnostics in the caller-specified Docker log window; not Worker, Gateway, browser or media error rate',
                first_event_utc=first.isoformat() if first else None,
                last_event_utc=last.isoformat() if last else None,
                events=dict(events), all_requests=group(list(seen.values())),
                excluding_health=group([row for row in seen.values() if not row[2]]),
                duplicate_request_records=duplicates, unparsed_lines=invalid,
                unrecognized_records=unknown)


if __name__ == '__main__':
    try:
        result = summarize(sys.stdin)
        print(json.dumps(result, indent=2))
        if result['all_requests']['requests'] == 0:
            print('No usable request denominator; do not claim a zero error rate.', file=sys.stderr)
            sys.exit(2)
    except (ValueError, TypeError):
        print('Invalid/conflicting diagnostics; no raw records exported.', file=sys.stderr)
        sys.exit(2)
