"use client";

import { useState, type FormEvent } from "react";
import { FREQUENCIES, type Frequency } from "@/lib/ledger/events";
import { constructGroupCreated } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function GroupForm() {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const event = constructGroupCreated({
        name,
        amount,
        frequency,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(event);
      setName("");
      setAmount("");
      setFrequency("weekly");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h2 className="text-xl font-semibold text-foreground">
        Create your ekub
      </h2>
      <p className="text-sm text-foreground/60">
        Set up the group the whole cycle will run on.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Group name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          placeholder="e.g. Neighbourhood Hebret"
          className="rounded border border-foreground/15 bg-background px-3 py-2 text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          Default contribution (ETB)
        </span>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500"
          required
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Create group"}
      </button>
    </form>
  );
}
