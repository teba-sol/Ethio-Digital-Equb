"use client";

import { useState, type FormEvent } from "react";
import { constructDefaultEvent } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";
import { formatMoney, parseMoney } from "@/lib/money";
import type { LedgerView } from "@/lib/ledger/types";

interface DefaultFormProps {
  view: LedgerView;
}

export function DefaultForm({ view }: DefaultFormProps) {
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
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!cycle) {
    return <p className="text-sm text-foreground/60">No active cycle.</p>;
  }

  // Defaults are for members who already received payout but stopped paying (Rule 2b)
  const defaultableMembers = view.memberBalances.filter(
    (mb) => mb.status === "active" && mb.hasReceivedPayout,
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
      const event = constructDefaultEvent({
        groupId,
        cycleId,
        memberId,
        periodNumber: Number(periodNumber),
        amount,
        reason: reason || null,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(event);

      const member = view.memberBalances.find((m) => m.memberId === memberId);
      setSuccess(
        `Recorded: ${member?.name ?? "Member"} defaulted for period ${periodNumber}`,
      );
      setMemberId("");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <h3 className="text-lg font-semibold">Record Default</h3>
      <p className="text-xs text-foreground/50">
        For members who already received their payout but stopped contributing
        (Rule 2b). The app records — it does not enforce.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Member</span>
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          required
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        >
          <option value="">Select a member…</option>
          {defaultableMembers.length === 0 ? (
            <option value="" disabled>
              No members have received payout yet
            </option>
          ) : (
            defaultableMembers.map((mb) => (
              <option key={mb.memberId} value={mb.memberId}>
                {mb.name} (received {formatMoney(mb.totalReceived)})
              </option>
            ))
          )}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Period missed</span>
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

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Amount missed (ETB)</span>
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

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Reason <span className="text-foreground/50">(optional)</span>
        </span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Stopped attending meetings"
          maxLength={500}
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <button
        type="submit"
        disabled={submitting || !memberId}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Recording…" : "Record Default"}
      </button>
    </form>
  );
}
