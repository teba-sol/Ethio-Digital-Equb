# ARCHITECTURE.md — Sahil: Ekub Ledger

**Status:** Draft v1.1 — awaiting your approval
**Derived from:** PRD.md v1.4 (approved) and DOMAIN.md v1.1 (Locked).
**Scope of this document:** Technology, structure, data model, and deployment. This document adds no business rules and no features. Every architectural choice below exists to satisfy a commitment already made in DOMAIN.md or PRD.md, and each one cites the commitment it serves.

**Change log**

- v1.1 — All four §12 questions ruled on and folded in: durability is now **three-layer** (§9.2), sync is **authenticated** with a shared secret (§6.5), money is **integers in santim** with shared helpers (§5.5), and **PWA installability is in v1 scope** (§9.3). Risks 1 and 2 in §11 downgraded accordingly. §12 is now empty of open questions.
- v1.0 — Initial architecture. All stack decisions made and justified. Some are still flagged as _provisional_ (see §11) because they carry real risk and I want them on the record rather than buried.

---

## 0. How to read this document

The PRD described **what the app must do**. This document describes **what the app is made of**, and — for every choice — **what we give up by making it**. Where I was forced to guess, the guess is marked **[PROVISIONAL]** and listed in §11. I did not silently decide anything.

---

## 1. Project brief (restated, so this document stands alone)

Sahil is a record-keeping app for one Ekub group. It does not hold, move, or enforce money — it is the group's **book of record**. One leader operates it on one device, offline-first, for a group of up to ~30 members, one active cycle at a time. Members are data records, not users (PRD §5, confirmed scale).

**The invariant that shapes the entire architecture:** every balance is **derived from an append-only event log**, never stored (DOMAIN.md §5). There are 8 event types and no `UPDATE` or `DELETE` ever touches an event (DOMAIN.md §5).

That single rule decides most of what follows.

---

## 2. Stack decisions

### 2.1 Decision table

| Layer | Choice | Version | Why this, in one line |
|---|---|
| Language | **TypeScript** | latest stable | The ledger is a union of 8 event shapes; types make an invalid event unrepresentable |
| Framework | **Next.js** (App Router) | 16.3.5 | You chose it for both tiers: UI and API in one codebase, one deploy | <!-- ver: npm registry, next@latest -->
| UI runtime | **React 19** | bundled with Next 16 | Server Components for read-heavy views, Client Components where IndexedDB lives |
| Styling | **Tailwind CSS** | v4 | One leader on a phone: no design system needed, just fast, readable markup |
| Local store | **Dexie (IndexedDB)** | 4.4.6 | Offline-first requires a real local database, not localStorage | <!-- ver: npm registry, dexie@latest -->
| Local store binding | **dexie-react-hooks** | latest | `useLiveQuery` re-renders the UI when the local DB changes; no manual cache invalidation |
| Server DB | **PostgreSQL** | 16+ | Sync backup target; transactions prevent half-recorded events |
| ORM | **Prisma** | latest | Typed queries, migrations as files, no hand-written SQL for a first project |
| Validation | **Zod** | latest | One schema validates the same event shape on the client _and_ the server |
| Server state | **Route Handlers + fetch** | — | No React Query: the _local_ DB is the source of truth, so server reads are rare |
| IDs | **UUID v7** (`uuid` pkg) | latest | Generated on-device, time-sortable; no server round-trip to create an event (see §5.2) |
| Tests | **Vitest** | latest | Ledger rules are pure functions; they need fast unit tests above all else |
| Lint/format | **ESLint + Prettier** | latest | Next 16 no longer runs `next lint`; ESLint is invoked directly | <!-- ver: nextjs.org/blog/next-16 -->
| Money | **integers in santim** | — | No floats in storage or math; shared helpers at the UI boundary (§5.5) |
| Backup | **versioned + checksummed JSON** | formatVersion 1 | Three-layer durability (§9.2, §9.3) |
| Install | **PWA** | — | Manifest + service worker + icons; improves iOS storage durability (§9.4) |
| Deploy | **Vercel** (app) + **Neon** (Postgres) | - | Zero-config, free tier, matches "one group, one device" load |

### 2.2 Why each of the load-bearing pieces

