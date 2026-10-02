"use client";

import { useState, type FormEvent } from "react";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  type Frequency,
} from "@/lib/ledger/events";
import { constructCycleCreated } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";
import type { MemberAdded } from "@/lib/ledger/events";

interface CycleFormProps {
  groupId: string;
  defaultAmountSantim: number;
  defaultFrequency: Frequency;
  members: MemberAdded[];
}

export function CycleForm({
  groupId,
  defaultAmountSantim,
  defaultFrequency,
  members,
}: CycleFormProps) {
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState((defaultAmountSantim / 100).toFixed(2));
  const [frequency, setFrequency] = useState<Frequency>(defaultFrequency);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const available = members.filter((m) => !order.includes(m.memberId));
  const orderedMembers = order
    .map((id) => members.find((m) => m.memberId === id))
    .filter((m): m is MemberAdded => m !== undefined);

  function addToOrder(memberId: string) {
    setOrder((prev) => [...prev, memberId]);
  }

  function removeFromOrder(memberId: string) {
    setOrder((prev) => prev.filter((id) => id !== memberId));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const event = constructCycleCreated({
        groupId,
        startDate,
        amount,
        frequency,
        memberIds: order,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-3"
    >
      <h2 className="text-lg font-semibold text-foreground">Start a cycle</h2>
      {members.length < 2 && (
        <p className="text-sm text-amber-600">
          Add at least two members before starting a cycle.
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Start date</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded border border-foreground/15 bg-background px-3 py-2 text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          Contribution (ETB)
        </span>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500"
          className="rounded border border-foreground/15 bg-background px-3 py-2 text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Frequency</span>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          className="rounded border border-foreground/15 bg-background px-3 py-2 text-foreground"
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          Payout order — tap members in the agreed order
        </span>
        <p className="text-xs text-foreground/50">
          First tapped = first payout. Tap again to remove.
        </p>
        {order.length === 0 ? (
          <p className="text-sm text-foreground/40">No members chosen yet.</p>
        ) : (
          <ol className="list-inside list-decimal text-sm text-foreground">
            {orderedMembers.map((m) => (
              <li key={m.memberId} className="flex items-center gap-2 py-0.5">
                <span className="flex-1">{m.name}</span>
                <button
                  type="button"
                  onClick={() => removeFromOrder(m.memberId)}
                  className="text-sm text-foreground/50 hover:text-red-600"
                >
                  remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {available.map((m) => (
            <button
              key={m.memberId}
              type="button"
              onClick={() => addToOrder(m.memberId)}
              className="rounded border border-foreground/15 px-3 py-1 text-sm text-foreground hover:bg-foreground/5"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || order.length < 2}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Start cycle"}
      </button>
    </form>
  );
}
