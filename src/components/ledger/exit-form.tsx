"use client";

import { useState, type FormEvent } from "react";
import { constructExitRefund } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";
import { formatMoney } from "@/lib/money";
import { SETTLEMENT_LABELS, type SettlementType } from "@/lib/ledger/events";
import type { LedgerView } from "@/lib/ledger/types";

interface ExitFormProps {
  view: LedgerView;
}

export function ExitForm({ view }: ExitFormProps) {
  const cycle = view.cycle;
  const groupId = view.group?.groupId ?? "";
  const cycleId = cycle?.id ?? "";

  const [memberId, setMemberId] = useState("");
  const [settlementType, setSettlementType] =
    useState<SettlementType>("HALF_REFUND");
  const [reason, setReason] = useState("");
  const [consentNote, setConsentNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!cycle) {
    return <p className="text-sm text-foreground/60">No active cycle.</p>;
  }

  // Only members who haven't received payout can exit (Rule 2)
  const eligibleMembers = view.memberBalances.filter(
    (mb) => mb.status === "active" && !mb.hasReceivedPayout,
  );
  const selectedMember = view.memberBalances.find(
    (mb) => mb.memberId === memberId,
  );

  // Preview refund calculation
  const preview = selectedMember
    ? {
        totalContributed: selectedMember.totalContributed,
        outstandingDebts: selectedMember.totalOwed,
        availablePot: cycle.defaultAmount * view.cycleState.activeOrder.length,
      }
    : null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const activeCycle = view.cycle;
    if (!memberId || !cycleId || !groupId || !reason.trim() || !activeCycle)
      return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const deviceId = await getDeviceId();
      const member = view.memberBalances.find((m) => m.memberId === memberId);
      if (!member) throw new Error("Member not found");

      const event = constructExitRefund({
        groupId,
        cycleId,
        memberId,
        settlementType,
        totalContributed: String(member.totalContributed / 100),
        availablePot: String(
          (activeCycle.defaultAmount * view.cycleState.activeOrder.length) /
            100,
        ),
        outstandingDebtsOwed: String(member.totalOwed / 100),
        reason,
        consentNote: consentNote || null,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(event);

      setSuccess(
        `Recorded: ${member.name} exited (${SETTLEMENT_LABELS[settlementType]})`,
      );
      setMemberId("");
      setReason("");
      setConsentNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <h3 className="text-lg font-semibold">Record Exit</h3>
      <p className="text-xs text-foreground/50">
        Only permitted before a member has received their payout (Rule 2).
        Refund is capped to available pot (Rule 5).
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Who is exiting?</span>
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          required
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        >
          <option value="">Select a member…</option>
          {eligibleMembers.map((mb) => (
            <option key={mb.memberId} value={mb.memberId}>
              {mb.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Settlement type</span>
        <select
          value={settlementType}
          onChange={(e) => setSettlementType(e.target.value as SettlementType)}
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        >
          {(
            Object.entries(SETTLEMENT_LABELS) as [
              SettlementType,
              string,
            ][]
          ).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {preview && (
        <div className="rounded border border-foreground/15 bg-foreground/5 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-foreground/60">Contributed so far</span>
            <span>{formatMoney(preview.totalContributed)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/60">Outstanding debts</span>
            <span>{formatMoney(preview.outstandingDebts)}</span>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Reason <span className="text-foreground/50">(required)</span>
        </span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Moving to another city"
          required
          maxLength={500}
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Group consent note <span className="text-foreground/50">(optional)</span>
        </span>
        <input
          type="text"
          value={consentNote}
          onChange={(e) => setConsentNote(e.target.value)}
          placeholder="e.g. Agreed by all members on Jan 15"
          maxLength={500}
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <button
        type="submit"
        disabled={submitting || !memberId || !reason.trim()}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Recording…" : "Record Exit"}
      </button>
    </form>
  );
}