**Next.js for both tiers, as you chose.** The concrete benefit here is not "full-stack" for its own sake — it's that **the same TypeScript types describe an event on both sides of the wire**. An `EkubEvent` type is defined once in `/src/lib/ledger/events.ts`, imported by the client that writes it to IndexedDB and by the Route Handler that receives it into Postgres. There is no place for the two definitions to drift. In a two-codebase setup, that drift is the single most likely source of corruption in this app.

**Dexie / IndexedDB as the source of truth — the most important decision in this document.** DOMAIN.md §10 requires: _"Killing network mid-contribution still records locally, syncs later."_ That sentence is not satisfiable if the server owns the data. So the device owns the data, and the server is a **backup and reconciliation target**, not an authority. Direct consequence: every write path in the app touches only IndexedDB. The server is contacted _after the fact_, and only when a network is available.

**Postgres, not SQLite-on-server.** SQLite would be simpler and would work fine for one group. I chose Postgres for two reasons and I want the tradeoff explicit: (1) free managed hosting (Neon) removes "where do I run this" as a project risk; (2) if v2 brings multi-device or multi-group, the server DB is already the right shape. **What we give up:** SQLite would have been zero-ops and one file. Postgres means a connection string, a hosted dependency, and a cold-start delay on the free tier.

**Zod, and why not "just TypeScript".** Types disappear at runtime — they cannot validate a payload that arrived over HTTP from a device that might be running an older build. Zod schemas survive to runtime and produce the same validation on both sides. **What we give up:** the event shape is now declared twice (a TS type _and_ a Zod schema), and they can drift. Mitigation in §5.4: the Zod schema is the source, and the TS type is inferred from it with `z.infer`.

**No React Query / SWR.** This is a deliberate omission worth stating, because it's the conventional choice in a Next.js app. Those libraries exist to cache _server_ state on the client. Our client already has the authoritative data in IndexedDB, so adding a server-cache layer would create a **second** source of truth and an entire class of bug where the cache and the DB disagree. **What we give up:** we hand-write the sync logic instead of getting it from a library. That's honest — the sync logic is small (§6) but it is ours to get right.

---

## 3. High-level architecture

```
┌─────────────────────────────┐
│  THE DEVICE (the leader's phone/browser)                    │
│                                                             │
│   React UI ──writes──▶ Dexie (IndexedDB) ──liveQuery──▶ UI   │
│                              │                              │
│                              │  append-only events          │
│                              ▼                              │
│                        sync queue (outbox)                  │
└──────────────────────────────┼──────────────────────────────┘
                               │  HTTPS, only when online
                               │  Header: X-Ekub-Secret
                               │  POST /api/sync  (push events)
                               │  GET  /api/sync  (pull events)
                               ▼
┌─────────────────────────────┐
│  NEXT.JS SERVER (Vercel)                                    │
│                                                             │
│   Route Handlers (Zod-validated)                            │
│          │                                                  │
│          ▼                                                  │
│     Prisma ──▶ PostgreSQL (Neon)                            │
│                    events table (append-only, unique id)     │
└─────────────────────────────┘
```

**Where the app starts and ends:** a leader taps "mark paid" → a `contribution` event is written to IndexedDB → the UI updates instantly via `useLiveQuery` → the event enters the outbox → sync pushes it to `/api/sync` → Postgres holds a copy. If the sync step never happens, the app still works; the event is simply not backed up yet.

**The remote store is a replica, not a referee.** It rejects only malformed or duplicate events. It does not compute balances and it does not decide business rules.

---

## 4. Folder structure

