# PRD.md — Sahil: Ekub Ledger

**Status:** Draft v3 — awaiting your approval
**Version:** 1.4 (v1 scope)
**Derived from:** DOMAIN.md v1.1 (Locked). This document adds no new business rules; every statement below traces back to a rule in DOMAIN.md.
**Scope of this document:** Business intent only. No technology, no schema, no APIs, no UI mechanics.

**Change log**

- v1.4 — **Scale confirmed and bound.** v1 target: one group, one leader, one device, up to ~30 members, one active cycle at a time. Offline-first, single-user. Multi-group and multi-device deferred to v2. §8 is now fully resolved — no open questions remain — and §5 states the confirmed scale as a table.
- v1.3 — Correction chains decided: a correction is just another event and can itself be corrected. Every event is corrected **at most once**; a wrong correction is fixed by a correction-of-the-correction that references the _correction_ event (`original → correction → correction-of-correction`). Every event stays immutable and the whole chain stays visible. This closes former open question §8.5 and tightens DOMAIN.md §5.
- v1.2 — Members cut from v1 as app users. The Member role is now a **data record only** — name, phone, payout position, contribution history — with no login, no app access, no writes, and no reads. Features M1–M5 are removed from v1 and deferred to v2 (§9); DOMAIN.md §11 records the same. The correction mechanism is decided (DOMAIN.md §5, 8th event type `correction`) and enters v1 as feature L16, resolving the former open question §8.3. v1 is leader-operated, single-user.
- v1.1 — Removed the Auditor role from v1. v1 has exactly two users: Leader and Member. A read-only verification role is deferred to v2, to be specified once its actual needs are known (see §9).
- v1.0 — Initial draft.

---

## 1. Product summary

Sahil is a record-keeping application for an Ekub group — a rotating savings association where members contribute a fixed amount each period and one member receives the collected pot each period until everyone has received once.

Sahil does not hold money, move money, or enforce anything. It is the group's **book of record**: it captures who paid, who received, who owes whom, and what the group decided — so that every dispute in DOMAIN.md §6 can be answered from a timestamped record instead of from memory.

**The problem it solves:** Ekub disputes are memory disputes. Group leaders track contributions in notebooks or in their heads. When records are lost or contested, trust breaks down — and the association only works because of trust.

---

## 2. Users

DOMAIN.md names one operator per group (the leader/treasurer, §2 and Rule 7) and describes members as people who belong to the group but do not operate the app.

**v1 has exactly one user: the Leader.** The Member is not an app user in v1 — a member exists only as a **data record** inside the leader's ledger (name, phone, join date, payout position, contribution history). Members have no login, no app access, no writes, and no reads. Member login and self-service views are deferred to v2 (DOMAIN.md §11, PRD §9). A read-only verification role is also deferred to v2.

| Role | Who they are | Operates the app in v1? | Defined in DOMAIN.md? |
|---|---|
| **Leader** | The treasurer/operator of one group. Records contributions, payouts, covers, exits, corrections. Yes — the sole app user | Yes (§2, Rule 7) |
| **Member** | A person in the group with a payout position. In v1: a data record only — name, phone, payout position, contribution history. | **No** — no login, no app access, no writes, no reads | Yes (§2) |

A person may be both a leader and a member of a group (the leader contributes and can receive a payout in real Ekub practice). Where that happens, the leader acts on their own member record like any other.

---

## 3. What the user needs

### 3.1 Leader

**Primary need:** record what happened, correctly, while the meeting is happening — and never lose it.

