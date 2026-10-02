"use client";

import { useLedgerView } from "@/hooks/use-ledger";
import { formatMoney } from "@/lib/money";

export default function LedgerPage() {
  const view = useLedgerView();

  if (view === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-foreground/60">Loading…</p>
      </main>
    );
  }

  if (view.group === null || view.cycle === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-foreground/60">Set up a group and cycle first.</p>
      </main>
    );
  }

  const outstanding = view.debtLedger.filter(
    (d) => d.settledByPayoutId === null && !d.writtenOff,
  );
  const settled = view.debtLedger.filter((d) => d.settledByPayoutId !== null);
  const writtenOff = view.debtLedger.filter((d) => d.writtenOff);

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <section className="flex w-full max-w-sm flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">Debt Ledger</h1>
        <p className="text-sm text-foreground/60">
          {view.group.name} — who owes whom
        </p>
      </section>

      {/* Outstanding debts */}
      <section className="w-full max-w-sm">
        <h2 className="mb-2 text-lg font-semibold">
          Outstanding ({outstanding.length})
        </h2>
        {outstanding.length === 0 ? (
          <p className="rounded border border-foreground/10 p-4 text-sm text-foreground/50">
            No outstanding debts.
          </p>
        ) : (
          <div className="space-y-2">
            {outstanding.map((debt) => (
              <div
                key={debt.id}
                className="rounded border border-amber-200 bg-amber-50 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {debt.fromMemberName} → {debt.toMemberName}
                  </span>
                  <span className="font-semibold text-amber-800">
                    {formatMoney(debt.amount)}
                  </span>
                </div>
                <p className="text-xs text-foreground/50">
                  Period {debt.periodNumber} · settles at payout (Rule 4)
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settled debts */}
      {settled.length > 0 && (
        <section className="w-full max-w-sm">
          <h2 className="mb-2 text-lg font-semibold">
            Settled ({settled.length})
          </h2>
          <div className="rounded-lg border border-foreground/15">
            {settled.map((debt, i) => (
              <div
                key={debt.id}
                className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                  i > 0 ? "border-t border-foreground/10" : ""
                }`}
              >
                <div>
                  <span className="font-medium">
                    {debt.fromMemberName} → {debt.toMemberName}
                  </span>
                  <p className="text-xs text-foreground/50">
                    Period {debt.periodNumber}
                  </p>
                </div>
                <div className="text-right">
                  <p className="line-through text-foreground/40">
                    {formatMoney(debt.amount)}
                  </p>
                  <p className="text-xs text-green-600">Settled</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Written off */}
      {writtenOff.length > 0 && (
        <section className="w-full max-w-sm">
          <h2 className="mb-2 text-lg font-semibold">
            Written Off ({writtenOff.length})
          </h2>
          <div className="rounded-lg border border-red-200 bg-red-50">
            {writtenOff.map((debt, i) => (
              <div
                key={debt.id}
                className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                  i > 0 ? "border-t border-red-100" : ""
                }`}
              >
                <div>
                  <span className="font-medium">
                    {debt.fromMemberName} → {debt.toMemberName}
                  </span>
                  <p className="text-xs text-red-600">
                    Period {debt.periodNumber} · bad debt
                  </p>
                </div>
                <span className="font-semibold text-red-700">
                  {formatMoney(debt.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Loss summary */}
      {view.lossPosition.totalLoss > 0 && (
        <section className="w-full max-w-sm rounded-lg border border-foreground/15 p-4">
          <h2 className="font-semibold">Loss Breakdown (L15)</h2>
          <div className="mt-2 space-y-2 text-sm">
            {view.lossPosition.defaultsByMember.map((d) => (
              <div key={d.memberId} className="flex justify-between">
                <span className="text-foreground/60">
                  Default: {d.name}
                </span>
                <span className="text-red-600">{formatMoney(d.amount)}</span>
              </div>
            ))}
            {view.lossPosition.badDebtsByLender.map((d) => (
              <div key={d.memberId} className="flex justify-between">
                <span className="text-foreground/60">
                  Bad debt: {d.name}
                </span>
                <span className="text-red-600">{formatMoney(d.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-foreground/10 pt-2 font-semibold">
              <span>Total loss</span>
              <span>{formatMoney(view.lossPosition.totalLoss)}</span>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
