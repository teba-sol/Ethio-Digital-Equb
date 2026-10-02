# DOMAIN.md — Ekub (ROSCA) Domain Reference

**Status:** Locked — v1.1
**Purpose:** Source of truth for all business rules. Every schema, API, and UI decision must trace back to a rule in this file.
**Audience:** The developer (me) and any AI assistant working on this project.

---

## 1. What it is

A rotating savings and credit association. A group of members contributes a fixed amount on a fixed schedule. Each period, one member receives the entire pool (the "pot"). This rotates until every member has received it once. Then the cycle ends and a new one may begin.

---

## 2. Core concepts

**Group (Ekub)**

- A named, persistent set of members
- Has a default contribution amount and frequency (e.g., 500 ETB weekly)
- Runs multiple cycles over its lifetime
- Has a leader/treasurer who operates the app

**Member**

- A person in the group
- Has: name, phone, join date
- Belongs to one or more cycles over time
- Has a payout position in each cycle (fixed at cycle start)

**Cycle (round)**

- One full rotation: first payout → last payout
- Has: start date, contribution amount, frequency, member list, payout order
- Number of periods = number of members (unless reduced by an exit — see Rule 2)
- Ends when every active member has received exactly one payout

**Contribution**

- A member's payment for one period
- Has: member, cycle, period number, amount, date, status (`paid` / `covered` / `missed` / `defaulted`)
- May be paid by the member **or by a covering member**

**Cover (debt)**

- When member A misses a contribution, member B pays on A's behalf
- Creates a **debt**: A owes B the covered amount
- **When A's payout turn arrives**, the debt is deducted from A's payout and paid to B automatically
- Covered amounts settle at payout time — no chasing debt outside the app

**Payout (the "turn")**

- One member receives the pot for that period
- Fixed order, decided by group agreement at cycle start
- Amount = sum of contributions collected that period, minus any refund owed, minus any debt deductions
- Only one payout per period

**Exit**

- A member leaving a cycle **before** receiving their payout, by group agreement
- Settlement is decided by the group: full refund / half refund / no refund
- Their payout slot is cancelled
- After receiving payout, exit is **not permitted** (see Rule 2)

**Default**

- A member who has already received payout but stops contributing
- Recorded as an event; enforcement is outside the app (social/legal)

**Forfeit redistribution**

- If an exiting member is entitled to a refund, that amount comes out of the pot
- If not entitled (NO_REFUND), their contributions remain in the group's pool and effectively benefit remaining members

---

## 3. Business rules (locked)

### Rule 1 — Missed contributions are covered by another member

When member A misses a contribution:

- Another member B covers it
- The app records: **A owes B** the covered amount
- The pot for that period is **full** (not reduced)
- When A's payout turn arrives, the amount A owes is deducted from A's payout and paid to B automatically

Multiple covers allowed: B and C can each cover half of A's missed contribution.

### Rule 2 — Exit is only permitted before payout, and only by group agreement

**State A: Not yet received payout**

- Member may exit mid-cycle, **only by group agreement**
- The group decides settlement, recorded as one of:
  - `FULL_REFUND` — member gets back all contributions made so far
  - `HALF_REFUND` — member gets back 50% of contributions made so far
  - `NO_REFUND` — member gets nothing back
- Refund is deducted from the pot of the **next period** (capped to available pot — see Rule 5)
- Their payout turn is **cancelled**; remaining members keep their relative order
- **If the exiting member owes cover debts, those are settled first from the refund**, then the remainder goes to the member
- If the refund is `NO_REFUND`, the exiting member's contributions remain in the pool and benefit the group

**State B: Already received payout**

- **Exit is not permitted. Period.**
- They are bound to keep contributing for the rest of the cycle
- If they stop contributing anyway, it is a **default** (see Rule 2b)

### Rule 2b — Defaults (post-payout non-payment)

Once a member has received their payout, if they stop contributing:

- The app records a `default_event` for each missed period
- Their name is flagged in the UI (visible to the group)
- The group may cover or absorb the shortfall
- The app does not attempt recovery — enforcement is social/legal

### Rule 3 — Payout order is agreed by the group at cycle start

