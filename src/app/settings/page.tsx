"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAllEvents, getSetting, setSetting } from "@/db/queries";
import { getDeviceId } from "@/lib/device";
import { buildExport, verifyExport, downloadExport } from "@/lib/export/build";
import { formatMoney } from "@/lib/money";
import { useLedgerView } from "@/hooks/use-ledger";

export default function SettingsPage() {
  const events = useLiveQuery(() => getAllEvents(), []);
  const view = useLedgerView();
  const [syncSecret, setSyncSecret] = useState("");
  const [secretLoaded, setSecretLoaded] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load existing sync secret
  useState(() => {
    getSetting("syncSecret").then((v) => {
      if (v) {
        setSyncSecret(v);
        setSecretLoaded(true);
      }
    });
  });

  async function handleSaveSecret() {
    await setSetting("syncSecret", syncSecret);
    setSecretLoaded(true);
  }

  async function handleExport() {
    if (!events) return;
    setExporting(true);
    setExportStatus(null);
    try {
      const deviceId = await getDeviceId();
      const envelope = await buildExport(events, deviceId);
      const verification = await verifyExport(envelope);

      if (!verification.ok) {
        setExportStatus(`Export failed verification: ${verification.detail}`);
        return;
      }

      downloadExport(envelope);
      setExportStatus(
        `Exported ${envelope.eventCount} events. Checksum verified.`,
      );
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : "Export failed",
      );
    } finally {
      setExporting(false);
    }
  }

  const totalContributions = view?.totalContributions ?? 0;
  const totalPayouts = view?.totalPayouts ?? 0;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <section className="flex w-full max-w-sm flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </section>

      {/* Ledger stats */}
      <section className="w-full max-w-sm rounded-lg border border-foreground/15 p-4">
        <h2 className="font-semibold">Ledger Summary</h2>
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-foreground/60">Total events</span>
            <span>{events?.length ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/60">Members</span>
            <span>{view?.members.length ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/60">Contributions</span>
            <span>{formatMoney(totalContributions)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/60">Payouts</span>
            <span>{formatMoney(totalPayouts)}</span>
          </div>
        </div>
      </section>

      {/* Export */}
      <section className="w-full max-w-sm rounded-lg border border-foreground/15 p-4">
        <h2 className="font-semibold">Backup Export</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Download a versioned, checksummed JSON backup of your ledger.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting || !events || events.length === 0}
          className="mt-3 w-full rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export Ledger"}
        </button>
        {exportStatus && (
          <p
            className={`mt-2 text-sm ${
              exportStatus.includes("failed")
                ? "text-red-600"
                : "text-green-600"
            }`}
          >
            {exportStatus}
          </p>
        )}
      </section>

      {/* Sync secret */}
      <section className="w-full max-w-sm rounded-lg border border-foreground/15 p-4">
        <h2 className="font-semibold">Sync Key</h2>
        <p className="mt-1 text-sm text-foreground/60">
          Paste the shared secret from your server to enable backup sync.
        </p>
        <input
          type="password"
          value={syncSecret}
          onChange={(e) => setSyncSecret(e.target.value)}
          placeholder="X-Ekub-Secret value"
          className="mt-3 w-full rounded border border-foreground/15 bg-background px-3 py-2"
        />
        <button
          onClick={handleSaveSecret}
          disabled={!syncSecret}
          className="mt-2 w-full rounded border border-foreground/20 px-4 py-2 font-medium disabled:opacity-50"
        >
          {secretLoaded ? "Update Sync Key" : "Save Sync Key"}
        </button>
        {secretLoaded && (
          <p className="mt-1 text-xs text-green-600">Sync key saved</p>
        )}
      </section>

      {/* About */}
      <section className="w-full max-w-sm text-center text-xs text-foreground/40">
        <p>Sahil — Ekub Ledger</p>
        <p>Offline-first book of record for one Ekub group</p>
      </section>
    </main>
  );
}
