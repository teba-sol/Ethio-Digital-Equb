"use client";

import { useState, useMemo, type FormEvent } from "react";
import { constructPayout } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";
import { formatMoney } from "@/lib/money";
import type { LedgerView } from "@/lib/ledger/types";

interface PayoutFormProps {
  view: LedgerView;
}

interface DebtLine {
  debtId: string;
  toMemberId: string;
  toMemberName: string;
  amount: number;
}

export function PayoutForm({ view }: PayoutFormProps) {
  const cycle = view.cycle;
  const groupId = view.group?.groupId ?? "";
  const cycleId = cycle?.id ?? "";

  const [memberId, setMemberId] = useState(
    view.cycleState.nextPayoutMemberId ?? "",
  );
  const [periodNumber, setPeriodNumber] = useState(
    String(
      view.cycleState.nextPayoutPeriod ?? view.cycleState.currentPeriod ?? 1,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Compute deductions for the selected member (Rule 4)
  const deductions = useMemo(() => {
    if (!memberId || !cycle) return { debts: [] as DebtLine[], totalDebt: 0 };

    const debts = view.debtLedger
      .filter(
        (d) =>
          d.fromMemberId === memberId &&
          d.settledByPayoutId === null &&
          !d.writtenOff,
      )
      .map((d) => ({
        debtId: d.id,
        toMemberId: d.toMemberId,
        toMemberName: d.toMemberName,
        amount: d.amount,
      }));

    const totalDebt = debts.reduce((s, d) => s + d.amount, 0);
    return { debts, totalDebt };
  }, [memberId, cycle, view.debtLedger]);

  if (!cycle) {
    return <p className="text-sm text-foreground/60">No active cycle.</p>;
  }

  const activeMembers = view.memberBalances.filter(
    (mb) => mb.status === "active" && !mb.hasReceivedPayout,
  );
  const maxPeriod = view.cycleState.totalPeriods || 99;
  const selectedMember = view.memberBalances.find(
    (mb) => mb.memberId === memberId,
  );

  const grossPot = cycle.defaultAmount * (view.cycleState.activeOrder.length || 1);
  const netAfterDebts = grossPot - deductions.totalDebt;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!memberId || !cycleId || !groupId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const deviceId = await getDeviceId();

      const payoutDeductions = deductions.debts.map((d) => ({
        kind: "debt" as const,
        toMemberId: d.toMemberId,
        fromMemberId: memberId,
        amount: String(d.amount / 100),
        note: "Cover settlement",
      }));

      const event = constructPayout({
        groupId,
        cycleId,
        memberId,
        periodNumber: Number(periodNumber),
        grossPot: String(grossPot / 100),
        deductions: payoutDeductions,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(event);

      setSuccess(
        `Recorded: ${selectedMember?.name ?? "Member"} received payout for period ${periodNumber}${
          deductions.totalDebt > 0
            ? ` (${formatMoney(deductions.totalDebt)} settled to lenders)`
            : ""
        }`,
      );
      setMemberId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <h3 className="text-lg font-semibold">Record Payout</h3>
      <p className="text-xs text-foreground/50">
        Debts are deducted first and paid to lenders automatically (Rule 4).
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Who receives the pot?</span>
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          required
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        >
          <option value="">Select a member…</option>
          {view.cycleState.nextPayoutMemberId && (
            <option value={view.cycleState.nextPayoutMemberId}>
              {view.cycleState.nextPayoutMemberName} (next in order)
            </option>
          )}
          {activeMembers
            .filter((mb) => mb.memberId !== view.cycleState.nextPayoutMemberId)
            .map((mb) => (
              <option key={mb.memberId} value={mb.memberId}>
                {mb.name}
              </option>
            ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Period</span>
        <input
          type="number"
          min={1}
          max={maxPeriod}
          value={periodNumber}
          onChange={(e) => setPeriodNumber(e.target.value)}
          required
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        />
      </label>

      {/* Itemized deductions preview (Rule 4) */}
      {memberId && (
        <div className="rounded border border-foreground/15 bg-foreground/5 p-3">
          <h4 className="text-sm font-semibold">Payout Breakdown</h4>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-foreground/60">Gross pot</span>
              <span>{formatMoney(grossPot)}</span>
            </div>
            {deductions.debts.length > 0 && (
              <>
                <div className="border-t border-foreground/10 pt-1 text-xs font-medium text-foreground/50">
                  Debt deductions
                </div>
                {deductions.debts.map((d) => (
                  <div
                    key={d.debtId}
                    className="flex justify-between pl-2 text-xs"
                  >
                    <span className="text-foreground/60">
                      → {d.toMemberName}
                    </span>
                    <span>-{formatMoney(d.amount)}</span>
                  </div>
                ))}
              </>
            )}
            <div className="flex justify-between border-t border-foreground/10 pt-1 font-semibold">
              <span>Net to {selectedMember?.name ?? "receiver"}</span>
              <span>{formatMoney(Math.max(0, netAfterDebts))}</span>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <button
        type="submit"
        disabled={submitting || !memberId}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Recording…" : "Confirm Payout"}
      </button>
    </form>
  );
}