```
/
├── docs/
│   ├── DOMAIN.md              Business rules. Locked. Never edited by code decisions.
│   ├── PRD.md                 Product intent and v1 scope.
│   ├── ARCHITECTURE.md        This file.
│   └── MASTER_PROMPT.md       The working protocol.
│
├── prisma/
│   └── schema.prisma          Postgres schema: the events table and sync bookkeeping.
│
├── src/
│   ├── app/                   Next.js App Router. Routes, layouts, and the API.
│   │   ├── layout.tsx         Root layout: fonts, providers, nav shell.
│   │   ├── page.tsx           Home — the cycle dashboard (L10).
│   │   ├── setup/             L1–L3: create group, add members, create cycle.
│   │   ├── record/            L4–L9: the recording screens the leader uses in a meeting.
│   │   ├── history/           L14: full event log and balance verification.
│   │   ├── ledger/            L11/L15: debt ledger and loss breakdown.
│   │   ├── settings/          Sync key entry (§6.5), export/restore (§9.3).
│   │   ├── manifest.ts        PWA manifest — installability (§9.4).
│   │   └── api/sync/route.ts  The only server endpoint in v1 (§6).
│   │
│   ├── components/            Presentational React components. No business logic.
│   │   ├── ui/                Buttons, fields, dialogs — the small primitives.
│   │   └── ledger/            Ledger-aware widgets: balance rows, event cards, corrections.
│   │
│   ├── db/                    The local database. The source of truth.
│   │   ├── schema.ts          Dexie table definitions and indexes.
│   │   ├── client.ts          The single Dexie instance (module singleton).
│   │   └── queries.ts         Typed read helpers the UI calls.
│   │
│   ├── lib/
│   │   ├── money.ts           santim ↔ display/input conversion. UI boundary only (§5.5).
│   │   ├── export/            Versioned, checksummed backup file (§9.3).
│   │   │   ├── build.ts       Events → the export envelope + SHA-256 checksum.
│   │   │   └── verify.ts      Recompute the checksum; used on reimport in v2.
│   │   ├── ledger/            THE DOMAIN CORE — pure functions, zero I/O. See §5.
│   │   │   ├── events.ts      The 8 event types + correction shape, as Zod schemas.
│   │   │   ├── types.ts       TS types inferred from those schemas (z.infer).
│   │   │   ├── derive.ts      Events → balances. The single place balances are computed.
│   │   │   ├── rules.ts       Rule 1–7 enforcement: covers, caps, debt settlement.
│   │   │   ├── invariants.ts  The §4 balance checks, runnable at any time (L14).
│   │   │   └── construct.ts   Builders that create valid events from leader input.
│   │   │
│   │   └── sync/              The sync engine. Talks to the server. See §6.
│   │       ├── outbox.ts      The queue of events not yet confirmed by the server.
│   │       ├── push.ts        Sends unsynced events.
│   │       └── pull.ts        Fetches events this device has not seen.
│   │
│   └── hooks/                 React glue: useLiveQuery wrappers, useOnline, useSync.
│
├── public/
│   ├── sw.js                  Service worker — caches the app shell only (§9.4).
│   └── icons/                 192px, 512px, and maskable app icons.
│
├── tests/
│   ├── ledger/                Unit tests for rules, derivation, invariants, corrections.
│   ├── money/                 santim conversion: rounding, rejection of sub-santim input.
│   ├── sync/                  Duplicate-prevention, auth failure, mid-write-failure tests.
│   └── fixtures/              A full 8-member cycle as test data (DOMAIN.md §10 DoD).
│
├── .env.local                 DATABASE_URL, EKUB_SYNC_SECRET. Never committed.
├── next.config.ts             Next configuration.
└── package.json
```

**Why `src/lib/ledger/` is its own world:** it imports nothing from React, Dexie, Prisma, or `fetch`. That constraint is what makes the business rules testable in milliseconds and provable against DOMAIN.md — and it's why `derive.ts` can be the _only_ place a balance is ever computed.

---

## 5. Data model

### 5.1 The event table (the only table that matters)

Every mutation is a row. Nothing is updated; nothing is deleted. One table holds all 8 types, discriminated by `type`.

```prisma
model Event {
  id              String   @id            // UUID v7, generated on-device
  groupId         String
  cycleId         String?
  type            String                  // contribution | cover | payout | exit_refund |
                                          // forfeit_redistribution | default_event |
                                          // bad_debt_event | correction
  payload         Json                    // the type-specific fields
  occurredAt      DateTime                // when the leader recorded it
  recordedBy      String                  // the leader (Rule 7)
  correctsEventId String?                 // set only on `correction` events
  syncedAt        DateTime?               // when the server accepted it
  deviceId        String                  // which device wrote it

  @@index([groupId, occurredAt])
  @@index([cycleId])
  @@unique([id])
  @@index([correctsEventId])
}
```

