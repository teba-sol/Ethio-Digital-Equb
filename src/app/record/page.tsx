"use client";

import { useState } from "react";
import { useLedgerView } from "@/hooks/use-ledger";
import { ContributionForm } from "@/components/ledger/contribution-form";
import { CoverForm } from "@/components/ledger/cover-form";
import { PayoutForm } from "@/components/ledger/payout-form";
import { ExitForm } from "@/components/ledger/exit-form";
import { DefaultForm } from "@/components/ledger/default-form";

const actions = [
  { key: "contribution", label: "Contribution", description: "Record a payment or miss" },
  { key: "cover", label: "Cover", description: "One member pays for another" },
  { key: "payout", label: "Payout", description: "Give the pot to the next member" },
  { key: "exit", label: "Exit", description: "Member leaves the cycle" },
  { key: "default", label: "Default", description: "Post-payout non-payment" },
] as const;

type ActionKey = (typeof actions)[number]["key"];

export default function RecordPage() {
  const view = useLedgerView();
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);

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
        <p className="text-foreground/60">
          Create a group first on the Dashboard.
        </p>
      </main>
    );
  }

  if (view.cycle === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-foreground/60">
          Create a cycle first on the Dashboard.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <section className="flex w-full max-w-sm flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">Record</h1>
        <p className="text-sm text-foreground/60">
          {view.group.name} — Period {view.cycleState.currentPeriod} of{" "}
          {view.cycleState.totalPeriods}
        </p>
      </section>

      <section className="flex w-full max-w-sm flex-col gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={() =>
              setActiveAction(activeAction === action.key ? null : action.key)
            }
            className={`flex flex-col items-start rounded border px-4 py-3 text-left transition-colors ${
              activeAction === action.key
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-background text-foreground hover:border-foreground/30"
            }`}
          >
            <span className="font-medium">{action.label}</span>
            <span
              className={`text-xs ${
                activeAction === action.key ? "text-background/70" : "text-foreground/50"
              }`}
            >
              {action.description}
            </span>
          </button>
        ))}
      </section>

      {activeAction && (
        <section className="w-full max-w-sm rounded border border-foreground/15 bg-background p-4">
          {activeAction === "contribution" && <ContributionForm view={view} />}
          {activeAction === "cover" && <CoverForm view={view} />}
          {activeAction === "payout" && <PayoutForm view={view} />}
          {activeAction === "exit" && <ExitForm view={view} />}
          {activeAction === "default" && <DefaultForm view={view} />}
        </section>
      )}
    </main>
  );
}