- Record a member's contribution for a period, and mark a contribution as missed
- Record a **cover** when one member pays on another's behalf (including split covers — Rule 1, resolved decision §8.4)
- Record a **payout** to the member whose turn has arrived, and see exactly what was deducted from it before confirming (Rule 4)
- Record a **cycle** — its members, contribution amount, frequency, start date, and the agreed payout order (Rule 3)
- Record an **exit** with the group's settlement decision, a free-text reason, and a note on group consent (Rule 2, Rule 7)
- See the current standing of the whole cycle: who has paid, who is uncovered, who has received, whose turn is next
- See outstanding cover debts and who owes whom, and see them settle automatically at payout time (Rules 1 and 4)
- See the group's loss position when defaults or write-offs occur (Rule 2b, Rule 4)
- **Correct a wrongly recorded event** — reverse it and apply the right one in its place, without deleting anything; and correct a correction that was itself wrong (DOMAIN.md §5)
- Work **without connectivity** — an Ekub meeting happens in a room, not on a network (DOMAIN.md §10)

**Leader must be able to do all of this without accounting knowledge.** The rules are locked; the app applies them. The leader records facts and decisions; the app derives consequences.

### 3.2 Member

**Members need nothing from the app in v1, because members do not use the app in v1.**

A member is a **data record** the leader maintains: name, phone, join date, payout position in each cycle, and the contributions, covers, payouts, and exits recorded against them. Members have no login, no app access, no writes, and no reads.

How a member's needs are met in v1: every question a member would otherwise ask the app is answered by the leader **out of the ledger, in the meeting** — that is the point of v1's leader-operated design, and it is what success measure §7.2 tests. Real-time member self-service is a v2 concern (DOMAIN.md §11, PRD §9).

---

## 4. Features, in priority order

Priority reflects **dependency and value**, not effort. P1 items are prerequisites for everything after them: a ledger with no recorded events is an empty ledger.

**All v1 features are leader-operated.** There is no second feature list, because there is no second user. Members are data records the leader creates and maintains (L2), not operators.

| # | Feature | Why this priority | Traces to |
|---|---|
| L1 | **Create a group** — name, default contribution amount, frequency | Nothing exists without a group | §2 Group |
| L2 | **Add members** — name, phone, join date | No contributions without members | §2 Member |
| L3 | **Create a cycle** — start date, amount, frequency, member list, agreed payout order | Locks the rules the rest of the cycle runs on | §2 Cycle, Rule 3 |
| L4 | **Record a contribution** (paid) for a member and period | The core daily act of the app | §2 Contribution |
| L5 | **Record a missed contribution** | The precondition for a cover or a default | §2 Contribution status |
| L6 | **Record a cover** — one or more covering members, in full or in part | Implements Rule 1; creates debts that settle later | Rule 1, §8.4 |
| L7 | **Record a payout**, with deductions itemized before confirmation | Emits Rule 4; settles all outstanding debts automatically | Rule 4, §2 Payout |
| L8 | **Record an exit** — settlement type, reason, consent note; refund capped to pot | Rule 2, Rule 5, Rule 7 | Rules 2, 5, 7 |
| L9 | **Record a default** for a post-payout non-payer | Rule 2b; makes the shortfall visible | Rule 2b |
| L10 | **Cycle dashboard** — paid / uncovered / received / next turn | Turns recorded facts into the picture the meeting needs | Rules 1–3 |
| L11 | **Debt ledger view** — who owes whom, what has been written off | Makes Rule 4's automatic settlement visible and checkable | Rules 1, 4 |
| L12 | **Offline operation** — record with no connectivity, sync without duplication or loss | Non-negotiable in a meeting room; also §10 DoD | §10 |
| L13 | **Close the cycle** — ends one period early if exits occurred | Rule 6 | Rule 6 |
| L14 | **Full event history & balance verification** — the append-only record, with every displayed balance recomputable from it | How the leader answers "the numbers don't add up" (§6.8) on the spot | §4, §5, §10 |
| L15 | **Loss events breakdown** — defaults and bad debts shown separately, never buried in a total | Makes absorbed loss explicit rather than invisible | §4, Rule 2b, Rule 4 |
| L16 | **Correct a recorded event** — reverse it exactly, optionally apply the correct event in its place, with a reason; the corrected event stays visible, and a correction can itself be corrected | The remedy when a contribution is recorded against the wrong member or period — the most likely mistake in L4 | Rule 7, §5 `correction` |