**The unique primary key is the entire duplicate-prevention mechanism.** DOMAIN.md §10: _"No contribution can be recorded twice, even if button pressed twice."_ Because the id is a UUID v7 generated **on the device at the moment of writing**, a double-t produces only the second write being a fresh id — so we guard at the UI/outbox layer too (§6.4). If the _same_ event is pushed twice, the second insert violates the primary key and is ignored. Duplication is impossible at the database level, not by convention.

### 5.2 Why UUID v7 and not an auto-increment integer

An auto-increment id requires the server to assign it — which means **you cannot create an event while offline**. UUID v7 is generated locally, needs no server, and is time-sortable, so `ORDER BY id` is roughly chronological. **What we give up:** ids are longer (36 chars vs 4 bytes), and in a theoretical high-concurrency system UUID v7 is less dense than sequential integers. At one group and one device, that is irrelevant.

### 5.3 What is deliberately NOT stored

- **No `balance` column anywhere.** DOMAIN.md §5: _"Balances are always derived from events. Never stored as a mutable column."_ Enforced by the absence of the column — you cannot accidentally read a stale balance that doesn't exist.
- **No `is_deleted`.** You cannot delete an event. You correct it.
- **No `updated_at`.** A row is written once. If a row changes, the model is broken.
- **No `correction` mutating the original.** `correctsEventId` lives on the _correction_ row; the original is untouched and remains visible (DOMAIN.md §5).

### 5.4 Event shapes and the guard against drift

`events.ts` defines one Zod schema per event type plus a discriminated union. TypeScript types are _derived_, never hand-written:

```ts
export const ContributionEvent = z.object({
  type: z.literal("contribution"),
  memberId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  amount: z.number().int().positive(), // santim — never floats for money (§5.5)
  status: z.enum(["paid", "covered", "missed", "defaulted"]),
});

export const EkubEvent = z.discriminatedUnion("type", [/* all 8 */]);
export type EkubEvent = z.infer<typeof EkubEvent>; // ← the type comes FROM the schema
```

One declaration, two consumers, zero drift. The client validates before writing to IndexedDB; the Route Handler validates again before writing to Postgres. **A device running an old build cannot corrupt a new server.**

Amounts are integers in **santim** — see §5.5 for the full rule and the helpers that enforce it.

### 5.5 Money: integers in santim, and nothing else

**Confirmed.** Every monetary amount is stored, transported, and computed as an **integer in santim** (1 birr = 100 santim). There is no floating-point number anywhere in storage or in ledger math.

The rule is enforced by three independent things:

1. **The Zod schemas** declare amounts as `z.number().int()`, so a float fails validation before it reaches a database (§5.4).
2. **The Postgres column** holds integers. A float has no path in.
3. **Two shared helpers** are the only sanctioned conversion points, both at the UI boundary:

```ts
// src/lib/money.ts
formatMoney(santim: number): string        // 1250 → "12.50 ETB"   (display only)
parseMoney(input: string): number | null   // "12.50" → 1250      (input only)
```

**The boundary rule:** `parseMoney` is called at the _edge_ — when the leader types an amount. Everything inward from that point, all the way through `derive.ts` and out to Postgres, deals only in integers. `formatMoney` is called at the opposite edge, to render. **No arithmetic is ever performed on the parsed value's decimals** — you parse once, then add integers forever.

**Why this matters concretely:** `0.1 + 0.2 !== 0.3` in IEEE-754 floating point. A ledger that sums contributions in floats will, after enough periods, disagree with itself by a fraction of a santim — and DOMAIN.md §4 requires `SUM(debits) == SUM(credits)` _exactly_. Integer arithmetic makes that equality true by construction rather than by luck. `parseMoney` rounds to the nearest santim and rejects input that does not land on one: a leader cannot enter half a santim, because half a santim is not money.

**What we give up:** every site that touches money must remember it holds an integer in santim, and a missed `formatMoney` call displays a value 100× wrong. Mitigation: these two helpers are the _only_ conversions in the codebase, and — stated as a hard rule — **`src/lib/ledger/` is forbidden from importing `money.ts` at all.** The ledger core never formats; it only counts.

---

## 6. Sync design

### 6.1 The model: one writer, one replica

