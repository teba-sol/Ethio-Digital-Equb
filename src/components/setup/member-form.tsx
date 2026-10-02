"use client";

import { useState, type FormEvent } from "react";
import { constructMemberAdded } from "@/lib/ledger/construct";
import { writeEvent } from "@/db/queries";
import { getDeviceId } from "@/lib/device";

interface MemberFormProps {
  groupId: string;
  existingNames: string[];
}

export function MemberForm({ groupId, existingNames }: MemberFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [joinedAt, setJoinedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const duplicate =
    trimmedName.length > 0 &&
    existingNames.some((n) => n.toLowerCase() === trimmedName.toLowerCase());

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const event = constructMemberAdded({
        groupId,
        name,
        phone,
        joinedAt,
        recordedBy: "leader",
        deviceId,
      });
      await writeEvent(event);
      setName("");
      setPhone("");
      setJoinedAt(new Date().toISOString().slice(0, 10));
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
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          Name <span className="text-foreground/50">(required)</span>
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          placeholder="e.g. Alem Bekele"
          className="rounded border border-foreground/15 bg-background px-3 py-2 text-foreground"
        />
      </label>

      {duplicate && (
        <p className="text-sm text-amber-600">
          A member with this name already exists — adding anyway.
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          Phone <span className="text-foreground/50">(optional)</span>
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={20}
          placeholder="e.g. 0911 223 344"
          className="rounded border border-foreground/15 bg-background px-3 py-2 text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Join date</span>
        <input
          type="date"
          value={joinedAt}
          onChange={(e) => setJoinedAt(e.target.value)}
          className="rounded border border-foreground/15 bg-background px-3 py-2 text-foreground"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add member"}
      </button>
    </form>
  );
}
