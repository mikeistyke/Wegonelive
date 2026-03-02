import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Upload, PlusCircle, DollarSign, Boxes, Calculator, RefreshCcw } from "lucide-react";

type LotSession = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

type LotItem = {
  id: string;
  sku: string | null;
  title: string;
  ebay_guard_value?: number;
  expected_value: number;
  actual_value: number;
  eventual_value: number;
  quantity_expected: number;
  quantity_sold: number;
};

type LotMetrics = {
  product_count: number;
  projected_total: number;
  actual_total: number;
  eventual_total: number;
  sold_count: number;
};

type RecentSale = {
  id: string;
  sale_amount: number;
  sold_at: string;
  source: string;
  item_title: string;
};

type ImportWarning = {
  row: number;
  title: string;
  message: string;
};

type CsvImportItem = {
  sku?: string;
  title: string;
  expected: number;
  quantity_expected?: number;
  ebay_guard?: number;
};

type CsvParseResult = {
  items: CsvImportItem[];
  warnings: ImportWarning[];
  error?: string;
};

const defaultMetrics: LotMetrics = {
  product_count: 0,
  projected_total: 0,
  actual_total: 0,
  eventual_total: 0,
  sold_count: 0,
};

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseImportCsv(fileContent: string): CsvParseResult {
  const lines = fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { items: [], warnings: [], error: "CSV must include a header row and at least one data row." };
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());

  const titleIndex = headers.findIndex((header) => ["title", "item", "name"].includes(header));
  const expectedIndex = headers.findIndex((header) => ["expected", "projected", "expected_value"].includes(header));
  const skuIndex = headers.findIndex((header) => ["sku", "item_code", "code"].includes(header));
  const qtyIndex = headers.findIndex((header) => ["quantity_expected", "qty", "quantity"].includes(header));
  const ebayGuardIndex = headers.findIndex((header) => ["ebay_guard", "ebay_guard_value", "guard", "eventual_guard"].includes(header));

  if (titleIndex < 0 || expectedIndex < 0) {
    return { items: [], warnings: [], error: "CSV must include title and expected columns." };
  }

  const items: CsvImportItem[] = [];
  const warnings: ImportWarning[] = [];

  lines.slice(1).forEach((line, index) => {
    const cols = parseCsvLine(line);
    const rowNumber = index + 2;
    const expected = Number(cols[expectedIndex] ?? 0);
    const title = String(cols[titleIndex] ?? "").trim();

    if (!title) {
      warnings.push({
        row: rowNumber,
        title: "(missing title)",
        message: "Row skipped because title is missing.",
      });
      return;
    }

    if (!Number.isFinite(expected) || expected < 0) {
      warnings.push({
        row: rowNumber,
        title,
        message: "Row skipped because expected must be a non-negative number.",
      });
      return;
    }

    const quantityExpectedRaw = qtyIndex >= 0 ? Number(cols[qtyIndex]) : 1;
    const quantityExpected = Number.isFinite(quantityExpectedRaw) && quantityExpectedRaw > 0
      ? Math.floor(quantityExpectedRaw)
      : 1;

    const ebayGuardRaw = ebayGuardIndex >= 0 ? Number(cols[ebayGuardIndex]) : 0;
    const ebayGuard = Number.isFinite(ebayGuardRaw) && ebayGuardRaw >= 0 ? ebayGuardRaw : 0;

    items.push({
      sku: skuIndex >= 0 ? String(cols[skuIndex] ?? "").trim() : "",
      title,
      expected,
      quantity_expected: quantityExpected,
      ebay_guard: ebayGuard,
    });
  });

  return { items, warnings };
}