Per your confirmed scale — _one device, offline-first_ — v1 sync is **one writer to one replica**, never two devices writing. This is what makes sync a small problem instead of a distributed-systems problem.

- **Push:** device sends events the server has not yet acknowledged.
- **Pull:** device asks for events with `id` greater than the newest it holds.
- **The server never sends a balance.** It sends events. The device derives everything itself, always.

### 6.2 Push / pull contract

```
POST /api/sync   { deviceId, events: EkubEvent[] }
              →  { accepted: string[],   // ids written (or already present)
                   rejected: {id, reason}[] }

GET  /api/sync?since=<uuid>&groupId=<id>
              →  { events: EkubEvent[] }
```

Push is **idempotent**: sending the same event twice is a no-op, because `accepted` is computed by attempting an insert and treating a unique-key violation as success. This is the mechanism that satisfies PRD §5's _"no contribution can be recorded twice."_

### 6.3 Authentication: the shared secret

**Ruled: the sync endpoint is authenticated in v1.** No write endpoint accepts an unauthenticated request.

| Aspect                    | Decision                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                    | `X-Ekub-Secret`                                                                                                                                                           |
| Value                     | A random shared secret, **generated server-side**                                                                                                                         |
| Scope                     | Required on **every** write request. Read (`GET`) also requires it in v1 — one rule, no exceptions to reason about.                                                       |
| How it reaches the device | **Pasted into the app once**, stored in IndexedDB, then sent on every sync                                                                                                |
| Rotation                  | Rotatable: generate a new secret server-side, paste it into the app again. An overlap window accepts old and new briefly so a rotation cannot strand a device mid-flight. |
| Failure mode              | `401`. The event stays in the outbox, marked `rejected` with reason `auth` — **never dropped** (§6.5).                                                                    |

**What this is and is not.** It is a _shared secret_, not authentication of a person. There are no user accounts in v1 (PRD §5: single-user), and this does not create any. It answers exactly one question: _did this request come from someone who was given the secret?_ That is enough to stop a stranger who finds the URL from writing into the ledger.

**Where the secret lives:**

- Server: an environment variable, `EKUB_SYNC_SECRET`. It joins `DATABASE_URL` as the second and last env var (§9.1).
- Device: IndexedDB, in a `settings` table. Not in `.env.local`, because the device is the one that needs it and the value must be changeable without a rebuild.

**What we give up:** a shared secret cannot be revoked per-device, and anyone holding it can write anything. With one device and one leader, both of those are acceptable. When v2 introduces member self-service, this is replaced by real accounts — recorded as a v2 concern, not a v1 gap.

**Honest limitation, stated rather than hidden:** the secret is stored in IndexedDB and sent over HTTPS. It is only as safe as the device. This is a deliberate trade against the complexity of an auth system that a one-leader, offline-first app does not need.

### 6.4 The outbox, and the double-tap problem

The outbox is a Dexie table marking each local event as `pending` or `synced`.

**Double-tap guard:** a UI-level in-flight flag blocks a second submit while the first is being written, and each form gets a single idempotency key per open session, reused across retries of _that_ submission. This is a belt-and-braces approach because the two failures are different: the in-flight flag stops an _accidental_ double-tap, and the stable id stops a _retry_ from creating a second event. The database unique key remains the final backstop.

### 6.5 Failure behavior (what happens when things go wrong)

| Failure                              | What the user sees                                                 | What the system does                                                       |
| ------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Offline while recording              | Nothing — the record is saved normally                             | Event stays in outbox                                                      |
| Offline while syncing                | A quiet "Not backed up yet" indicator                              | Retries on reconnect and on app open                                       |
| Server rejects an event              | A specific error naming the event and reason                       | Event stays local, marked `rejected`; **never silently dropped**           |
| Sync secret missing or wrong (`401`) | "This device is not connected to the backup — paste your sync key" | Nothing is lost; recording continues; sync pauses until the key is entered |
| Server unreachable for weeks         | Nothing degrades                                                   | Everything works; the outbox just grows                                    |
| Two events with the same id          | Nothing                                                            | Second insert ignored (unique key)                                         |

**The rule I am holding to:** an event recorded locally is **never destroyed** by a sync failure. Losing a recorded contribution to a network problem is exactly the failure DOMAIN.md §10 exists to prohibit.

