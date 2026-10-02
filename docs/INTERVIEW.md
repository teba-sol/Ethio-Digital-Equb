# Interview Prep — Sahil: Ekub Ledger

## The 60-second pitch

"I built Sahil, an offline-first book-of-record app for Ekub — the rotating savings association common in Ethiopia. The problem it solves: Ekub leaders track contributions in notebooks, and when records are lost or contested, trust breaks down. Sahil captures who paid, who received, and who owes whom as an append-only event log — so disputes are answered from a timestamped record, not from memory. The technical core is event-sourced: balances are never stored, they're derived from events by a pure function. This means corrections are just events that reverse prior events, the ledger is provably consistent, and the whole system works offline on a leader's phone."

## The story arc (for a 5–10 minute walkthrough)

### 1. Start with the problem (30 seconds)
- Ekub groups run on trust and memory
- Leaders use notebooks or their heads
- When records are lost: disputes, broken trust, group collapses
- The app exists to make the book defensible

### 2. Show the demo (3–4 minutes)
Walk through this exact sequence:

1. **Dashboard** → create group "Meseret Ekub", 500 ETB weekly
2. **Add members** → Abebe, Belaynesh, Chaltu, Dawit (4 is enough for demo)
3. **Create cycle** → tap-to-order payout positions
4. **Record → Contribution** → mark everyone paid for Period 1
5. **Record → Payout** → Abebe receives 2,000 ETB (4 × 500)
6. **Record → Contribution** → Chaltu misses Period 2
7. **Record → Cover** → Belaynesh covers Chaltu → debt created
8. **Record → Payout** → Belaynesh receives the pot
9. **Record → Payout** (Period 3) → Chaltu receives; **watch the debt settle automatically** — payout shows itemized deduction to Belaynesh
10. **History** → full event chain with timestamps, invariant badge "✓ Ledger balances"
11. **Settings → Export** → download checksummed JSON backup

### 3. Explain the architecture (2 minutes)
- **Event sourcing**: every mutation is an append-only event. No UPDATE, no DELETE.
- **Derived balances**: `derive(events)` is the only place balances exist. UI never computes a sum.
- **Corrections as events**: wrong entry → append a `correction` event that reverses the original. The corrected event stays visible. Corrections can themselves be corrected.
- **Integer money**: all amounts in santim (1 ETB = 100 santim). No floats — avoids the classic floating-point drift bug in financial sums.
- **Offline-first**: Dexie/IndexedDB is the source of truth. Server is a backup replica. Works in a room with no signal.

### 4. Discuss tradeoffs (1 minute)
- "I chose event sourcing over CRUD because the domain demands an audit trail — every dispute answer needs a timestamp."
- "I chose integers over floats because DOMAIN.md requires SUM(debits) == SUM(credits) exactly — floats make that impossible to guarantee."
- "I chose a pure derivation function over stored balances because stored balances go stale, and a stale balance in a dispute is worse than no balance."
- "What I'd do differently in v2: member self-service, real auth (currently single-user by design), multi-device sync (currently one writer to one replica)."

## Key technical talking points

### Event sourcing
- "The ledger is a list of events, not a mutable table. You can replay any point in time."
- "Corrections compose for free — a correction is just another event, so derivation handles correction chains without special logic."
- "The invariant (SUM debits == SUM credits) is provable because every event is balanced by construction."

### Domain modeling
- "I extracted the business rules from DOMAIN.md into pure functions in `rules.ts`. The derive engine is ~400 lines and fully unit-tested."
- "The 8-member cycle fixture proves the full DoD: cycle completes, balances to zero, debt settles at payout."

### Offline-first
- "Every write path touches only IndexedDB. The network is contacted after the fact, never during a write."
- "Sync uses idempotent push — UUID v7 event IDs generated on-device mean pushing twice is a no-op."
- "Export is versioned and checksummed (SHA-256) — a backup format is a compatibility promise."

### Testing
- "46 unit tests, all pure — no DOM, no network. The ledger core is testable in milliseconds."
- "The 8-member fixture is the acceptance test: it proves the full cycle balances to zero, covers create debts, and debts settle at payout."

## Likely questions and answers

**Q: Why not just use a database with balances?**
A: Stored balances go stale — any bug in the write path corrupts them silently. Derived balances are always correct because they're recomputed from the source of truth. The cost is re-derivation on read, but at ~30 members and one cycle, that's sub-millisecond.

**Q: How do you handle corrections without breaking the audit trail?**
A: A correction is itself an append-only event. It references the original by ID, states a reason, and carries an optional replacement. The original stays visible. Nothing is ever deleted or edited.

**Q: What happens if two devices try to sync?**
A: v1 is designed for one writer (one leader, one device). The server is a replica, not an authority. Multi-device sync is a v2 concern — it changes sync from a transport problem into a conflict-resolution problem.

**Q: How do you know the ledger is correct?**
A: The invariant checker runs `checkInvariants(events)` at any time. It verifies: member net positions sum to zero, no member received multiple payouts, no negative debts, no negative pot payouts. The UI shows a green badge when all checks pass.

**Q: What's the hardest part you solved?**
A: Correction chains. The elegant solution was making corrections just events — once you realize that, the derivation engine doesn't need special "skip corrected events" logic. Applying every event in order (originals, then corrections that reverse them) means the math works out automatically.

**Q: Why Prisma + Postgres for sync, when you could just use the device?**
A: The device is the source of truth. Postgres is a backup replica — it exists so the ledger survives device loss. The server never computes balances; it just stores events. This keeps the architecture simple: one writer, one replica, no conflicts.

**Q: What would you add next?**
A: Member self-service (v2 in the PRD), real authentication (currently single-user by design), multi-device sync, SMS reminders. The architecture is ready for all of these — the event log and derivation engine don't change.

## File map (for "show me the code" moments)

| File | What it does |
|------|-------------|
| `src/lib/ledger/events.ts` | Zod schemas for all 11 event types |
| `src/lib/ledger/derive.ts` | The engine — events → balances (pure function) |
| `src/lib/ledger/rules.ts` | Business rules 1–7 as pure functions |
| `src/lib/ledger/invariants.ts` | Balance checks, runnable anytime |
| `src/lib/ledger/construct.ts` | Event builders with validation |
| `src/db/queries.ts` | Write guards (no double-record, roster checks) |
| `src/lib/export/build.ts` | Versioned, checksummed backup |
| `src/app/api/sync/route.ts` | Idempotent push/pull endpoint |
| `tests/fixtures/eight-member-cycle.ts` | Full DoD acceptance fixture |

## What to emphasize about your strengths

1. **Domain modeling** — you extracted locked business rules into pure, testable functions
2. **Event sourcing** — you chose an architecture that matches the domain's audit requirements
3. **Offline-first** — you designed for the real usage context (a meeting room with no signal)
4. **Correctness** — integer money, invariant checking, idempotent sync, 46 unit tests
5. **Pragmatism** — single-user by design, server as replica not authority, clear v2 deferrals
6. **Documentation** — DOMAIN.md, PRD.md, ARCHITECTURE.md all trace to code decisions