- Order is decided before the cycle begins, by mutual agreement
- Once the cycle starts, the order is **locked**
- Changes to order are recorded as events, not overwrites — history is kept
- If a member exits (Rule 2), their slot is removed; subsequent positions shift up

### Rule 4 — All debts settle at payout time

- When a member receives their payout, all outstanding cover debts are deducted first
- The deducted amount is paid to the lenders
- If the payout is smaller than the total debt, the payout goes entirely to lenders and any remainder is written off (recorded as a `bad_debt_event`)

### Rule 5 — Refunds are capped to available pot

- A refund cannot exceed the current period's pot
- If the full refund would exceed the pot, it is capped to what's available
- The cap is recorded in the exit event

### Rule 6 — No replacement members mid-cycle

- If a member exits, the cycle simply runs with N-1 payouts
- The cycle ends one period early
- No new member fills the vacated slot

### Rule 7 — Group leader records the decision

- Exit settlements are recorded by the leader (the app operator)
- The leader enters: settlement type, reason (free text), and a note on group consent
- The app does not vote or decide — it records

---

## 4. The ledger invariant

**System-level (must always be true):**
SUM(all debits) == SUM(all credits)

text

**Cycle-level (true at cycle end, assuming no outstanding debts):**
SUM(contributions received into pot) == SUM(payouts distributed) + SUM(refunds paid)

text

If defaults or bad debts occurred, the difference is recorded as a **loss event** — the ledger still balances, but the group absorbed the loss.

**Individual member invariant (clean cycle, no covers, no exits):**
total_contributed == total_received
With covers and exits, individual balances shift — lenders end with more, borrowers with less, exiting members settle according to their refund type.

---

## 5. Ledger events (the eight mutation types)

Every mutation to the system is one of these events. All are **append-only and immutable**.

| Event                    | Ledger effect                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `contribution`           | Debit cash, credit member equity                                                                      |
| `cover`                  | Member A debit, Member B credit (creates debt)                                                        |
| `payout`                 | Debit member equity, credit cash (minus debt offsets)                                                 |
| `exit_refund`            | Debit cash or pot, credit exiting member equity                                                       |
| `forfeit_redistribution` | Debit exiting member equity, credit each remaining member                                             |
| `default_event`          | Debit group loss account, credit member equity (marks unpaid)                                         |
| `bad_debt_event`         | Debit group loss account, credit lender equity (writes off uncollectible)                             |
| `correction`             | Reverses the debits/credits of a prior event, and optionally applies a replacement event in its place |

### Correction event (the 8th event type)

When a recorded event is wrong, it is **corrected, never edited**. A correction is itself an
append-only, immutable ledger event. It references the corrected event by id, states why, and
carries (a) the exact mirror of the original event's debits and credits and (b) an optional new
event applied in place of the corrected one.

text
correction_event {
id, corrects_event_id, reason, corrected_by, timestamp,
reverse: <mirror of original debits/credits>,
apply: <optional new event>
}

Rules:

- A correction reference `corrects_event_id` is the id of the event being corrected.
- `reverse` is the exact mirror of the original event's ledger effect: what was debited is
  credited and vice versa. Applied alone, it fully nullifies the corrected event.
- `apply` is optional. Where the correct fact is known, it carries the replacement event
  (for example, the same contribution recorded against the right member and the right period).
  Where the correct fact is unknown or not yet known, `apply` is omitted and the corrected event
  is simply reversed.