export function LotDecoder() {
  const [sessions, setSessions] = useState<LotSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [items, setItems] = useState<LotItem[]>([]);
  const [metrics, setMetrics] = useState<LotMetrics>(defaultMetrics);
  const [newSessionName, setNewSessionName] = useState("");
  const [saleInputs, setSaleInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  const [recentSale, setRecentSale] = useState<RecentSale | null>(null);
  const [isSyncHighlightVisible, setIsSyncHighlightVisible] = useState(false);
  const lastRecentSaleIdRef = useRef<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const liveSyncSession = useMemo(
    () => sessions.find((session) => session.status === "live") ?? null,
    [sessions],
  );

  const loadSessions = async () => {
    const res = await fetch("/api/lot-decoder/sessions");
    if (!res.ok) {
      throw new Error("Failed to load lot sessions");
    }

    const data = await res.json() as LotSession[];
    setSessions(data);

    if (!activeSessionId && data.length > 0) {
      setActiveSessionId(String(data[0].id));
    }
  };

  const loadSessionData = async (sessionId: string) => {
    if (!sessionId) {
      setItems([]);
      setMetrics(defaultMetrics);
      return;
    }

    const [itemsRes, metricsRes] = await Promise.all([
      fetch(`/api/lot-decoder/${sessionId}/items`),
      fetch(`/api/lot-decoder/${sessionId}/metrics`),
    ]);

    if (!itemsRes.ok || !metricsRes.ok) {
      throw new Error("Failed to load lot decoder data");
    }

    const itemsData = await itemsRes.json() as LotItem[];
    const metricsData = await metricsRes.json() as LotMetrics;

    setItems(itemsData);
    setMetrics(metricsData);
  };

  const loadRecentSale = async (sessionId: string) => {
    if (!sessionId) {
      setRecentSale(null);
      return;
    }

    const res = await fetch(`/api/lot-decoder/${sessionId}/recent-sale`);
    if (!res.ok) {
      throw new Error("Failed to load recent sync sale");
    }

    const data = await res.json() as { sale: RecentSale | null };
    setRecentSale(data.sale ?? null);
  };

  useEffect(() => {
    setIsLoading(true);
    setError("");

    loadSessions()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to initialize lot decoder";
        setError(message);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setError("");
    loadSessionData(activeSessionId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to refresh lot data";
      setError(message);
    });
  }, [activeSessionId]);

  useEffect(() => {
    const liveSessionId = liveSyncSession?.id;
    if (!liveSessionId) {
      setRecentSale(null);
      return;
    }

    let cancelled = false;

    const sync = async () => {
      try {
        await loadRecentSale(liveSessionId);
        if (activeSessionId === liveSessionId) {
          await loadSessionData(liveSessionId);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Failed to refresh live sync status", err);
        }
      }
    };

    void sync();
    const intervalId = window.setInterval(() => {
      void sync();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [liveSyncSession?.id, activeSessionId]);

  useEffect(() => {
    const saleId = recentSale?.id ?? null;

    if (!saleId) {
      return;
    }

    const previousSaleId = lastRecentSaleIdRef.current;
    lastRecentSaleIdRef.current = saleId;

    if (!previousSaleId || previousSaleId === saleId) {
      return;
    }

    setIsSyncHighlightVisible(true);
    const timerId = window.setTimeout(() => {
      setIsSyncHighlightVisible(false);
    }, 2000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [recentSale?.id]);

  const onCreateSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newSessionName.trim();

    if (!name) {
      setError("Add a session name first.");
      return;
    }

    setError("");
    setNotice("");

    const res = await fetch("/api/lot-decoder/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create session.");
      return;
    }

    const created = await res.json() as LotSession;
    setNewSessionName("");
    setNotice("Session created.");
    await loadSessions();
    setActiveSessionId(String(created.id));
  };

  const onImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeSessionId) {
      return;
    }

    setError("");
    setNotice("");
    setImportWarnings([]);

    const text = await file.text();
    const parsed = parseImportCsv(text);

    if (parsed.error) {
      setError(parsed.error);
      event.target.value = "";
      return;
    }

    if (parsed.items.length === 0) {
      setError("CSV must include at least one valid row with title and expected columns.");
      setImportWarnings(parsed.warnings);
      event.target.value = "";
      return;
    }

    const res = await fetch(`/api/lot-decoder/${activeSessionId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: parsed.items }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setImportWarnings(data.warnings ?? []);
      setError(data.error ?? "Import failed.");
      event.target.value = "";
      return;
    }

    const data = await res.json() as { imported: number; warnings?: ImportWarning[] };
    setNotice(`Imported ${data.imported} item(s).`);
    setImportWarnings([...(parsed.warnings ?? []), ...(data.warnings ?? [])]);
    await loadSessionData(activeSessionId);
    event.target.value = "";
  };

  const onActivateSession = async () => {
    if (!activeSessionId) {
      setError("Choose a session first.");
      return;
    }

    setError("");
    setNotice("");

    const res = await fetch(`/api/lot-decoder/${activeSessionId}/activate`, {
      method: "POST",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not activate session for live sync.");
      return;
    }

    setNotice("Live sync enabled for selected session.");
    await loadSessions();
  };

  const onRecordSale = async (item: LotItem) => {
    if (!activeSessionId) {
      return;
    }

    if (item.quantity_sold >= item.quantity_expected) {
      setError("This item is already sold out.");
      return;
    }

    const defaultAmount = item.ebay_guard_value && item.ebay_guard_value > 0
      ? item.ebay_guard_value
      : item.expected_value;
    const rawValue = saleInputs[item.id] ?? String(defaultAmount || 0);
    const amount = Number(rawValue);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Sale amount must be greater than 0.");
      return;
    }

    setError("");
    setNotice("");

    const res = await fetch(`/api/lot-decoder/${activeSessionId}/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: item.id, sale_amount: amount }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not record sale.");
      return;
    }

    setNotice(`Sale saved for ${item.title}.`);
    setSaleInputs((prev) => ({ ...prev, [item.id]: "" }));
    await loadSessionData(activeSessionId);
  };

  const runningRows = useMemo(() => {
    let cumulative = 0;

    return items.map((item) => {
      cumulative += item.actual_value || 0;
      return {
        ...item,
        cumulative_actual: cumulative,
      };
    });
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-white">Lot Decoder</h1>
        <p className="text-sm text-zinc-300">
          Projected - Actual = Eventual
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Products" value={String(metrics.product_count)} icon={<Boxes className="h-4 w-4" />} />
        <MetricCard label="Projected" value={toCurrency(metrics.projected_total)} icon={<Calculator className="h-4 w-4" />} />
        <MetricCard label="Actual Sold" value={toCurrency(metrics.actual_total)} icon={<DollarSign className="h-4 w-4" />} />
        <MetricCard label="Eventual" value={toCurrency(metrics.eventual_total)} icon={<RefreshCcw className="h-4 w-4" />} />
        <MetricCard label="Items Sold" value={String(metrics.sold_count)} icon={<PlusCircle className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-zinc-100">Live Session</h2>
          <form onSubmit={onCreateSession} className="space-y-3">
            <input
              value={newSessionName}
              onChange={(event) => setNewSessionName(event.target.value)}
              placeholder="Example: Friday PM Lot"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Create Session
            </button>
          </form>

          <div className="mt-4 space-y-2">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Select session</label>
            <select
              value={activeSessionId}
              onChange={(event) => setActiveSessionId(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="">Choose a session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}{session.status === "live" ? " (Live Sync)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void onActivateSession()}
              disabled={!activeSessionId}
              className="w-full rounded-lg border border-emerald-600/40 bg-emerald-600/20 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use this session for live auto-sync
            </button>
            <p className="text-xs text-zinc-400">
              {liveSyncSession
                ? `Current live sync session: ${liveSyncSession.name}`
                : "No live sync session selected yet."}
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Upload className="h-4 w-4" />
              Import Spreadsheet (CSV)
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={onImportCsv}
              disabled={!activeSessionId}
              className="w-full text-xs text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-100"
            />
            <p className="mt-2 text-xs text-zinc-400">Headers: title, expected, sku, quantity_expected, ebay_guard (optional)</p>
            <p className="mt-1 text-xs text-zinc-500">Expected is unit price. Eventual uses ebay_guard × remaining qty when ebay_guard is provided.</p>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Session Ledger</h2>
            <p className="text-xs text-zinc-400">{activeSession ? activeSession.name : "No active session"}</p>
          </div>

          <div className={`mb-3 rounded-lg px-3 py-2 text-xs transition-all ${
            isSyncHighlightVisible
              ? "border-2 border-emerald-300/90 ring-1 ring-emerald-200/50 bg-gradient-to-r from-emerald-400/20 via-emerald-300/18 to-emerald-400/20 text-emerald-50 shadow-2xl shadow-emerald-500/30 backdrop-blur-sm scale-[1.01] animate-[pulse_2.4s_ease-in-out_1]"
              : "border border-zinc-800 bg-zinc-950/60 text-zinc-300"
          }`}>
            {liveSyncSession ? (
              recentSale ? (
                <span>
                  Last synced sale: {toCurrency(recentSale.sale_amount)} {recentSale.item_title ? `for ${recentSale.item_title}` : ""} at {new Date(recentSale.sold_at).toLocaleTimeString()} ({recentSale.source})
                </span>
              ) : (
                <span>Live sync active for {liveSyncSession.name}. Waiting for first synced sale.</span>
              )
            ) : (
              <span>Live sync is not active yet. Select a session and enable live auto-sync.</span>
            )}
          </div>

          {isLoading ? <p className="text-sm text-zinc-400">Loading...</p> : null}
          {error ? <p className="mb-3 text-sm text-rose-300">{error}</p> : null}
          {notice ? <p className="mb-3 text-sm text-emerald-300">{notice}</p> : null}
          {importWarnings.length > 0 ? (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <p className="font-semibold">Import warnings (soft):</p>
              {importWarnings.map((warning) => (
                <p key={`${warning.row}-${warning.title}`}>Row {warning.row} · {warning.title}: {warning.message}</p>
              ))}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Expected</th>
                  <th className="py-2 pr-3">eBay Guard</th>
                  <th className="py-2 pr-3">Actual</th>
                  <th className="py-2 pr-3">Eventual</th>
                  <th className="py-2 pr-3">Running Total</th>
                  <th className="py-2 pr-0">Record Sale</th>
                </tr>
              </thead>
              <tbody>
                {runningRows.map((item) => {
                  const isSoldOut = item.quantity_sold >= item.quantity_expected;

                  return (
                  <tr key={item.id} className="border-b border-zinc-900/80 text-zinc-100">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-zinc-500">{item.sku || "No SKU"}</div>
                    </td>
                    <td className="py-2 pr-3">{item.quantity_sold}/{item.quantity_expected}</td>
                    <td className="py-2 pr-3">{toCurrency(item.expected_value)}</td>
                    <td className="py-2 pr-3">{toCurrency(item.ebay_guard_value ?? 0)}</td>
                    <td className="py-2 pr-3">{toCurrency(item.actual_value)}</td>
                    <td className="py-2 pr-3">{toCurrency(item.eventual_value)}</td>
                    <td className="py-2 pr-3 text-emerald-300">{toCurrency(item.cumulative_actual)}</td>
                    <td className="py-2 pr-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={saleInputs[item.id] ?? ""}
                          onChange={(event) => setSaleInputs((prev) => ({ ...prev, [item.id]: event.target.value }))}
                          placeholder="defaults to guard"
                          disabled={isSoldOut}
                          className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <button
                          onClick={() => void onRecordSale(item)}
                          disabled={isSoldOut}
                          className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
                        >
                          {isSoldOut ? "Sold Out" : "Add"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="mb-2 flex items-center justify-between text-zinc-400">
        <span className="text-xs uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
