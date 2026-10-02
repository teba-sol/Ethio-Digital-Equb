# Sahil — Ekub Ledger

**The book of record for an Ekub group.** Sahil captures who paid, who received, and who owes whom — so every dispute is answered from a timestamped record, not from memory.

Ekub (also called Equb or ROSCA) is a rotating savings association common across Ethiopia and the Horn of Africa. Members contribute a fixed amount each period; one member receives the entire pot each period until everyone has received once. The association works because of trust — and trust breaks down when records are lost or contested.

Sahil does not hold, move, or enforce money. It is the group's ledger.

## What it does

| Feature | Description |
|---------|-------------|
| **Setup** | Create a group, add members, define a cycle with locked payout order |
| **Contributions** | Record paid and missed contributions per member per period |
| **Covers** | When one member pays for another, a debt is created (Rule 1) |
| **Payouts** | Give the pot to the next member — debts settle automatically with itemized deductions (Rule 4) |
| **Exits** | Members can leave before payout with FULL/HALF/NO_REFUND settlement (Rules 2, 5) |
| **Defaults** | Record post-payout non-payment (Rule 2b) |
| **Corrections** | Fix wrong entries without deleting anything — corrections are events, not edits (L16) |
| **Debt ledger** | See who owes whom, what's settled, what's written off |
| **History** | Full append-only event log with invariant checking |
| **Offline-first** | Works with no connectivity; data lives on-device in IndexedDB |
| **Backup export** | Versioned, SHA-256-checksummed JSON export |
| **Sync** | Idempotent push/pull to a server replica (optional) |

## Tech stack

- **Next.js 16** (App Router) — UI and API in one codebase
- **React 19** + **Tailwind CSS v4**
- **Dexie (IndexedDB)** — local-first source of truth
- **Zod** — runtime validation, shared client/server schemas
- **Prisma 7** + PostgreSQL — server backup replica
- **Vitest** — unit tests for the ledger core
- **PWA** — installable, works offline

## Architecture in one paragraph

Every mutation is an **append-only event**. Balances are never stored — they're **derived** from the event log by a pure function (`derive.ts`). This means corrections are just events that reverse prior events, the ledger can be re-derivable from scratch, and the system-level invariant (SUM debits == SUM credits) is provable. Money is stored as **integers in santim** (1 ETB = 100 santim) to avoid floating-point drift.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo script (for interviews)

1. **Create a group** — name it, set amount (e.g. 500 ETB weekly)
2. **Add 4–8 members** — names are enough
3. **Create a cycle** — set payout order by tapping members
4. **Record contributions** — mark everyone paid for Period 1
5. **Record a payout** — the next member receives the pot
6. **Record a cover** — one member misses, another covers
7. **Record the covered member's payout** — watch the debt settle automatically
8. **View History** — the full event chain with timestamps
9. **Export** — download a checksummed backup from Settings

### Tests

```bash
npm test
```

46 unit tests covering the ledger engine, rules, corrections, and a full 8-member cycle fixture that proves the cycle balances to zero.

### Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (for server sync backup) |
| `EKUB_SYNC_SECRET` | Shared secret for sync auth (`X-Ekub-Secret` header) |

Both are optional for local-only use. The app works fully offline without them.

## Project structure

```
docs/
  DOMAIN.md          Business rules (locked) — source of truth
  PRD.md             Product requirements
  ARCHITECTURE.md    Technical decisions and tradeoffs
src/
  lib/ledger/        THE DOMAIN CORE — pure functions, zero I/O
    events.ts        Zod schemas for all event types
    types.ts         Derived TS types + view shapes
    rules.ts         Business rules 1–7
    derive.ts        The only place balances are computed
    invariants.ts    Balance checks (runnable anytime)
    construct.ts     Event builders
  lib/sync/          Sync engine (outbox, push, pull)
  lib/export/        Versioned, checksummed backup
  db/                Dexie (IndexedDB) client + queries
  app/               Next.js routes (dashboard, record, ledger, history, settings)
  components/        React components
tests/
  ledger/            Unit tests for derive, rules, corrections, invariants
  fixtures/          Full 8-member cycle test data
```

## Design decisions worth knowing

1. **Event sourcing, not CRUD** — no UPDATE or DELETE ever touches an event. Mistakes are fixed by appending a `correction` event that reverses the original.
2. **Balances are derived, never stored** — every number on screen comes from `derive(events)`. You cannot read a stale balance.
3. **Integer money (santim)** — no floats in storage or math. `0.1 + 0.2 !== 0.3` in IEEE-754; a ledger that sums in floats will eventually disagree with itself.
4. **Offline-first** — writes hit IndexedDB only. The server is a backup replica, not an authority.
5. **Idempotent sync** — event IDs are UUID v7 generated on-device. Pushing the same event twice is a no-op (unique key).
6. **Corrections compose** — a correction is itself an event, so it can be corrected. Chains work for free because derivation applies every event in order.

## Definition of done (DOMAIN.md §10)

- [x] Full cycle with 8 members completes; ledger balances to zero
- [x] Cover creates debt; payout settles it automatically
- [x] Every balance in UI is derived from events, never stored
- [x] Wrong entry corrected without breaking the book
- [x] Correction-of-correction works; chain stays visible
- [x] Offline recording works; export provides backup
- [x] No contribution recorded twice (unique event IDs + guards)
