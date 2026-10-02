import { useLiveQuery } from "dexie-react-hooks";
import { getAllEvents } from "@/db/queries";
import { derive } from "@/lib/ledger/derive";

export function useLedgerView() {
  const events = useLiveQuery(() => getAllEvents(), []);
  if (events === undefined) return undefined;
  return derive(events);
}