**No conflict resolution in v1, deliberately.** With one writer, there are no conflicts to resolve — only duplicates to ignore and gaps to fill. If v2 allows two devices, this is the first thing that breaks, and it is listed in PRD §9 as a v2 problem with a named prerequisite.

---

## 7. Derivation: the one place balances exist

`derive.ts` exposes one pure function shape:

```
derive(events: EkubEvent[], asOf?: Date) → {
  memberBalances, debtLedger, cycleState, lossPosition
}
```

**Properties this function must have, and why each is load-bearing:**

1. **Pure** — same events in, same balances out, no I/O. This is what makes the ledger testable against DOMAIN.md's arithmetic.
2. **Total** — every event in the log is applied, including events later corrected. A correction is _itself_ an event whose effect is the mirror of the original (DOMAIN.md §5), so re-deriving over the whole log automatically restores the corrected state. **No special "skip corrected events" logic is needed** — and that is the elegance of the correction design: it composes for free.
3. **The only implementation** — the UI never computes a sum; it calls `derive`. DOMAIN.md §10: _"Every balance in UI is derived from events, never stored."_

**Performance note, stated honestly:** deriving over the whole log on every render would be wasteful. v1 memoizes per `(groupId, cycleId, lastEventId)`. At ~30 members and one cycle — a few hundred events — a full re-derivation is sub-millisecond, so this is optimization we barely need. I am noting it so we don't gold-plate it later.

---

## 8. Feature → architecture map

| PRD feature                         | Where it lives                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| L1–L3 setup (group, members, cycle) | `app/setup/`, events written via `lib/ledger/construct.ts`                            |
| L4–L9 recording                     | `app/record/`, each screen builds one event type                                      |
| L7 payout w/ itemized deductions    | `lib/ledger/rules.ts` (Rule 4) — computed _before_ confirmation                       |
| L10 cycle dashboard                 | `app/page.tsx` + `useLiveQuery` over `derive()`                                       |
| L11 debt ledger                     | `app/ledger/` + `derive().debtLedger`                                                 |
| L12 offline operation               | `db/` + `lib/sync/outbox.ts`                                                          |
| L13 close cycle                     | event + `lib/ledger/rules.ts` Rule 6                                                  |
| L14 history & verification          | `app/history/` + `lib/ledger/invariants.ts`                                           |
| L15 loss breakdown                  | `derive().lossPosition`                                                               |
| **L16 correction**                  | `correctsEventId` on the Event row, `lib/ledger/construct.ts`, `derive.ts` applies it |

**L16 needs no special storage.** It is the 8th value of `type`, with the same table and the same unique-key duplicate protection. The chain (`original → correction → correction-of-correction`) is just a linked list via `correctsEventId`, and derivation walks it in order. This is the payoff of designing corrections as events rather than as edits.

---

## 9. Deployment

### 9.1 Where things run

| Piece                        | Where               | Notes                                                                    |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------ |
| Next.js app + Route Handlers | Vercel              | Free tier. HTTPS included — also required for PWA installability (§9.3). |
| PostgreSQL                   | Neon                | Free tier. Single connection string.                                     |
| Local data                   | The leader's device | Survives server downtime entirely                                        |

**Environment variables — exactly two:**

| Variable           | Where  | Purpose                                                |
| ------------------ | ------ | ------------------------------------------------------ |
| `DATABASE_URL`     | Server | Postgres connection                                    |
| `EKUB_SYNC_SECRET` | Server | The shared secret checked on every sync request (§6.5) |

The sync secret the _device_ holds is not an env var — it lives in IndexedDB, because the device must be able to receive a rotated value without a rebuild (§6.5).

**Everything in `/docs` stays in the repo.** DOMAIN.md and PRD.md are part of the codebase, not separate documents, because every code decision is supposed to trace back to them.

**Repository layout note:** the four governing documents live at **`/docs/DOMAIN.md`, `/docs/PRD.md`, `/docs/ARCHITECTURE.md`, `/docs/MASTER_PROMPT.md`**. They were moved out of the repo root as the first scaffolding step. Throughout this document and the others, short-form citations like "DOMAIN.md §5" refer to these `/docs/` paths; no code or config imports them, so the location is a convention for humans, not a dependency.

