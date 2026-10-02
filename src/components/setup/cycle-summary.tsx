import { formatMoney } from "@/lib/money";
import type { CycleCreated, MemberAdded } from "@/lib/ledger/events";

interface CycleSummaryProps {
  cycle: CycleCreated;
  members: MemberAdded[];
}

export function CycleSummary({ cycle, members }: CycleSummaryProps) {
  const byId = new Map(members.map((m) => [m.memberId, m]));

  return (
    <section className="flex w-full max-w-sm flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">Active cycle</h2>
      <p className="text-foreground/70">
        Started {cycle.startDate} · {formatMoney(cycle.defaultAmount)} ·{" "}
        {cycle.frequency}
      </p>
      <ol className="text-sm text-foreground">
        {cycle.memberIds.map((id, index) => {
          const member = byId.get(id);
          return (
            <li key={id} className="flex items-center gap-2 py-0.5">
              <span className="text-foreground/40">{index + 1}.</span>
              <span className="flex-1">{member?.name ?? "Unknown member"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
