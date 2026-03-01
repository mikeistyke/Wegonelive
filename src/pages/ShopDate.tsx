import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3 } from "lucide-react";
import { fetchShopDates, type ShopDateEvent } from "../lib/liveAccess";

const formatEt = (isoValue: string) =>
  new Date(isoValue).toLocaleString(undefined, {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatCountdown = (targetIso: string, nowMs: number) => {
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) {
    return "TBD";
  }

  const totalSeconds = Math.max(Math.floor((targetMs - nowMs) / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
};

export default function ShopDate() {
  const [events, setEvents] = useState<ShopDateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    let isMounted = true;

    const loadEvents = async () => {
      const nextEvents = await fetchShopDates();
      if (!isMounted) {
        return;
      }

      setEvents(nextEvents);
      setLoading(false);
    };

    void loadEvents();
    const refreshInterval = setInterval(() => {
      void loadEvents();
    }, 30_000);

    const tickInterval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
      clearInterval(tickInterval);
    };
  }, []);

  const nextEvent = useMemo(() => events[0] ?? null, [events]);

  return (
    <div className="container mx-auto min-h-[calc(100vh-12rem)] px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur-sm">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            <CalendarClock className="h-4 w-4" />
            Shop Date
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Upcoming Live Shopping Dates
          </h1>
          <p className="mt-3 max-w-3xl text-zinc-300">
            Published events are matched against your computer clock using Eastern Time (`GMT -5:00`) scheduling for pre-show access and live start.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-bold text-white">Next Event</h2>
          {loading ? (
            <p className="mt-4 text-zinc-400">Loading schedule…</p>
          ) : nextEvent ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <p className="text-xs uppercase tracking-wide text-emerald-300">{nextEvent.title}</p>
              <p className="mt-1 text-2xl font-bold text-white">{formatEt(nextEvent.starts_at)}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-zinc-950/50 px-3 py-1 text-sm text-zinc-200">
                <Clock3 className="h-4 w-4 text-emerald-300" />
                Starts in {formatCountdown(nextEvent.starts_at, nowTick)}
              </div>
              {nextEvent.notes && <p className="mt-4 text-sm text-zinc-200">{nextEvent.notes}</p>}
            </div>
          ) : (
            <p className="mt-4 text-zinc-400">No upcoming dates are published yet.</p>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-bold text-white">All Published Dates</h2>
          {events.length === 0 ? (
            <p className="mt-4 text-zinc-400">No published events available.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-3 pr-4">Event</th>
                    <th className="py-3 pr-4">Date & Time (ET / GMT-5)</th>
                    <th className="py-3 pr-4">Window Opens</th>
                    <th className="py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-zinc-900/70 text-zinc-200">
                      <td className="py-3 pr-4 font-medium text-white">{event.title}</td>
                      <td className="py-3 pr-4">{formatEt(event.starts_at)}</td>
                      <td className="py-3 pr-4">{event.window_opens_at ? formatEt(event.window_opens_at) : "TBD"}</td>
                      <td className="py-3 text-zinc-300">{event.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
