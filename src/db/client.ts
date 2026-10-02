import Dexie from "dexie";
import type { EntityTable } from "dexie";
import type { EkubEvent } from "@/lib/ledger/events";
import type { OutboxRecord, SettingRecord } from "./schema";

export class SahilDatabase extends Dexie {
  events!: EntityTable<EkubEvent, "id">;
  outbox!: EntityTable<OutboxRecord, "id">;
  settings!: EntityTable<SettingRecord, "key">;

  constructor() {
    super("sahil");
    this.version(1).stores({
      events: "id, groupId, cycleId, occurredAt, correctsEventId",
      outbox: "id, status",
      settings: "key",
    });
  }
}

export const db = new SahilDatabase();
