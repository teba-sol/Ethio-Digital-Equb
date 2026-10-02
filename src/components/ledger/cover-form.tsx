"use client";

import { useState, type FormEvent } from "react";
import { constructCover, constructContribution } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";
import { formatMoney, parseMoney } from "@/lib/money";
import type { LedgerView } from "@/lib/ledger/types";

interface CoverFormProps {
  view: LedgerView;
}

export function CoverForm({ view }: CoverFormProps) {
  const cycle = view.cycle;
  const groupId = view.group?.groupId ?? "";
  const cycleId = cycle?.id ?? "";

  const [coveredMemberId, setCoveredMemberId] = useState("");
  const [coveringMemberId, setCoveringMemberId] = useState("");
  const [periodNumber, setPeriodNumber] = useState(
    String(
      view.cycleState.nextPayoutPeriod ?? view.cycleState.currentPeriod ?? 1,
    ),
  );
  const [amount, setAmount] = useState(
    cycle ? String(cycle.defaultAmount / 100) : "",
  );
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
    if (!coveredMemberId || !coveringMemberId || !cycleId || !groupId) return;
    if (coveredMemberId === coveringMemberId) {
      setError("A member cannot cover their own contribution");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const deviceId = await getDeviceId();

      // Record the contribution as covered
      const contribution = constructContribution({
        groupId,
        cycleId,
        memberId: coveredMemberId,
        periodNumber: Number(periodNumber),
        amount,
        status: "covered",
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(contribution);

      // Record the cover (creates the debt)
      const cover = constructCover({
        groupId,
        cycleId,
        coveredMemberId,
        coveringMemberId,
        periodNumber: Number(periodNumber),
        amount,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(cover);

      const covered = view.memberBalances.find(
        (m) => m.memberId === coveredMemberId,
      );
      const covering = view.memberBalances.find(
        (m) => m.memberId === coveringMemberId,
      );
      setSuccess(
        `Recorded: ${covering?.name ?? "Member"} covered ${covered?.name ?? "Member"}'s contribution for period ${periodNumber}`,
      );
      setCoveredMemberId("");
      setCoveringMemberId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <h3 className="text-lg font-semibold">Record Cover</h3>
      <p className="text-xs text-foreground/50">
        When one member pays on another&apos;s behalf. Creates a debt that
        settles at payout time (Rule 1).
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Who missed? (covered member)</span>
        <select
          value={coveredMemberId}
          onChange={(e) => setCoveredMemberId(e.target.value)}
          required
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        >
          <option value="">Select a member…</option>
          {activeMembers.map((mb) => (
            <option key={mb.memberId} value={mb.memberId}>
              {mb.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Who covered? (paying member)</span>
        <select
          value={coveringMemberId}
          onChange={(e) => setCoveringMemberId(e.target.value)}
          required
          className="rounded border border-foreground/15 bg-background px-3 py-2"
        >
          <option value="">Select a member…</option>
          {activeMembers
            .filter((mb) => mb.memberId !== coveredMemberId)
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

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <button
        type="submit"
        disabled={submitting || !coveredMemberId || !coveringMemberId}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Recording…" : "Record Cover"}
      </button>
    </form>
  );
}
