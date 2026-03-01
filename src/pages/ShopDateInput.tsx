import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CalendarPlus2, RefreshCcw } from "lucide-react";
import type { ShopDateEvent } from "../lib/liveAccess";

type EditableEvent = {
  id: number;
  title: string;
  starts_at: string;
  notes: string;
  is_active: boolean;
};

const parseApiPayload = async (response: Response) => {
  const rawBody = await response.text();

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as any;
  } catch {
    const preview = rawBody.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      `Unexpected non-JSON response (${response.status}). ${preview || "No response body."} ` +
      "If you just changed server routes, restart the dev server and retry.",
    );
  }
};

const toDateTimeLocalValue = (isoValue: string) => {
  const date = new Date(isoValue);
  const timezoneOffsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - timezoneOffsetMinutes * 60_000);
  return localDate.toISOString().slice(0, 16);
};

export default function ShopDateInput() {
  const [events, setEvents] = useState<ShopDateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");

  const [editing, setEditing] = useState<EditableEvent | null>(null);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    [events],
  );

  const loadEvents = async () => {
    setError("");

    try {
      const response = await fetch("/api/shop-dates/admin");
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || `Failed to load shop dates (${response.status})`);
      }

      setEvents((payload as ShopDateEvent[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shop dates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/shop-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          starts_at: startsAt,
          notes,
          is_active: true,
        }),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || "Failed to create shop date.");
      }

      setTitle("");
      setStartsAt("");
      setNotes("");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create shop date.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(`/api/shop-dates/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || "Failed to update shop date.");
      }

      setEditing(null);
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update shop date.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (eventId: number) => {
    setError("");

    try {
      const response = await fetch(`/api/shop-dates/${eventId}/toggle-active`, {
        method: "POST",
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || "Failed to toggle active status.");
      }

      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to toggle status.");
    }
  };

  return (
    <div className="container mx-auto min-h-[calc(100vh-12rem)] px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur-sm">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            <CalendarCheck2 className="h-4 w-4" />
            Shop Date Input
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Manage Shopping Event Dates</h1>
          <p className="mt-3 max-w-3xl text-zinc-300">
            Enter and update official event date/time values here. The same schedule drives site promotion and `/live` access gating.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
              <CalendarPlus2 className="h-5 w-5 text-emerald-400" />
              Add New Shop Date
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:border-emerald-400 focus:outline-none"
                required
              />
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-emerald-400 focus:outline-none"
                required
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                rows={3}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:border-emerald-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Create Shop Date"}
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Current Entries</h2>
              <button
                type="button"
                onClick={() => void loadEvents()}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            {loading ? (
              <p className="text-zinc-400">Loading schedule…</p>
            ) : sortedEvents.length === 0 ? (
              <p className="text-zinc-400">No shop dates yet.</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-auto pr-1">
                {sortedEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: event.id,
                        title: event.title,
                        starts_at: toDateTimeLocalValue(event.starts_at),
                        notes: event.notes || "",
                        is_active: event.is_active,
                      })
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 p-4 text-left transition-colors hover:border-emerald-500/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{event.title}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${event.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-300"}`}>
                        {event.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-300">{new Date(event.starts_at).toLocaleString()}</p>
                    {event.notes && <p className="mt-2 text-xs text-zinc-400">{event.notes}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {editing && (
          <div className="rounded-3xl border border-zinc-700 bg-zinc-900/70 p-6">
            <h3 className="mb-4 text-xl font-bold text-white">Edit Shop Date #{editing.id}</h3>
            <form onSubmit={handleUpdate} className="grid gap-4 md:grid-cols-2">
              <input
                type="text"
                value={editing.title}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-emerald-400 focus:outline-none"
                required
              />
              <input
                type="datetime-local"
                value={editing.starts_at}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, starts_at: e.target.value } : prev))}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-emerald-400 focus:outline-none"
                required
              />
              <textarea
                value={editing.notes}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                rows={3}
                className="md:col-span-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white focus:border-emerald-400 focus:outline-none"
              />
              <label className="inline-flex items-center gap-2 text-zinc-200">
                <input
                  type="checkbox"
                  checked={editing.is_active}
                  onChange={(e) => setEditing((prev) => (prev ? { ...prev, is_active: e.target.checked } : prev))}
                />
                Active
              </label>
              <div className="md:col-span-2 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleActive(editing.id)}
                  className="rounded-xl border border-zinc-600 px-5 py-3 font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  Toggle Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-xl border border-zinc-700 px-5 py-3 font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
        )}
      </div>
    </div>
  );
}
