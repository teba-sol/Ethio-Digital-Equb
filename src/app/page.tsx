"use client";

import Link from "next/link";
import { useLedgerView } from "@/hooks/use-ledger";
import { GroupForm } from "@/components/setup/group-form";
import { MemberForm } from "@/components/setup/member-form";
import { MemberList } from "@/components/setup/member-list";
import { CycleForm } from "@/components/setup/cycle-form";
import { CycleSummary } from "@/components/setup/cycle-summary";
import { formatMoney } from "@/lib/money";

export default function Home() {
  const view = useLedgerView();

  if (view === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-foreground/60">Loading…</p>
      </main>
    );
  }

  if (view.group === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <GroupForm />
      </main>
    );
  }

  const { group, members, cycle, cycleState, memberBalances, lossPosition } = view;

  // Setup flow: group exists but no cycle yet
  if (cycle === null) {
    return (
      <main className="flex flex-1 flex-col items-center gap-8 p-6">
        <section className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-semibold text-foreground">{group.name}</h1>
          <p className="text-lg text-foreground/60">
            {formatMoney(group.defaultAmount)} — {group.frequency}
          </p>
          <p className="text-sm text-foreground/50">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </section>

        <section className="flex w-full max-w-sm flex-col items-start gap-4">
          <CycleForm
            groupId={group.groupId}
            defaultAmountSantim={group.defaultAmount}
            defaultFrequency={group.frequency}
            members={members}
          />
        </section>

        <section className="flex w-full max-w-sm flex-col items-start gap-4">
          <h2 className="text-lg font-semibold text-foreground">Members</h2>
          {members.length > 0 && <MemberList members={members} />}
          <MemberForm
            groupId={group.groupId}
            existingNames={members.map((m) => m.name)}
          />
        </section>
      </main>
    );
  }

  // Cycle dashboard (L10)
  const activeMembers = memberBalances.filter((mb) => mb.status === "active");
  const paidCount = Object.values(cycleState.periods).reduce(
    (s, p) => s + p.paidMemberIds.length,
    0,
  );
  const uncoveredMisses = Object.values(cycleState.periods).flatMap(
    (p) => p.missedMemberIds,
  );

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      {/* Group header */}
      <section className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        <p className="text-sm text-foreground/60">
          {formatMoney(group.defaultAmount)} — {group.frequency}
        </p>
      </section>

      {/* Cycle status card */}
      <section className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Cycle Status</h2>
          {cycleState.closed ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Complete
            </span>
          ) : (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              Active
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-foreground/50">Period</p>
            <p className="text-lg font-semibold">
              {cycleState.currentPeriod} / {cycleState.totalPeriods}
            </p>
          </div>
          <div>
            <p className="text-foreground/50">Members</p>
            <p className="text-lg font-semibold">{activeMembers.length}</p>
          </div>
        </div>

        {!cycleState.closed && cycleState.nextPayoutMemberName && (
          <div className="mt-3 rounded bg-foreground/5 p-3">
            <p className="text-xs text-foreground/50">Next payout</p>
            <p className="font-medium">
              {cycleState.nextPayoutMemberName} — Period{" "}
              {cycleState.nextPayoutPeriod}
            </p>
          </div>
        )}

        {cycleState.outstandingDebtTotal > 0 && (
          <div className="mt-2 rounded bg-amber-50 p-3 text-sm">
            <p className="text-amber-800">
              {formatMoney(cycleState.outstandingDebtTotal)} in outstanding debts
            </p>
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section className="flex w-full max-w-sm gap-2">
        <Link
          href="/record"
          className="flex-1 rounded bg-foreground px-4 py-3 text-center font-medium text-background"
        >
          Record
        </Link>
        <Link
          href="/ledger"
          className="flex-1 rounded border border-foreground/20 px-4 py-3 text-center font-medium"
        >
          Debts
        </Link>
      </section>

      {/* Member standings */}
      <section className="w-full max-w-sm">
        <h2 className="mb-2 text-lg font-semibold">Member Standings</h2>
        <div className="rounded-lg border border-foreground/15">
          {memberBalances.map((mb, i) => (
            <div
              key={mb.memberId}
              className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                i > 0 ? "border-t border-foreground/10" : ""
              } ${mb.status === "exited" ? "opacity-50" : ""}`}
            >
              <div className="flex flex-col">
                <span className="font-medium">{mb.name}</span>
                <span className="text-xs text-foreground/50">
                  {mb.payoutPosition && `Position #${mb.payoutPosition}`}
                  {mb.status === "exited" && " · Exited"}
                  {mb.status === "defaulted" && " · Defaulted"}
                </span>
              </div>
              <div className="text-right">
                <p className="font-medium">
                  {mb.hasReceivedPayout
                    ? `+${formatMoney(mb.totalReceived)}`
                    : "—"}
                </p>
                <p className="text-xs text-foreground/50">
                  {formatMoney(mb.totalContributed)} paid
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Loss position (if any) */}
      {lossPosition.totalLoss > 0 && (
        <section className="w-full max-w-sm rounded-lg border border-red-200 bg-red-50 p-4">
          <h2 className="font-semibold text-red-800">Loss Position</h2>
          <div className="mt-2 space-y-1 text-sm text-red-700">
            {lossPosition.totalDefaults > 0 && (
              <p>
                Defaults: {formatMoney(lossPosition.totalDefaults)} (
                {lossPosition.defaultsByMember.length} member
                {lossPosition.defaultsByMember.length === 1 ? "" : "s"})
              </p>
            )}
            {lossPosition.totalBadDebts > 0 && (
              <p>
                Bad debts: {formatMoney(lossPosition.totalBadDebts)} (
                {lossPosition.badDebtsByLender.length} lender
                {lossPosition.badDebtsByLender.length === 1 ? "" : "s"})
              </p>
            )}
          </div>
        </section>
      )}

      {/* History link */}
      <section className="w-full max-w-sm">
        <Link
          href="/history"
          className="block rounded border border-foreground/15 px-4 py-3 text-center text-sm text-foreground/70 hover:border-foreground/30"
        >
          View full history ({view.history.length} events)
        </Link>
      </section>
    </main>
  );
}