> **Note on L14/L15:** these are _verifications of correctness_, not new business rules. They were previously scoped as a separate read-only role; in v1 they are leader capabilities, because the leader is the person who must defend the book when a member challenges it (Rule 7, DOMAIN.md §6).

> **Note on L16:** the correction _mechanism_ is decided — it is the 8th ledger event in DOMAIN.md §5, not an edit and not a deletion. Nothing recorded is erased: a correction is itself a balanced, immutable event that reverses the prior event and may carry its replacement, with a reason. **A correction is just another event, so it can itself be corrected**: every event is corrected at most once, and a wrong correction is fixed by a correction-of-the-correction referencing the correction event — `original → correction → correction-of-correction`, as deep as facts require. This resolves the former open questions §8.3 and §8.5, and it is what unblocks L4 in practice.

> **Member features are cut from v1.** M1–M5 (my position, my contributions, my payout, my exit record, flagged-default visibility) are **not in v1**; they are recorded as deferred in §9. Everything a member would have read about themselves, the leader reads from the ledger and answers in the room.

---

## 5. In scope for v1

**Definition of done for the whole project** (DOMAIN.md §10, restated as PRD commitments):

- Two members can be added while offline and both sync later without duplication
- A full cycle with 8 members can be completed, and the ledger balances to zero at the end
- Losing network mid-contribution still records the contribution locally, and it syncs later
- No contribution can be recorded twice, even if the action is repeated
- Every balance shown in the interface is derived from events, never stored
- A cover creates a debt; when the covered member's payout arrives, the lender is paid automatically
- An exit with HALF_REFUND records correctly and reduces the next period's pot
- An exit with NO_REFUND leaves the exiting member's contributions in the group's pool
- The refund cap prevents the next receiver from receiving a negative pot
- Every dispute in DOMAIN.md §6 can be answered from the app with a timestamp
- A contribution recorded against the wrong member can be corrected: the ledger balances, the corrected event stays visible with its reason, and the right contribution appears in its place
- A correction that is itself wrong can be corrected in turn; each event is corrected at most once, the full chain stays visible, and the ledger still balances
- **A member never has to open the app** — in v1 the leader answers every member question from the ledger

**Capability summary for v1:** group and member _records_, cycle creation with locked order, contribution and miss recording, covers with split support, payouts with automatic debt settlement and itemized deductions, exits with the three settlement types and pot capping, default recording, corrections as the 8th event type with correctable corrections, derived balances, the full immutable event history, invariant checking, and offline-first operation — all operated by the leader alone.

**Scale and user assumption for v1 — CONFIRMED:**

| Dimension           | v1 target                                                                  |
| ------------------- | -------------------------------------------------------------------------- |
| Groups              | **One.** One group per app instance.                                       |
| Leaders / app users | **One.** Single-user, no sign-in, no roles.                                |
| Devices             | **One.** The leader's single device holds the ledger.                      |
| Members             | **Up to ~30.** DOMAIN.md §10 names 8 as the test case; ~30 is the ceiling. |
| Cycles              | **One active at a time.** A cycle closes (L13) before the next begins.     |
| Mode                | **Offline-first, single-user.** Fully usable with no connectivity.         |

**Multi-group and multi-device are v2.** So is member self-service, and so is anything that requires two copies of the ledger to agree. I am explicitly **not** designing v1 for many groups, many concurrent leaders, multiple devices, thousands of members, or member self-service. Correcting me on any of this is a business decision, not an implementation detail.

---

## 6. Out of scope for v1

Taken directly from DOMAIN.md §11, with the PRD consequence of each:

| Excluded                                | What this means for v1                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enforcing payment from defaulters**   | Defaults are _recorded and flagged_, never _acted upon_. Rule 2b: enforcement is social/legal.                                                                                                                                                                                                                          |
| **Legal debt recovery**                 | Bad debts are _written off and recorded_ (Rule 4), never pursued by the app.                                                                                                                                                                                                                                            |
| **Multi-currency support**              | One currency throughout — ETB in the DOMAIN.md example (§2 Group). Amounts need no currency dimension.                                                                                                                                                                                                                  |
| **Bank / mobile-money integration**     | Sahil never touches money. All settlement is a _record_ of cash that changed hands in the room.                                                                                                                                                                                                                         |
| **Voting features**                     | Rule 7 stands: the leader records the group's decision. The app does not collect, tally, or adjudicate consent.                                                                                                                                                                                                         |
| **Replacement members mid-cycle**       | Rule 6 stands: an exit means N-1 payouts and a cycle that ends one period early.                                                                                                                                                                                                                                        |
| **Automated SMS reminders**             | Deferred to v2 (§11). v1 contains no outbound notification of any kind — which also means v1 needs no network dependencies beyond sync.                                                                                                                                                                                 |
| **Member login and self-service views** | Deferred to v2 (DOMAIN.md §11). In v1 members exist as **data records only** — a name, phone, join date, payout position, and contribution history that the leader maintains. No login for a member, no app access, no writes, no reads; the leader is the sole app user. This removes features M1–M5 from v1 (see §9). |

**Also excluded by consequence, and worth stating explicitly:**

- **Automatic dispute resolution** — the app _answers_ disputes with records; it does not judge them (Rule 7, §6).
- **Inter-group transfers or a member operating across multiple groups at once** — DOMAIN.md §2 allows a member to belong to more than one cycle _over time_, not to operate across groups simultaneously. Flagging this as an interpretation, not a rule I've invented.
- **Editing or deleting recorded events** — prohibited by the append-only invariant (§5). A mistake is fixed by a `correction` event (L16), which reverses the wrong event and optionally applies the right one in its place. A correction that is itself wrong is fixed by correcting the correction. No event is ever edited or deleted; every event is corrected at most once, and every link in the chain stays visible with its reason. (Correction mechanism: DOMAIN.md §5.)
- **A read-only auditor/verification role** — deferred to v2 (§9).
- **Any member-facing surface at all** — no member login, no member view, no member-facing report, not even a read-only one. In v1 the only way a member learns anything is that the leader reads it to them from the ledger.

---

## 7. Success measures

How we will know v1 worked, in business terms:

1. **A full cycle completes with the ledger balancing to zero** — the single strongest signal that the rules in DOMAIN.md were implemented faithfully.
2. **A dispute from DOMAIN.md §6 is settled in the room, in under a minute, without anyone consulting memory** — from the leader's copy of the ledger, since members do not have one. If the leader still has to phone someone to check a figure, the app has failed its purpose.
3. **No recorded fact is ever lost to connectivity.** A contribution recorded in a room with no signal is present after the meeting.
4. **The group stops keeping a parallel paper book.** If they still need paper, they don't trust the app.
5. **A wrongly recorded event is corrected without breaking the book.** After a correction — and after a correction of that correction — the ledger still balances, both events are still visible with their reasons, and the leader can explain the chain in one sentence.

---

## 8. Decisions — all resolved

### 8.1 Resolved

1. **Member access — RESOLVED.** Members do not use the app in v1. A member is a **data record only**: name, phone, payout position, contribution history. No login, no app access, no writes, no reads. Features M1–M5 are cut from v1 and deferred to v2 (§9). DOMAIN.md §11 records the same exclusion. **v1 is leader-operated, single-user.**
2. **Correction mechanism — RESOLVED.** The remedy is an 8th ledger event type, `correction` (DOMAIN.md §5), with the shape:

   text
   correction_event {
   id, corrects_event_id, reason, corrected_by, timestamp,
   reverse: <mirror of original debits/credits>,
   apply: <optional new event>
   }

   Corrections are append-only, immutable, and reference the corrected event by id. The corrected event is never edited or deleted — it is marked corrected and stays visible with its reason. The ledger invariant holds because a correction is itself balanced. This enters v1 as feature **L16** and unblocks L4.

