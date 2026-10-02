import type { EkubEvent } from "@/lib/ledger/events";

export interface ExportEnvelope {
  format: "ekub-ledger-export";
  formatVersion: 1;
  schemaVersion: 1;
  exportedAt: string;
  deviceId: string;
  lastEventId: string | null;
  eventCount: number;
  checksum: string;
  events: EkubEvent[];
}

/**
 * Canonical serialisation for checksumming: sorted keys, no whitespace.
 * Same events always produce the same hash.
 */
function canonicalSerialise(events: EkubEvent[]): string {
  const sorted = [...events].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(sorted, Object.keys(sorted[0] ?? {}).sort());
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildExport(
  events: EkubEvent[],
  deviceId: string,
): Promise<ExportEnvelope> {
  const sorted = [...events].sort((a, b) =>
    a.occurredAt === b.occurredAt
      ? a.id.localeCompare(b.id)
      : a.occurredAt.localeCompare(b.occurredAt),
  );

  const lastEventId = sorted.length > 0 ? sorted[sorted.length - 1].id : null;
  const checksumInput = canonicalSerialise(sorted);
  const checksum = await sha256(checksumInput);

  return {
    format: "ekub-ledger-export",
    formatVersion: 1,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    deviceId,
    lastEventId,
    eventCount: sorted.length,
    checksum: `sha256:${checksum}`,
    events: sorted,
  };
}

export async function verifyExport(
  envelope: ExportEnvelope,
): Promise<{ ok: boolean; detail: string }> {
  if (envelope.format !== "ekub-ledger-export") {
    return { ok: false, detail: "Unknown format" };
  }
  if (envelope.formatVersion !== 1) {
    return { ok: false, detail: `Unsupported format version: ${envelope.formatVersion}` };
  }

  const checksumInput = canonicalSerialise(envelope.events);
  const expected = await sha256(checksumInput);
  const actual = envelope.checksum.replace("sha256:", "");

  if (expected !== actual) {
    return { ok: false, detail: "Checksum mismatch — file may be corrupted" };
  }

  if (envelope.eventCount !== envelope.events.length) {
    return { ok: false, detail: "Event count mismatch" };
  }

  return { ok: true, detail: "Export verified" };
}

export function downloadExport(envelope: ExportEnvelope): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ekub-ledger-export-${envelope.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
