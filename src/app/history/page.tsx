"use client";

import { useLedgerView } from "@/hooks/use-ledger";
import { formatMoney } from "@/lib/money";
import { checkInvariants } from "@/lib/ledger/invariants";
import { useLiveQuery } from "dexie-react-hooks";
import { getAllEvents } from "@/db/queries";

export default function HistoryPage() {
  const view = useLedgerView();
  const events = useLiveQuery(() => getAllEvents(), []);

  if (view === undefined || events === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-foreground/60">Loading…</p>
      </main>
    );
  }

  if (view.group === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-foreground/60">Create a group first.</p>
      </main>
    );
  }

  const invariants = checkInvariants(events);

  // Show events in reverse chronological order (newest first)
  const reversed = [...view.history].reverse();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <section className="flex w-full max-w-sm flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm text-foreground/60">
          {view.group.name} — {view.history.length} events
        </p>
      </section>

      {/* Invariant badge */}
      <section
        className={`w-full max-w-sm rounded-lg border p-3 text-center text-sm ${
          invariants.ok
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}
      >
        {invariants.ok
          ? "✓ Ledger balances — all invariants hold"
          : "⚠ Ledger invariant check failed"}
      </section>

      {/* Event list */}
      <section className="w-full max-w-sm space-y-2">
        {reversed.map((entry) => {
          const e = entry.event;
          return (
            <div
              key={e.id}
              className={`rounded border p-3 text-sm ${
                entry.isReversed
                  ? "border-foreground/10 bg-foreground/5 opacity-60"
                  : "border-foreground/15 bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium">{entry.description}</p>
                  {entry.counterpartName && (
                    <p className="text-xs text-foreground/50">
                      with {entry.counterpartName}
                    </p>
                  )}
                  <p className="text-xs text-foreground/40">
                    {new Date(e.occurredAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                    e.type === "correction"
                      ? "bg-purple-100 text-purple-700"
                      : e.type === "contribution"
                        ? "bg-blue-100 text-blue-700"
                        : e.type === "cover"
                          ? "bg-amber-100 text-amber-700"
                          : e.type === "payout"
                            ? "bg-green-100 text-green-700"
                            : e.type === "exit_refund"
                              ? "bg-orange-100 text-orange-700"
                              : e.type === "default_event" ||
                                  e.type === "bad_debt_event"
                                ? "bg-red-100 text-red-700"
                                : "bg-foreground/10 text-foreground/60"
                  }`}
                >
                  {e.type.replace(/_/g, " ")}
                </span>
              </div>

              {/* Correction info */}
              {entry.correctedBy && (
                <div className="mt-2 rounded border border-purple-200 bg-purple-50 p-2 text-xs">
                  <p className="font-medium text-purple-800">
                    Corrected{entry.correctedBy.hasReplacement ? " & replaced" : ""}
                  </p>
                  <p className="text-purple-700">
                    Reason: {entry.correctedBy.reason}
                  </p>
                </div>
              )}

              {e.type === "correction" && (
                <div className="mt-2 rounded border border-purple-200 bg-purple-50 p-2 text-xs">
                  <p className="font-medium text-purple-800">
                    Correction event
                  </p>
                  <p className="text-purple-700">Reason: {e.reason}</p>
                  {e.apply && (
                    <p className="text-purple-600">
                      With replacement: {e.apply.type}
                    </p>
                  )}
                </div>
              )}

              {/* Amount display for money events */}
              {e.type === "contribution" && (
                <p className="mt-1 text-xs text-foreground/50">
                  {formatMoney(e.amount)} · Period {e.periodNumber} · {e.status}
                </p>
              )}
              {e.type === "cover" && (
                <p className="mt-1 text-xs text-foreground/50">
                  {formatMoney(e.amount)} · Period {e.periodNumber}
                </p>
              )}
              {e.type === "payout" && (
                <p className="mt-1 text-xs text-foreground/50">
                  Net {formatMoney(e.netAmount)} · Period {e.periodNumber}
                </p>
              )}
              {e.type === "exit_refund" && (
                <p className="mt-1 text-xs text-foreground/50">
                  {e.settlementType.replace(/_/g, " ")} · Refund{" "}
                  {formatMoney(e.refundAmount)}
                </p>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