### 9.2 Durability: three layers

**Ruled: all three, not a choice between them.** IndexedDB can be evicted by the browser — that is the one failure that can lose the ledger — so durability is defended three times, and the layers fail in _different_ circumstances on purpose.

| Layer                                    | Trigger                                                | Covers the case where…                                                        |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **(a) Immediate sync on every mutation** | Every write, when online                               | The device is lost or wiped while it had a network                            |
| **(b) Automatic periodic export**        | Every **N events or M minutes**, whichever comes first | The device is lost while it had _no_ network, and the outbox never drained    |
| **(c) One-tap manual export**            | The leader taps it                                     | The leader wants to hand a copy to someone, or take one before a risky moment |

Layers (a) and (b) are automatic and invisible to the leader. Layer (c) is the one they can reach for deliberately.

**Starting values for (b): N = 20 events, M = 10 minutes.** Both are configurable constants, and the reasoning is: an Ekub meeting records a handful of contributions at a time, so 20 events is roughly one meeting's work, and 10 minutes bounds the exposure for a long quiet session. These are the kind of number that should be tuned after the leader has actually used it — recorded here so the number is visible, not so it is permanent.

### 9.3 Export format (versioned, checksummed, reimportable)

The export is designed **now** for reimport **later**, because a backup format is a compatibility promise and retrofitting one onto an unversioned blob is how backups become useless.

```jsonc
{
  "format": "ekub-ledger-export",
  "formatVersion": 1, // bumped when the shape changes; readers refuse unknown versions
  "schemaVersion": 1, // the event vocabulary version (DOMAIN.md §5)
  "exportedAt": "2026-…", // when this file was written
  "deviceId": "…", // which device produced it
  "lastEventId": "…", // the sync cursor at export time
  "eventCount": 214,
  "checksum": "sha256:…", // SHA-256 over the canonical serialisation of `events`
  "events": [/* the append-only log, in order */],
}
```

**Why each field earns its place:**

- `format` + `formatVersion` — a future version of the app sees a v1 file and knows whether it can read it. Without this, a backup is only readable by the build that wrote it.
- `schemaVersion` — the _event vocabulary_ can evolve (a 9th event type, a new field) independently of the container format. Two version numbers, because they change for different reasons.
- `checksum` — SHA-256 over the events, computed with a **canonical serialisation** (sorted keys, fixed number formatting) so the same events always produce the same hash. This is what makes the file _self-verifiable_: on reimport, recompute and compare. A truncated or hand-edited backup is detected rather than silently loaded.
- `lastEventId` + `eventCount` — cheap sanity checks that the file is whole, and the cursor needed to resume sync after a restore.

**Reimport is a gate, not a feature yet.** v1 ships export with `formatVersion` and `checksum`; the reimport path is a v2 feature. But the format is built so that reimport is _possible_ without a migration — which is the whole reason to version it now. Stating this plainly: **the checksum protects a v1 file, and the versioning protects the leader's future self.**

### 9.4 PWA installability — in v1 scope

**Ruled: in scope.** The app must be installable to the home screen, not merely usable in a browser tab.

| Requirement    | Implementation                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web manifest   | `app/manifest.ts` (Next.js App Router convention) — name, icons, `display: standalone`, theme colour                                                                    |
| Service worker | Caches the app shell so the app _opens_ with no network. Note: app shell only — the ledger itself is already local in IndexedDB and does not need the SW to be readable |
| Icons          | 192px, 512px, plus a maskable icon for Android adaptive shapes                                                                                                          |
| HTTPS          | Provided by Vercel (§9.1) — installability requires a secure context                                                                                                    |

**Why this is architectural and not cosmetic:** installing to the home screen gives the app its own storage context on iOS, which materially reduces the eviction risk in §11 Risk 1 — the exact risk layers (a)–(c) above are defending against. The service worker also means the app opens instantly in a room with no signal, which is the normal condition (DOMAIN.md §10).

**Scope discipline:** the service worker caches the **app shell only**. It does **not** try to cache API responses, because the app's data is already local — adding API caching would put a second, staler copy of the data next to the authoritative one, which is the same mistake §2.2 rejects React Query for.

---

## 10. Testing strategy

