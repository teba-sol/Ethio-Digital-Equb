import type { EkubEvent } from "@/lib/ledger/events";

export interface OutboxRecord {
  id: string;
  eventId: string;
  status: "pending" | "synced" | "rejected";
  reason?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface SettingRecord {
  key: string;
  value: string;
}

export type { EkubEvent };