3. **Correcting a correction — RESOLVED.** A correction is just another event, so it can itself be corrected. **Every event is corrected at most once**, and the rule is identical for a correction as for a contribution: one correction per event, every event immutable. If a correction is wrong, the remedy is a correction-of-the-correction referencing the _correction_ event by id. The chain is `original → correction → correction-of-correction`, and it extends as far as facts require. The whole chain stays visible; history is never collapsed. (DOMAIN.md §5.)
4. **Accounts and identity — MOOT for v1.** With members outside the app and the leader as the sole user, the question of per-person sign-in has no v1 consequence. It returns in v2 with member self-service, which is exactly when it must be answered.
5. **Scale — CONFIRMED.** v1 target, in the group's own words: **one group, one leader, one device, up to ~30 members, one active cycle at a time. Offline-first, single-user.** Multi-group and multi-device are v2. This is now the binding v1 scale (§5), and it replaces DOMAIN.md's 8-member figure as the design target — 8 remains the DoD test case, ~30 is the ceiling the app must stay correct and usable at.

### 8.2 Still open

**None.** Every question raised in this document is resolved (8.1 items 1–5). Two things are deliberately _not_ opened here because they are v2 questions with no v1 consequence: multi-group and multi-device operation, and everything that follows from member self-service (§9).

No further v1 scope decisions are outstanding. This document is ready for approval.

---

## 9. Deferred to v2

Recorded here so the decision is not lost, not because v1 needs it.

| Item                                                     | Why deferred                                                                                                                                                                                                                                                                                                                       | What must be known before building it                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member login and self-service views (features M1–M5)** | Cut from v1 by decision: v1 is leader-operated, single-user. In v1 a member is a data record the leader maintains — name, phone, payout position, contribution history — with no login, no app access, no writes, and no reads. DOMAIN.md §11 records the exclusion; §6 records the exclusion of any member-facing surface at all. | How members authenticate, on whose device, and whether a member sees only their own record or the group's shared ledger. The need is real but unmeasured until a leader has run a full cycle solo.                                                      |
| **Auditor / read-only verification role**                | In v1 the leader can already read the full event history and verify balances (L14, L15). A separate role adds authorization complexity for a user whose needs are not yet specified.                                                                                                                                               | Who the auditor is, what they are _not_ allowed to see, whether they span one group or many, and whether "read-only" means read-everything. Until those are answered, "auditor" is a label, not a role.                                                 |
| **Automated SMS reminders**                              | DOMAIN.md §11 defers it explicitly.                                                                                                                                                                                                                                                                                                | Which events justify a message, and who pays for it.                                                                                                                                                                                                    |
| **Multi-group operation**                                | v1 is one group per app instance (§5, confirmed). Operating several groups independently from day one is not a v1 need.                                                                                                                                                                                                            | Whether groups must be isolated by default or shareable, whether a leader may run more than one, and whether any cross-group view is meaningful (DOMAIN.md §2 allows membership across cycles over time, not simultaneous operation).                   |
| **Multi-device operation**                               | v1 is one device holding the ledger (§5, confirmed). Two copies of the ledger agreeing is a different problem from one copy syncing.                                                                                                                                                                                               | Whether two devices are two writers or one writer plus a reader, what happens on concurrent contradictory writes to the same event, and how the leader arbitrates. Note this is where sync stops being a transport concern and becomes a rules concern. |

---

## 10. What this PRD deliberately does not contain

Per your instruction and the protocol: no language, framework, database, sync mechanism, folder structure, schema, API shape, or deployment decision appears anywhere above. Those are ARCHITECTURE.md's job, and I will write that only after you approve this document.

---

**End of PRD.md**
