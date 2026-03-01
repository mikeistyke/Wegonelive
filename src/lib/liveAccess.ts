export type RegisteredGuest = {
  id: number;
  name: string;
  email: string;
};

export type ShopDateEvent = {
  id: number;
  title: string;
  starts_at: string;
  notes: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  window_opens_at: string | null;
};

export type LiveWindowStatus = {
  has_event: boolean;
  is_window_open: boolean;
  event: ShopDateEvent | null;
  now: string;
};

const REGISTERED_GUEST_STORAGE_KEY = "wgl.live.registeredGuest";
const FALLBACK_START_TIME_MS = Date.now() + 60 * 60 * 1000;
const WINDOW_STATUS_CACHE_MS = 15_000;

let cachedWindowStatus: LiveWindowStatus | null = null;
let cachedWindowStatusAt = 0;

const fallbackWindowStatus = (): LiveWindowStatus => {
  const startsAt = new Date(FALLBACK_START_TIME_MS).toISOString();
  const windowOpensAt = new Date(FALLBACK_START_TIME_MS - 30 * 60 * 1000).toISOString();

  return {
    has_event: false,
    is_window_open: false,
    event: {
      id: 0,
      title: "Upcoming Live Shopping",
      starts_at: startsAt,
      notes: null,
      is_active: true,
      created_at: null,
      updated_at: null,
      window_opens_at: windowOpensAt,
    },
    now: new Date().toISOString(),
  };
};

export async function fetchLiveWindowStatus(force = false): Promise<LiveWindowStatus> {
  const now = Date.now();
  if (!force && cachedWindowStatus && now - cachedWindowStatusAt < WINDOW_STATUS_CACHE_MS) {
    return cachedWindowStatus;
  }

  try {
    const response = await fetch("/api/shop-dates/window");
    if (!response.ok) {
      throw new Error(`window status request failed (${response.status})`);
    }

    const payload = (await response.json()) as LiveWindowStatus;
    cachedWindowStatus = payload;
    cachedWindowStatusAt = now;
    return payload;
  } catch {
    const fallback = fallbackWindowStatus();
    cachedWindowStatus = fallback;
    cachedWindowStatusAt = now;
    return fallback;
  }
}

export async function fetchShopDates(): Promise<ShopDateEvent[]> {
  try {
    const response = await fetch("/api/shop-dates");
    if (!response.ok) {
      throw new Error(`shop dates request failed (${response.status})`);
    }

    return (await response.json()) as ShopDateEvent[];
  } catch {
    return [];
  }
}

export function getMsUntilIsoTimestamp(isoValue?: string | null, nowMs: number = Date.now()): number {
  const parsed = Date.parse(String(isoValue ?? ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(parsed - nowMs, 0);
}

export function clearLiveWindowCache(): void {
  cachedWindowStatus = null;
  cachedWindowStatusAt = 0;
}

export function getRegisteredGuest(): RegisteredGuest | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(REGISTERED_GUEST_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<RegisteredGuest>;
    if (
      typeof parsed?.id === "number" &&
      typeof parsed?.name === "string" &&
      typeof parsed?.email === "string"
    ) {
      return {
        id: parsed.id,
        name: parsed.name,
        email: parsed.email,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function setRegisteredGuest(guest: RegisteredGuest): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(REGISTERED_GUEST_STORAGE_KEY, JSON.stringify(guest));
}