The ledger rules are the part that must not be wrong, so they get the tests.

| Layer             | Tool                         | What it proves                                                      |
| ----------------- | ---------------------------- | ------------------------------------------------------------------- |
| `lib/ledger/*`    | Vitest (unit)                | Rules 1–7; the DOMAIN.md §4 invariants; correction chains           |
| `tests/fixtures/` | Vitest                       | A complete 8-member cycle derives to a zero balance (DOMAIN.md §10) |
| `lib/sync/*`      | Vitest                       | Duplicate push is a no-op; failed push never drops a local event    |
| UI screens        | Manual, per protocol PHASE 7 | The leader's actual workflow, one feature at a time                 |

**No component tests, no E2E framework in v1.** I would rather have exhaustive tests on `derive.ts` than shallow tests everywhere. **What we give up:** a UI regression could slip through. Given one user and one device, that's a trade I'll take.

---

## 11. Risks and unknowns

**Marked [PROVISIONAL] — these are the points where I have decided something that could reasonably go another way, and where being wrong is expensive.**

| # | Risk | Why it could bite | Mitigation |
|---|---|
| 1 | IndexedDB as source of truth (eviction risk) — **ruled, mitigation in scope** | iOS Safari can evict IndexedDB under pressure. If that happens, the local ledger is **gone** — the one scenario the whole app exists to prevent | **Three layers (§9.2):** immediate sync on every mutation, auto-export every 20 events / 10 min, one-tap manual export. Plus PWA installability (§9.4), which reduces eviction risk on iOS. Residual risk accepted. |
| 2 | Sync endpoint trust model — **ruled, mitigation in scope** | A shared secret is not per-user auth; anyone holding it can write anything, and it cannot be revoked per-device | **Shared secret (§6.5):** `X-Ekub-Secret`, rotatable. Accepted for one device and one leader; replaced by real accounts in v2. |
| 3 | **[PROVISIONAL]** One `Event` table with a `Json` payload | Postgres can't enforce per-type field constraints; a malformed payload is only caught by Zod | Zod validation on _both_ sides; revisit if the payload shapes diverge badly |
| 4 | UUID v7 sortability | `ORDER BY id` is _roughly_ chronological, not exactly, if a device clock is wrong | Order by `occurredAt` for display; use `id` only for sync cursor |
| 5 | Device clock drift | `occurredAt` is device-generated; a wrong clock produces a misleading timestamp | Server records its own `syncedAt` alongside; note the discrepancy in L14 rather than hiding it |
| 6 | Postgres free-tier cold start | The first sync after idle may take seconds | Sync runs in the background, never blocks a write — the leader never waits on the network |

**The two data-loss risks (1 and 2) are now ruled and mitigated.** Risk 1's residual — that a device can still be lost between exports, and that an export the leader never takes is not a backup — is accepted, not eliminated. It is the honest floor of a local-first design.

---

## 12. Decisions (formerly open questions — all ruled)

| # | Question | Ruling | Where it lives now |
|---|---|
| 1 | Local data durability | **All three layers:** immediate sync on every mutation, auto-export every 20 events / 10 min, one-tap manual export. Format is versioned, checksummed, and built for future reimport. | §9.2, §9.3 |
| 2 | Sync authentication | **Shared secret now.** Header `X-Ekub-Secret`, generated server-side, rotatable, pasted into the app once. **No write endpoint accepts unauthenticated requests.** Not user accounts — those are v2. | §6.5 |
| 3 | Integer minor units | **Confirmed.** All amounts are integers in **santim**. No floats anywhere in storage or ledger math. Formatting/parsing only at the UI boundary, via shared `formatMoney` / `parseMoney` helpers. | §5.5 |
| 4 | PWA installability | **In scope for v1.** Manifest, service worker, icons, HTTPS. Installability is a requirement, not a nicety — it improves iOS storage durability. | §9.4 |

**No open architectural questions remain.** The next step is scaffolding (doc move + project init), then Feature L1 at PHASE 1.

---

## 13. What this document deliberately does not contain

No UI design, no copy, no screen layouts, no component-by-component implementation, no code. Those come per feature, following the protocol's PHASES 1–8: one feature at a time, starting at PHASE 1 with L1.

---

**End of ARCHITECTURE.md**
