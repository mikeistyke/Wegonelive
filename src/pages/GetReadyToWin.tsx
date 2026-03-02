import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CircleCheckBig, PlayCircle, UserPlus } from "lucide-react";
import {
  clearLiveWindowCache,
  fetchLiveWindowStatus,
  getMsUntilIsoTimestamp,
  getRegisteredGuest,
  type LiveWindowStatus,
  setRegisteredGuest,
} from "../lib/liveAccess";

type Guest = {
  id: number;
  name: string;
  email: string;
};

const formatCountdown = (msRemaining: number) => {
  const totalSeconds = Math.max(Math.floor(msRemaining / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const formatSchedule = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function GetReadyToWin() {
  const [guest, setGuest] = useState<Guest | null>(() => getRegisteredGuest());
  const [name, setName] = useState(guest?.name ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [windowStatus, setWindowStatus] = useState<LiveWindowStatus | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const shoppingStartsAt = useMemo(
    () => Date.parse(windowStatus?.event?.starts_at ?? "") || Date.now() + 60 * 60 * 1000,
    [windowStatus?.event?.starts_at],
  );
  const windowOpensAt = useMemo(
    () => Date.parse(windowStatus?.event?.window_opens_at ?? "") || Date.now() + 30 * 60 * 1000,
    [windowStatus?.event?.window_opens_at],
  );

  const msUntilWindowOpen = getMsUntilIsoTimestamp(windowStatus?.event?.window_opens_at, nowTick);
  const isWindowOpen = windowStatus?.event?.window_opens_at
    ? msUntilWindowOpen <= 0
    : Boolean(windowStatus?.is_window_open);

  const parseBypassCsv = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const bypassEmails = Array.from(
    new Set(
      [
        ...parseBypassCsv(String(import.meta.env.VITE_LSP_BYPASS_EMAILS ?? "")),
        ...parseBypassCsv(String(import.meta.env.VITE_LSP_BYPASS_ACCESS_EMAILS ?? "")),
      ].map((value) => value.toLowerCase()),
    ),
  );
  const isBypassGuest = Boolean(guest?.email) && bypassEmails.includes(String(guest?.email ?? "").toLowerCase());
  const canEnterLive = isBypassGuest || (isWindowOpen && Boolean(guest));

  useEffect(() => {
    const syncWindowStatus = async (force = false) => {
      const nextStatus = await fetchLiveWindowStatus(force);
      setWindowStatus(nextStatus);
    };

    void syncWindowStatus(true);

    const refreshInterval = setInterval(() => {
      void syncWindowStatus(true);
    }, 30_000);

    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(refreshInterval);
    };
  }, []);

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });

      const data = (await response.json()) as Guest | { error?: string };

      if (!response.ok) {
        setError((data as { error?: string }).error || "Could not register right now.");
        return;
      }

      const registeredGuest = data as Guest;
      setRegisteredGuest(registeredGuest);
      clearLiveWindowCache();
      setGuest(registeredGuest);
      setSuccess("You are registered. We’ll unlock the room 30 minutes before shopping begins.");
    } catch {
      setError("Network error while registering. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto min-h-[calc(100vh-12rem)] px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur-sm">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            <CalendarClock className="h-4 w-4" />
            Get Ready To Win
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Register Now. Enter The Room At Show Time.
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-300">
            To protect event quality, the live shopping room opens only during the official pre-show window. Register once and return anytime.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Window Opens</p>
              <p className="mt-1 text-lg font-bold text-white">{formatSchedule(windowOpensAt)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-700 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Shopping Starts</p>
              <p className="mt-1 text-lg font-bold text-white">{formatSchedule(shoppingStartsAt)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-4 text-xl font-bold text-white">How It Works</h2>
            <ul className="space-y-3 text-zinc-300">
              <li className="flex items-start gap-3">
                <CircleCheckBig className="mt-0.5 h-4 w-4 text-emerald-400" />
                Register once to join upcoming auctions and shopping experiences.
              </li>
              <li className="flex items-start gap-3">
                <CircleCheckBig className="mt-0.5 h-4 w-4 text-emerald-400" />
                Access to the live room unlocks exactly 30 minutes before the posted start.
              </li>
              <li className="flex items-start gap-3">
                <CircleCheckBig className="mt-0.5 h-4 w-4 text-emerald-400" />
                During the pre-show window, you can watch updates, click sponsor ads, and chat with AI before bidding begins.
              </li>
            </ul>

            <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
              {isWindowOpen ? (
                <p className="font-semibold">Early access is open. Enter the live room now.</p>
              ) : (
                <p>
                  Early access opens in <span className="font-bold">{formatCountdown(msUntilWindowOpen)}</span>
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={canEnterLive ? "/live" : "/grtw"}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold transition-colors ${
                  canEnterLive
                    ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                    : "cursor-not-allowed border border-zinc-700 bg-zinc-800 text-zinc-400"
                }`}
                aria-disabled={!canEnterLive}
                onClick={(event) => {
                  if (!canEnterLive) {
                    event.preventDefault();
                  }
                }}
              >
                <PlayCircle className="h-5 w-5" />
                Enter Live Shopping Room
              </Link>
              <Link to="/" className="inline-flex items-center rounded-full border border-zinc-700 px-5 py-3 font-semibold text-zinc-200 hover:bg-zinc-800">
                Back to Home
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
              <UserPlus className="h-5 w-5 text-emerald-400" />
              Registration
            </h2>

            {guest ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-100">
                <p className="text-sm uppercase tracking-wide text-emerald-300">Registered</p>
                <p className="mt-1 text-lg font-semibold">{guest.name}</p>
                <p className="text-sm text-emerald-200/90">{guest.email}</p>
                <p className="mt-4 text-sm text-emerald-100">
                  You’re on the list for upcoming shopping drops. Return here to enter the room when the window opens.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <input
                  type="text"
                  placeholder="Your Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:border-emerald-400 focus:outline-none"
                  required
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:border-emerald-400 focus:outline-none"
                  required
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                {success && <p className="text-sm text-emerald-300">{success}</p>}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Registering..." : "Register for Upcoming Events"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
