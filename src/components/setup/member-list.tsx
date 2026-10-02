import type { MemberAdded } from "@/lib/ledger/events";

interface MemberListProps {
  members: MemberAdded[];
}

export function MemberList({ members }: MemberListProps) {
  return (
    <ul className="flex w-full max-w-sm flex-col gap-2">
      {members.map((member) => (
        <li
          key={member.memberId}
          className="flex items-center justify-between rounded border border-foreground/10 px-3 py-2"
        >
          <span className="font-medium text-foreground">{member.name}</span>
          <span className="text-sm text-foreground/60">
            {member.phone ?? "—"} · {member.joinedAt}
          </span>
        </li>
      ))}
    </ul>
  );
}
