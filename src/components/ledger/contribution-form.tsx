"use client";

import { useState, type FormEvent } from "react";
import { constructContribution } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";
import { formatMoney, parseMoney } from "@/lib/money";
import type { LedgerView } from "@/lib/ledger/types";

interface ContributionFormProps {
  view: LedgerView;
}

export function ContributionForm({ view }: ContributionFormProps) {
  const cycle = view.cycle;
  const groupId = view.group?.groupId ?? "";
  const cycleId = cycle?.id ?? "";

  const [memberId, setMemberId] = useState("");
  const [periodNumber, setPeriodNumber] = useState(
    String(
      view.cycleState.nextPayoutPeriod ?? view.cycleState.currentPeriod ?? 1,
    ),
  );
  const [amount, setAmount] = useState(
    cycle ? String(cycle.defaultAmount / 100) : "",
  );
  const [status, setStatus] = useState<"paid" | "missed">("paid");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!cycle) {
    return <p className="text-sm text-foreground/60">No active cycle.</p>;
  }

  const activeMembers = view.memberBalances.filter(
    (mb) => mb.status === "active",
  );
  const maxPeriod = view.cycleState.totalPeriods || 99;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!memberId || !cycleId || !groupId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const deviceId = await getDeviceId();
      const event = constructContribution({
        groupId,
        cycleId,
        memberId,
        periodNumber: Number(periodNumber),
        amount: status === "missed" ? "0" : amount,
        status,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(event);
      const member = view.memberBalances.find((m) => m.memberId === memberId);
      setSuccess(
        status === "paid"
          ? `Recorded: ${member?.name ?? "Member"} paid for period ${periodNumber}`
          : `Recorded: ${member?.name ?? "Member"} missed period ${periodNumber}`,
      );
      if (status === "paid") {
        setMemberId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <h3 className="text-lg font-semibold">Record Contribution</h3>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Member</span>
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          required
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        >
          <option value="">Select a member…</option>
          {activeMembers.map((mb) => (
            <option key={mb.memberId} value={mb.memberId}>
              {mb.name} {mb.hasReceivedPayout ? "(received)" : ""}
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStatus("paid")}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
            status === "paid"
              ? "bg-foreground text-background"
              : "border border-foreground/20 text-foreground/70"
          }`}
        >
          Paid
        </button>
        <button
          type="button"
          onClick={() => setStatus("missed")}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
            status === "missed"
              ? "bg-foreground text-background"
              : "border border-foreground/20 text-foreground/70"
          }`}
        >
          Missed
        </button>
      </div>

      {status === "paid" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Amount (ETB)</span>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 500"
            required
            className="rounded border border-foreground/15 bg-background px-3 py-2"
          />
          {parseMoney(amount) !== null && (
            <span className="text-xs text-foreground/50">
              {formatMoney(parseMoney(amount)!)}
            </span>
          )}
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <button
        type="submit"
        disabled={submitting || !memberId}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting
          ? "Recording…"
          : status === "paid"
            ? "Record Payment"
            : "Record Miss"}
      </button>
    </form>
  );
}