- `reason` is free text (the group's stated reason) and `corrected_by` names the leader who
  recorded the correction.
- A correction is **always balanced** — it is a set of debits and credits that nets to zero —
  so the system-level invariant in §4 continues to hold across the correction.
- **A correction is just another event, so it too can be corrected.** An event — of any type,
  including a correction — may be corrected **at most once**. The rule does not change: each event
  is corrected once, and every event is immutable.
- If a correction is wrong, the remedy is a **correction-of-the-correction**, which references the
  _correction_ event by id. The chain is `original → correction → correction-of-correction`, and it
  can continue as far as facts require: each new correction references the event it corrects.
- The corrected event is never edited or deleted. It is marked corrected, remains visible in the
  record, and is shown alongside its reason and its correcting event. The whole chain stays visible —
  history is never collapsed, and no link is hidden.
- Derived balances are computed over all events in the chain, so applying a balanced correction and
  its balanced correction-of-correction in order always restores the ledger to what the corrected
  facts imply.

Balances are **always derived** from events. Never stored as a mutable column.

**No event is ever edited or deleted; corrections reference and reverse.**

---

## 6. Where disputes happen (and what the app prevents)

1. **"I already paid that week"** → each contribution has payer + timestamp + receipt
2. **"You didn't give me the full pot"** → payout amount shown with itemized deductions
3. **"It's my turn, not yours"** → payout order fixed and shown
4. **"I already received my payout"** → payout recorded with date + amount
5. **"He owes me for covering last week"** → cover debt tracked, auto-deducted at payout
6. **"He stopped paying and disappeared"** → default_event recorded; UI flags member
7. **"I want to leave and take back my money"** → exit_event records group decision; refund calculated and capped
8. **"The numbers don't add up"** → ledger balances to zero; any discrepancy is a bug, provable

---

## 7. Edge cases handled

1. **Multiple covers accumulate** — all debts deducted at payout time
2. **Debt exceeds payout** — payout goes to lenders; remainder written off as bad_debt
3. **Exit before anyone has received payout** — refund from next pot; cycle runs N-1 periods
4. **Exit after payout** — not permitted; becomes default
5. **Refund exceeds pot** — capped to available (Rule 5)
6. **Exiting member owed debts** — debts settled from refund first (Rule 2)
7. **Cycle ends with unpaid debts** — loss recorded; ledger still balances

---

## 8. Open decisions — RESOLVED

These were the questions to answer before coding. All locked:

1. **Refund mechanics:** Refund reduces the next period's pot, shown explicitly in the UI.
2. **Cycle length after exit:** Cycle ends one period early (N-1 payouts). No replacement member.
3. **Debt priority on exit:** Cover debts paid first from refund; remainder to exiting member.
4. **Multiple covers per period:** Allowed. Two members can each cover half.
5. **Refund cap:** Capped to available pot for that period.
6. **Approval record:** Leader records with free-text note on group consent.
7. **Post-payout stop:** Recorded as default, not exit.

---

## 9. Vocabulary (use consistently)

| Correct      | Avoid                     |
| ------------ | ------------------------- |
| Cycle        | round, session            |
| Payout       | win, reward, distribution |
| Cover        | loan, borrow              |
| Exit         | leave, quit, withdraw     |
| Default      | run away, ghost           |
| Contribution | payment, deposit          |
| Pot          | pool, fund, cash          |
| Debt         | balance owed              |
| Settlement   | resolution                |

Keep this consistent across code, database, UI, and conversations with AI.

---

## 10. What success looks like (project-level DoD)

- Two members added offline; both sync without duplication
- A contribution recorded against the wrong member is corrected by a balanced `correction` event; the ledger still balances, and the corrected event stays visible with its reason
- A correction that is itself wrong is corrected by a correction-of-the-correction: each event is corrected at most once, the full chain stays visible, and the ledger still balances
- A full cycle with 8 members completes; ledger balances to zero at end
- Killing network mid-contribution still records locally, syncs later
- No contribution can be recorded twice, even if button pressed twice
- Every balance in UI is derived from events, never stored
- A cover creates a debt; a payout for the covered member pays the lender automatically
- An exit with HALF_REFUND records correctly and reduces the next pot
- An exit with NO_REFUND leaves contributions in the group's pool
- Refund cap prevents next receiver from getting a negative pot
- Every dispute from section 6 can be answered by the app with a timestamp

---

## 11. Out of scope (v1)

- Enforcing payment from defaulters
- Legal debt recovery
- Multi-currency support
- Integration with banks or mobile money
- Voting features (leader records decisions manually)
- Replacement members mid-cycle
- Automated reminders via SMS (v2)
- Member login and self-service views are v2. In v1, members exist as data records only; the leader is the sole app user.

---

**End of DOMAIN.md**
