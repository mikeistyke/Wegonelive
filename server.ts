import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import agoraToken from "agora-token";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { RtcRole, RtcTokenBuilder } = agoraToken;

function isHex32(value: string) {
  return /^[0-9a-fA-F]{32}$/.test(value);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("guests.db", { verbose: console.log });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

const usingSupabase = Boolean(supabaseAdmin);

let ebayAccessTokenCache: { token: string; expiresAt: number } | null = null;

async function ensureAuctionByItemId(itemId: string, itemTitle = "Vintage Leather Jacket") {
  if (!supabaseAdmin) {
    return null;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("auctions")
    .select("id, item_id, title")
    .eq("item_id", itemId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("auctions")
    .insert({
      item_id: itemId,
      title: itemTitle,
      status: "live",
      starting_bid: 0,
      currency_code: "USD",
    })
    .select("id, item_id, title")
    .single();

  if (createError) {
    throw createError;
  }

  return created;
}

async function getGuestForHostAuth(guestId: number) {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("guests")
      .select("id, email")
      .eq("id", guestId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as { id: number; email: string } | null;
  }

  const hostGuest = db
    .prepare("SELECT id, email FROM guests WHERE id = ?")
    .get(guestId) as { id: number; email: string } | undefined;

  return hostGuest ?? null;
}

function getAgoraConfig() {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  const tokenTtlSecondsRaw = Number(process.env.AGORA_TOKEN_TTL_SECONDS ?? 3600);
  const tokenTtlSeconds = Number.isFinite(tokenTtlSecondsRaw) && tokenTtlSecondsRaw > 0
    ? Math.floor(tokenTtlSecondsRaw)
    : 3600;

  if (!appId || !appCertificate) {
    return null;
  }

  return {
    appId,
    appCertificate,
    tokenTtlSeconds,
  };
}

function getAgoraHostEmailAllowlist() {
  const raw = process.env.AGORA_HOST_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getAgoraSecurityConfig() {
  const channelPrefix = (process.env.AGORA_CHANNEL_PREFIX ?? "item-").trim();
  const rateLimitWindowSecondsRaw = Number(process.env.AGORA_RATE_LIMIT_WINDOW_SECONDS ?? 60);
  const rateLimitWindowSeconds = Number.isFinite(rateLimitWindowSecondsRaw) && rateLimitWindowSecondsRaw > 0
    ? Math.floor(rateLimitWindowSecondsRaw)
    : 60;

  const hostRateLimitRaw = Number(process.env.AGORA_HOST_RATE_LIMIT_PER_WINDOW ?? 20);
  const hostRateLimitPerWindow = Number.isFinite(hostRateLimitRaw) && hostRateLimitRaw > 0
    ? Math.floor(hostRateLimitRaw)
    : 20;

  const audienceRateLimitRaw = Number(process.env.AGORA_AUDIENCE_RATE_LIMIT_PER_WINDOW ?? 60);
  const audienceRateLimitPerWindow = Number.isFinite(audienceRateLimitRaw) && audienceRateLimitRaw > 0
    ? Math.floor(audienceRateLimitRaw)
    : 60;

  return {
    channelPrefix,
    rateLimitWindowSeconds,
    hostRateLimitPerWindow,
    audienceRateLimitPerWindow,
  };
}

function isValidAgoraChannelName(channelName: string) {
  return /^[A-Za-z0-9 !#$%&()+\-:;<=>.?@[\]^_{}|~,]{1,64}$/.test(channelName);
}

type RateLimitBucket = { count: number; resetAt: number };
const agoraRateLimitBuckets = new Map<string, RateLimitBucket>();

function consumeAgoraRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const existing = agoraRateLimitBuckets.get(key);
  const resetAt = now + windowSeconds * 1000;

  if (!existing || now >= existing.resetAt) {
    agoraRateLimitBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(limit - 1, 0), retryAfterSeconds: windowSeconds };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    };
  }

  existing.count += 1;
  agoraRateLimitBuckets.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(limit - existing.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
  };
}

function logAgoraServerEvent(event: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    scope: "agora-server",
    event,
    ts: new Date().toISOString(),
    ...metadata,
  };

  console.log(JSON.stringify(payload));
}

function buildFallbackAd(itemTitle: string) {
  return {
    id: `ad-fallback-${Date.now()}`,
    title: "Complete the Look",
    description: `Pair your ${itemTitle} with matching accessories and save today.`,
    cta: "Shop Now",
    imageUrl: `https://picsum.photos/seed/${Date.now()}/800/400`,
    source: "fallback",
  };
}

function getEbayConfig() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const environment = process.env.EBAY_ENV === "sandbox" ? "sandbox" : "production";
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
  const scope = process.env.EBAY_SCOPE || "https://api.ebay.com/oauth/api_scope";

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    environment,
    marketplaceId,
    scope,
    apiBase: environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
    identityBase: environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
  };
}

async function getEbayAccessToken() {
  const cfg = getEbayConfig();
  if (!cfg) {
    return null;
  }

  if (ebayAccessTokenCache && Date.now() < ebayAccessTokenCache.expiresAt - 60_000) {
    return { token: ebayAccessTokenCache.token, cfg };
  }

  const basicAuth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    scope: cfg.scope,
  });

  const tokenResponse = await fetch(`${cfg.identityBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Failed to obtain eBay token (${tokenResponse.status}): ${text}`);
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token: string;
    expires_in: number;
  };

  ebayAccessTokenCache = {
    token: tokenPayload.access_token,
    expiresAt: Date.now() + tokenPayload.expires_in * 1000,
  };

  return { token: tokenPayload.access_token, cfg };
}

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id INTEGER,
    amount REAL NOT NULL,
    item_id TEXT NOT NULL,
    bid_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(guest_id) REFERENCES guests(id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    FOREIGN KEY(parent_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS auction_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    notice_type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_by_guest_id INTEGER,
    metadata TEXT,
    reviewed_at DATETIME,
    reviewed_by_guest_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by_guest_id) REFERENCES guests(id),
    FOREIGN KEY(reviewed_by_guest_id) REFERENCES guests(id)
  );

  CREATE TABLE IF NOT EXISTS lot_decoder_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lot_decoder_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    sku TEXT,
    title TEXT NOT NULL,
    quantity_expected INTEGER NOT NULL DEFAULT 1,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    ebay_guard_value REAL NOT NULL DEFAULT 0,
    expected_value REAL NOT NULL DEFAULT 0,
    actual_value REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES lot_decoder_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS lot_decoder_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    sale_amount REAL NOT NULL,
    sold_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY(session_id) REFERENCES lot_decoder_sessions(id),
    FOREIGN KEY(item_id) REFERENCES lot_decoder_items(id)
  );

  CREATE TABLE IF NOT EXISTS shop_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ad_analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    campaign_name TEXT,
    sponsor TEXT,
    value REAL,
    duration_ms INTEGER,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.exec("ALTER TABLE auction_notices ADD COLUMN reviewed_at DATETIME");
} catch {}

try {
  db.exec("ALTER TABLE auction_notices ADD COLUMN reviewed_by_guest_id INTEGER");
} catch {}

try {
  db.exec("ALTER TABLE lot_decoder_items ADD COLUMN ebay_guard_value REAL NOT NULL DEFAULT 0");
} catch {}

// Seed categories if empty
const catCount = db.prepare("SELECT COUNT(*) as count FROM categories").get() as { count: number };
if (catCount.count === 0) {
  const insertCat = db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)");
  const categoriesToSeed = [
    { name: "Bed & Bath", sub: [] },
    { name: "Bric a brac", sub: [] },
    { name: "Clothes", sub: [] },
    { name: "Kitchenware", sub: [] },
    { name: "Miscellaneous", sub: [] },
    { name: "Office Supplies", sub: [] },
    { name: "Outdoors", sub: [] },
    { name: "Tools", sub: ["Battery Powered", "Non-Powered Tools", "Power Tools"] },
  ];
  
  for (const cat of categoriesToSeed) {
    const info = insertCat.run(cat.name, null);
    for (const sub of cat.sub) {
      insertCat.run(sub, info.lastInsertRowid);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const SHOP_EARLY_ACCESS_WINDOW_MS = 30 * 60 * 1000;
  const SHOP_EVENT_GRACE_WINDOW_MS = 6 * 60 * 60 * 1000;

  const normalizeShopDateRow = (row: any) => {
    const startsAt = String(row?.starts_at ?? "");
    const startsAtMs = Date.parse(startsAt);
    const windowOpensAtMs = Number.isFinite(startsAtMs)
      ? startsAtMs - SHOP_EARLY_ACCESS_WINDOW_MS
      : null;

    return {
      id: Number(row?.id ?? 0),
      title: String(row?.title ?? "Live Shopping Event"),
      starts_at: startsAt,
      notes: row?.notes ? String(row.notes) : null,
      is_active: Number(row?.is_active ?? 0) === 1,
      created_at: row?.created_at ? String(row.created_at) : null,
      updated_at: row?.updated_at ? String(row.updated_at) : null,
      window_opens_at: windowOpensAtMs ? new Date(windowOpensAtMs).toISOString() : null,
    };
  };

  const getCurrentOrUpcomingShopDate = () => {
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - SHOP_EVENT_GRACE_WINDOW_MS).toISOString();

    const upcoming = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      WHERE is_active = 1 AND starts_at >= ?
      ORDER BY starts_at ASC
      LIMIT 1
    `).get(nowIso) as any;

    if (upcoming) {
      return upcoming;
    }

    const recent = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      WHERE is_active = 1 AND starts_at < ? AND starts_at >= ?
      ORDER BY starts_at DESC
      LIMIT 1
    `).get(nowIso, cutoffIso) as any;

    return recent ?? null;
  };

  const buildShopDateWindowStatus = () => {
    const nowMs = Date.now();
    const activeEvent = getCurrentOrUpcomingShopDate();

    if (!activeEvent) {
      return {
        has_event: false,
        is_window_open: false,
        event: null,
        now: new Date(nowMs).toISOString(),
      };
    }

    const normalizedEvent = normalizeShopDateRow(activeEvent);
    const startsAtMs = Date.parse(normalizedEvent.starts_at);
    const windowOpensAtMs = Number.isFinite(startsAtMs)
      ? startsAtMs - SHOP_EARLY_ACCESS_WINDOW_MS
      : Number.NaN;

    const isWindowOpen = Number.isFinite(windowOpensAtMs) ? nowMs >= windowOpensAtMs : false;

    return {
      has_event: true,
      is_window_open: isWindowOpen,
      event: normalizedEvent,
      now: new Date(nowMs).toISOString(),
    };
  };

  app.use(express.json());

  const adAnalyticsEvents = new Set(["impression", "click", "time_on_ad", "conversion"]);

  const getAnalyticsWindow = (rangeRaw: unknown) => {
    const range = String(rangeRaw ?? "7d").trim().toLowerCase();

    if (range === "all") {
      return {
        range: "all",
        currentWhere: "",
        currentParams: [] as any[],
        previousWhere: "",
        previousParams: [] as any[],
      };
    }

    const periodMs = range === "24h"
      ? 24 * 60 * 60 * 1000
      : range === "30d"
        ? 30 * 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

    const now = Date.now();
    const currentStartIso = new Date(now - periodMs).toISOString();
    const previousStartIso = new Date(now - periodMs * 2).toISOString();
    const previousEndIso = currentStartIso;

    return {
      range,
      currentWhere: "WHERE created_at >= ?",
      currentParams: [currentStartIso],
      previousWhere: "WHERE created_at >= ? AND created_at < ?",
      previousParams: [previousStartIso, previousEndIso],
    };
  };

  const toGrowthPercentage = (current: number, previous: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
      return 0;
    }

    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
  };

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/analytics/ad", (req, res) => {
    const eventType = String(req.body?.eventType ?? "").trim().toLowerCase();
    const adId = String(req.body?.adId ?? "").trim();
    const campaignName = String(req.body?.campaignName ?? req.body?.title ?? "").trim();
    const sponsor = String(req.body?.sponsor ?? "").trim();
    const rawValue = req.body?.value;
    const rawDuration = req.body?.durationMs;
    const metadata = req.body?.metadata;

    if (!adAnalyticsEvents.has(eventType)) {
      return res.status(400).json({ error: "Invalid eventType" });
    }

    if (!adId) {
      return res.status(400).json({ error: "adId is required" });
    }

    const value = Number(rawValue);
    const durationMs = Number(rawDuration);
    const normalizedValue = Number.isFinite(value) ? value : null;
    const normalizedDuration = Number.isFinite(durationMs) && durationMs >= 0
      ? Math.floor(durationMs)
      : null;

    db.prepare(`
      INSERT INTO ad_analytics_events (ad_id, event_type, campaign_name, sponsor, value, duration_ms, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      adId,
      eventType,
      campaignName || null,
      sponsor || null,
      normalizedValue,
      normalizedDuration,
      metadata ? JSON.stringify(metadata) : null,
    );

    return res.status(201).json({ ok: true });
  });

  app.get("/api/analytics/ad/summary", (req, res) => {
    const window = getAnalyticsWindow(req.query.range);

    const currentRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN event_type = 'conversion' THEN COALESCE(value, 0) ELSE 0 END), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END), 0) AS total_impressions,
        COALESCE(SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END), 0) AS total_clicks,
        AVG(CASE WHEN event_type = 'time_on_ad' AND duration_ms >= 0 THEN duration_ms END) AS avg_time_on_ad_ms
      FROM ad_analytics_events
      ${window.currentWhere}
    `).get(...window.currentParams) as any;

    const previousRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN event_type = 'conversion' THEN COALESCE(value, 0) ELSE 0 END), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END), 0) AS total_impressions,
        COALESCE(SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END), 0) AS total_clicks,
        AVG(CASE WHEN event_type = 'time_on_ad' AND duration_ms >= 0 THEN duration_ms END) AS avg_time_on_ad_ms
      FROM ad_analytics_events
      ${window.previousWhere}
    `).get(...window.previousParams) as any;

    const totalRevenue = Number(currentRow?.total_revenue ?? 0);
    const totalImpressions = Number(currentRow?.total_impressions ?? 0);
    const totalClicks = Number(currentRow?.total_clicks ?? 0);
    const avgTimeOnAdMs = Number(currentRow?.avg_time_on_ad_ms ?? 0);

    const previousRevenue = Number(previousRow?.total_revenue ?? 0);
    const previousImpressions = Number(previousRow?.total_impressions ?? 0);
    const previousClicks = Number(previousRow?.total_clicks ?? 0);
    const previousAvgTime = Number(previousRow?.avg_time_on_ad_ms ?? 0);

    return res.json({
      range: window.range,
      total_revenue: totalRevenue,
      revenue_growth: toGrowthPercentage(totalRevenue, previousRevenue),
      total_impressions: totalImpressions,
      impressions_growth: toGrowthPercentage(totalImpressions, previousImpressions),
      total_clicks: totalClicks,
      clicks_growth: toGrowthPercentage(totalClicks, previousClicks),
      avg_time_on_ad_ms: avgTimeOnAdMs,
      avg_time_growth: toGrowthPercentage(avgTimeOnAdMs, previousAvgTime),
    });
  });

  app.get("/api/analytics/ad/campaigns", (req, res) => {
    const window = getAnalyticsWindow(req.query.range);

    const rows = db.prepare(`
      SELECT
        ad_id,
        COALESCE(campaign_name, 'Untitled Campaign') AS campaign_name,
        COALESCE(sponsor, 'Unknown Sponsor') AS sponsor,
        COALESCE(SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END), 0) AS impressions,
        COALESCE(SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END), 0) AS clicks,
        COALESCE(SUM(CASE WHEN event_type = 'conversion' THEN COALESCE(value, 0) ELSE 0 END), 0) AS revenue
      FROM ad_analytics_events
      ${window.currentWhere}
      GROUP BY ad_id, campaign_name, sponsor
      ORDER BY impressions DESC, clicks DESC
      LIMIT 50
    `).all(...window.currentParams) as any[];

    return res.json(rows.map((row) => {
      const impressions = Number(row.impressions ?? 0);
      const clicks = Number(row.clicks ?? 0);
      const revenue = Number(row.revenue ?? 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      return {
        ad_id: String(row.ad_id ?? ""),
        campaign_name: String(row.campaign_name ?? "Untitled Campaign"),
        sponsor: String(row.sponsor ?? "Unknown Sponsor"),
        impressions,
        clicks,
        ctr_percentage: Number(ctr.toFixed(1)),
        revenue,
      };
    }));
  });

  app.post("/api/agora/token", async (req, res) => {
    const { channelName, uid, role, guestId } = req.body ?? {};
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    logAgoraServerEvent("token.request.received", {
      requestId,
      role: role ?? null,
      hasGuestId: guestId !== undefined && guestId !== null,
      uidType: typeof uid,
    });

    if (typeof channelName !== "string") {
      logAgoraServerEvent("token.request.invalid", {
        requestId,
        reason: "missing_channel_name",
      });
      return res.status(400).json({
        error: "channelName is required and must be a non-empty string up to 64 characters",
      });
    }

    const sanitizedChannelName = channelName.trim();
    const securityConfig = getAgoraSecurityConfig();
    const isPublisher = role === "publisher" || role === "host";

    if (!sanitizedChannelName || !isValidAgoraChannelName(sanitizedChannelName)) {
      logAgoraServerEvent("token.request.invalid", {
        requestId,
        reason: "invalid_channel_format",
      });
      return res.status(400).json({
        error: "channelName must be 1-64 chars and only contain Agora-supported characters",
      });
    }

    if (securityConfig.channelPrefix && !sanitizedChannelName.startsWith(securityConfig.channelPrefix)) {
      logAgoraServerEvent("token.request.invalid", {
        requestId,
        reason: "channel_prefix_mismatch",
        expectedPrefix: securityConfig.channelPrefix,
      });
      return res.status(400).json({
        error: `channelName must start with '${securityConfig.channelPrefix}'`,
      });
    }

    const requestIp = (req.ip || req.socket.remoteAddress || "unknown").toString();
    const rateLimitKey = `agora-token:${isPublisher ? "host" : "audience"}:${requestIp}`;
    const rateLimit = consumeAgoraRateLimit(
      rateLimitKey,
      isPublisher ? securityConfig.hostRateLimitPerWindow : securityConfig.audienceRateLimitPerWindow,
      securityConfig.rateLimitWindowSeconds,
    );

    if (!rateLimit.allowed) {
      logAgoraServerEvent("token.request.rate_limited", {
        requestId,
        requestIp,
        role: isPublisher ? "publisher" : "subscriber",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return res
        .status(429)
        .setHeader("Retry-After", String(rateLimit.retryAfterSeconds))
        .json({
          error: "Too many token requests",
          details: "Please retry after cooldown",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
    }

    if (uid === undefined || uid === null || (typeof uid !== "string" && typeof uid !== "number")) {
      logAgoraServerEvent("token.request.invalid", {
        requestId,
        reason: "invalid_uid",
      });
      return res.status(400).json({ error: "uid is required and must be a string or number" });
    }

    const agoraConfig = getAgoraConfig();
    if (!agoraConfig) {
      logAgoraServerEvent("token.request.config_missing", {
        requestId,
      });
      return res.status(503).json({
        error: "Agora server configuration is missing",
        missing: ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"],
      });
    }

    if (!isHex32(agoraConfig.appId) || !isHex32(agoraConfig.appCertificate)) {
      logAgoraServerEvent("token.request.config_invalid", {
        requestId,
      });
      return res.status(503).json({
        error: "Agora credentials are invalid format",
        details: "AGORA_APP_ID and AGORA_APP_CERTIFICATE must each be 32-character hexadecimal strings",
      });
    }

    if (isPublisher) {
      const hostAllowlist = getAgoraHostEmailAllowlist();
      if (hostAllowlist.size === 0) {
        logAgoraServerEvent("token.request.host_auth_missing", {
          requestId,
        });
        return res.status(503).json({
          error: "Host authorization is not configured",
          details: "Set AGORA_HOST_EMAILS with a comma-separated list of allowed host emails",
        });
      }

      const numericGuestId = Number(guestId);
      if (!Number.isInteger(numericGuestId) || numericGuestId <= 0) {
        logAgoraServerEvent("token.request.host_auth_denied", {
          requestId,
          reason: "invalid_guest_id",
        });
        return res.status(403).json({
          error: "Host authorization failed",
          details: "guestId is required for publisher tokens",
        });
      }

      let hostGuest: { id: number; email: string } | null = null;
      try {
        hostGuest = await getGuestForHostAuth(numericGuestId);
      } catch (lookupError: any) {
        logAgoraServerEvent("token.request.host_auth_denied", {
          requestId,
          reason: "guest_lookup_failed",
          message: lookupError?.message || "unknown",
        });
        return res.status(500).json({ error: "Host authorization lookup failed" });
      }

      if (!hostGuest || !hostAllowlist.has(String(hostGuest.email ?? "").trim().toLowerCase())) {
        logAgoraServerEvent("token.request.host_auth_denied", {
          requestId,
          reason: "guest_not_allowlisted",
          guestId: numericGuestId,
        });
        return res.status(403).json({
          error: "Host authorization failed",
          details: "This account is not allowed to publish",
        });
      }

      logAgoraServerEvent("token.request.host_auth_granted", {
        requestId,
        guestId: hostGuest.id,
      });
    }

    const rtcRole = isPublisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const tokenTtlSeconds = agoraConfig.tokenTtlSeconds;
    const privilegeExpireTs = currentTimestamp + agoraConfig.tokenTtlSeconds;

    try {
      let token = "";
      let resolvedUid: string | number = uid;

      if (typeof uid === "number" || (typeof uid === "string" && /^\d+$/.test(uid))) {
        const numericUid = typeof uid === "number" ? uid : Number(uid);
        token = RtcTokenBuilder.buildTokenWithUid(
          agoraConfig.appId,
          agoraConfig.appCertificate,
          sanitizedChannelName,
          numericUid,
          rtcRole,
          tokenTtlSeconds,
          tokenTtlSeconds,
        );
        resolvedUid = numericUid;
      } else {
        const account = String(uid).trim();
        if (!account) {
          logAgoraServerEvent("token.request.invalid", {
            requestId,
            reason: "empty_account_uid",
          });
          return res.status(400).json({ error: "uid cannot be an empty string" });
        }
        token = RtcTokenBuilder.buildTokenWithUserAccount(
          agoraConfig.appId,
          agoraConfig.appCertificate,
          sanitizedChannelName,
          account,
          rtcRole,
          tokenTtlSeconds,
          tokenTtlSeconds,
        );
        resolvedUid = account;
      }

      if (!token) {
        logAgoraServerEvent("token.issue.failed", {
          requestId,
          reason: "empty_token",
        });
        return res.status(500).json({ error: "Agora token generation returned an empty token" });
      }

      logAgoraServerEvent("token.issue.succeeded", {
        requestId,
        role: isPublisher ? "publisher" : "subscriber",
        channelName: sanitizedChannelName,
        uidType: typeof resolvedUid,
        expiresAt: privilegeExpireTs,
      });

      return res.json({
        appId: agoraConfig.appId,
        channelName: sanitizedChannelName,
        uid: resolvedUid,
        role: isPublisher ? "publisher" : "subscriber",
        token,
        expiresAt: privilegeExpireTs,
      });
    } catch (error: any) {
      logAgoraServerEvent("token.issue.failed", {
        requestId,
        reason: "exception",
        message: error?.message || "unknown",
      });
      return res.status(500).json({ error: error?.message || "Failed to generate Agora token" });
    }
  });

  app.post("/api/ad/generate", async (req, res) => {
    const itemTitleRaw = String(req.body?.itemTitle ?? "Vintage Leather Jacket").trim();
    const itemTitle = itemTitleRaw || "Vintage Leather Jacket";
    const fallbackAd = buildFallbackAd(itemTitle);

    if (!process.env.GEMINI_API_KEY) {
      return res.json(fallbackAd);
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an AI ad generator for a live shopping stream. The current item being auctioned is ${itemTitle}.
Generate a short, catchy advertisement for a related product.
Provide valid JSON only in this exact format:
{
  "title": "Short catchy title",
  "description": "One sentence description",
  "cta": "Call to action text",
  "imagePrompt": "A descriptive prompt for an image of the product"
}`,
        config: {
          responseMimeType: "application/json",
        },
      });

      const adData = response.text ? JSON.parse(response.text) as {
        title?: string;
        description?: string;
        cta?: string;
        imagePrompt?: string;
      } : null;

      let generatedImageUrl = fallbackAd.imageUrl;

      if (adData?.imagePrompt) {
        try {
          const imageResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: {
              parts: [{ text: adData.imagePrompt }],
            },
            config: {
              imageConfig: {
                aspectRatio: "16:9",
              },
            },
          });

          for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData?.data) {
              generatedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }
        } catch (imageError) {
          console.error("Ad image generation failed", imageError);
        }
      }

      const generatedAd = {
        id: `ad-${Date.now()}`,
        title: adData?.title?.trim() || fallbackAd.title,
        description: adData?.description?.trim() || fallbackAd.description,
        cta: adData?.cta?.trim() || fallbackAd.cta,
        imageUrl: generatedImageUrl,
        source: "gemini",
      };

      return res.json(generatedAd);
    } catch (error) {
      console.error("Ad generation API failed", error);
      return res.json(fallbackAd);
    }
  });

  app.post("/api/register", async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    if (usingSupabase && supabaseAdmin) {
      try {
        const { data: existing, error: existingError } = await supabaseAdmin
          .from("guests")
          .select("id, name, email, joined_at")
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        if (existing) {
          return res.json(existing);
        }

        const { data: created, error: createError } = await supabaseAdmin
          .from("guests")
          .insert({ name, email: normalizedEmail })
          .select("id, name, email, joined_at")
          .single();

        if (createError) {
          throw createError;
        }

        return res.json(created);
      } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Failed to register guest" });
      }
    }

    try {
      const stmt = db.prepare("INSERT INTO guests (name, email) VALUES (?, ?)");
      const info = stmt.run(name, normalizedEmail);
      res.json({ id: info.lastInsertRowid, name, email: normalizedEmail });
    } catch (err: any) {
      if (err.message.includes("UNIQUE constraint failed")) {
        const stmt = db.prepare("SELECT * FROM guests WHERE email = ?");
        const guest = stmt.get(normalizedEmail);
        res.json(guest);
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.get("/api/guests", async (req, res) => {
    if (usingSupabase && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("guests")
        .select("id, name, email, joined_at")
        .order("joined_at", { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    }

    const stmt = db.prepare("SELECT * FROM guests ORDER BY joined_at DESC");
    res.json(stmt.all());
  });

  app.get("/api/shop-dates/window", (req, res) => {
    return res.json(buildShopDateWindowStatus());
  });

  app.get("/api/shop-dates", (req, res) => {
    const fromIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      WHERE is_active = 1 AND starts_at >= ?
      ORDER BY starts_at ASC
      LIMIT 50
    `).all(fromIso) as any[];

    return res.json(rows.map(normalizeShopDateRow));
  });

  app.get("/api/shop-dates/admin", (req, res) => {
    const rows = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      ORDER BY starts_at ASC
      LIMIT 200
    `).all() as any[];

    return res.json(rows.map(normalizeShopDateRow));
  });

  app.post("/api/shop-dates", (req, res) => {
    const title = String(req.body?.title ?? "").trim();
    const startsAt = String(req.body?.starts_at ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const isActive = req.body?.is_active === false ? 0 : 1;

    if (!title || !startsAt) {
      return res.status(400).json({ error: "title and starts_at are required" });
    }

    const startsAtMs = Date.parse(startsAt);
    if (!Number.isFinite(startsAtMs)) {
      return res.status(400).json({ error: "starts_at must be a valid datetime" });
    }

    const normalizedStartsAt = new Date(startsAtMs).toISOString();

    const insertResult = db.prepare(`
      INSERT INTO shop_dates (title, starts_at, notes, is_active)
      VALUES (?, ?, ?, ?)
    `).run(title, normalizedStartsAt, notes || null, isActive);

    const created = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      WHERE id = ?
    `).get(insertResult.lastInsertRowid) as any;

    return res.status(201).json(normalizeShopDateRow(created));
  });

  app.put("/api/shop-dates/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid shop date id" });
    }

    const existing = db.prepare("SELECT id FROM shop_dates WHERE id = ?").get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: "Shop date not found" });
    }

    const title = String(req.body?.title ?? "").trim();
    const startsAt = String(req.body?.starts_at ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const isActive = req.body?.is_active === false ? 0 : 1;

    if (!title || !startsAt) {
      return res.status(400).json({ error: "title and starts_at are required" });
    }

    const startsAtMs = Date.parse(startsAt);
    if (!Number.isFinite(startsAtMs)) {
      return res.status(400).json({ error: "starts_at must be a valid datetime" });
    }

    const normalizedStartsAt = new Date(startsAtMs).toISOString();

    db.prepare(`
      UPDATE shop_dates
      SET title = ?, starts_at = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, normalizedStartsAt, notes || null, isActive, id);

    const updated = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      WHERE id = ?
    `).get(id) as any;

    return res.json(normalizeShopDateRow(updated));
  });

  app.post("/api/shop-dates/:id/toggle-active", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid shop date id" });
    }

    const existing = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      WHERE id = ?
    `).get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: "Shop date not found" });
    }

    const nextActive = Number(existing.is_active ?? 0) === 1 ? 0 : 1;
    db.prepare("UPDATE shop_dates SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextActive, id);

    const updated = db.prepare(`
      SELECT id, title, starts_at, notes, is_active, created_at, updated_at
      FROM shop_dates
      WHERE id = ?
    `).get(id) as any;

    return res.json(normalizeShopDateRow(updated));
  });

  app.post("/api/bid", async (req, res) => {
    const { guest_id, amount, item_id } = req.body;
    if (!guest_id || !amount || !item_id) {
      return res.status(400).json({ error: "guest_id, amount, and item_id are required" });
    }

    if (usingSupabase && supabaseAdmin) {
      try {
        const auction = await ensureAuctionByItemId(String(item_id));
        if (!auction) {
          return res.status(500).json({ error: "Unable to resolve auction" });
        }

        const { data, error } = await supabaseAdmin
          .from("bids")
          .insert({
            auction_id: auction.id,
            guest_id,
            amount,
          })
          .select("id, guest_id, amount, bid_time")
          .single();

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        return res.json({
          id: data.id,
          guest_id: data.guest_id,
          amount: data.amount,
          item_id,
          bid_time: data.bid_time,
        });
      } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Failed to create bid" });
      }
    }

    try {
      const stmt = db.prepare("INSERT INTO bids (guest_id, amount, item_id) VALUES (?, ?, ?)");
      const info = stmt.run(guest_id, amount, item_id);
      res.json({ id: info.lastInsertRowid, guest_id, amount, item_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bids/:item_id", async (req, res) => {
    const { item_id } = req.params;

    if (usingSupabase && supabaseAdmin) {
      try {
        const auction = await ensureAuctionByItemId(item_id);
        if (!auction) {
          return res.json([]);
        }

        const { data: bidRows, error: bidError } = await supabaseAdmin
          .from("bids")
          .select("id, guest_id, amount, bid_time")
          .eq("auction_id", auction.id)
          .order("amount", { ascending: false });

        if (bidError) {
          return res.status(500).json({ error: bidError.message });
        }

        const guestIds = Array.from(new Set((bidRows ?? []).map((row) => row.guest_id)));
        let guestNameMap = new Map<number, string>();

        if (guestIds.length > 0) {
          const { data: guests, error: guestError } = await supabaseAdmin
            .from("guests")
            .select("id, name")
            .in("id", guestIds);

          if (guestError) {
            return res.status(500).json({ error: guestError.message });
          }

          guestNameMap = new Map((guests ?? []).map((g) => [Number(g.id), String(g.name)]));
        }

        const response = (bidRows ?? []).map((row) => ({
          id: row.id,
          guest_id: row.guest_id,
          amount: row.amount,
          item_id,
          bid_time: row.bid_time,
          guest_name: guestNameMap.get(Number(row.guest_id)) ?? "Unknown",
        }));

        return res.json(response);
      } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Failed to load bids" });
      }
    }

    const stmt = db.prepare(`
      SELECT bids.*, guests.name as guest_name 
      FROM bids 
      JOIN guests ON bids.guest_id = guests.id 
      WHERE item_id = ? 
      ORDER BY amount DESC
    `);
    res.json(stmt.all(item_id));
  });

  app.get("/api/categories", async (req, res) => {
    if (usingSupabase && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("categories")
        .select("id, name, parent_id")
        .order("name", { ascending: true });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const allCategories = (data ?? []) as any[];
      const parents = allCategories.filter((c) => c.parent_id === null);
      const result = parents.map((parent) => ({
        ...parent,
        subcategories: allCategories.filter((c) => c.parent_id === parent.id),
      }));
      return res.json(result);
    }

    const stmt = db.prepare("SELECT * FROM categories ORDER BY name ASC");
    const allCategories = stmt.all() as any[];
    
    // Group subcategories under parents
    const parents = allCategories.filter(c => c.parent_id === null);
    const result = parents.map(parent => {
      return {
        ...parent,
        subcategories: allCategories.filter(c => c.parent_id === parent.id)
      };
    });
    
    res.json(result);
  });

  app.get("/api/ebay/sold-search", async (req, res) => {
    const query = String(req.query.q ?? "").trim();
    const limit = Math.min(Number(req.query.limit ?? 5) || 5, 10);

    if (!query) {
      return res.status(400).json({ error: "Query parameter q is required" });
    }

    try {
      const tokenWithCfg = await getEbayAccessToken();
      if (!tokenWithCfg) {
        return res.json({ configMissing: true, itemSummaries: [] });
      }

      const { token, cfg } = tokenWithCfg;
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        sort: "endTimeNewest",
        filter: "soldItems:{true}",
      });

      const ebayResponse = await fetch(`${cfg.apiBase}/buy/browse/v1/item_summary/search?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": cfg.marketplaceId,
          "Content-Type": "application/json",
        },
      });

      if (!ebayResponse.ok) {
        const text = await ebayResponse.text();
        return res.status(502).json({ error: `eBay Browse API failed (${ebayResponse.status})`, details: text });
      }

      const data = await ebayResponse.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to fetch sold listings from eBay" });
    }
  });

  type LotDecoderImportItem = {
    sku?: string;
    title: string;
    expected: number;
    quantity_expected?: number;
    ebay_guard?: number;
  };

  type LotDecoderImportWarning = {
    row: number;
    title: string;
    message: string;
  };

  const normalizeLotDecoderItemsForResponse = (rows: any[]) => {
    return rows.map((row) => {
      const expected = Number(row.expected_value ?? 0);
      const actual = Number(row.actual_value ?? 0);
      const quantityExpected = Number(row.quantity_expected ?? 1);
      const quantitySold = Number(row.quantity_sold ?? 0);
      const remainingQty = Math.max(quantityExpected - quantitySold, 0);
      const ebayGuardValue = Number(row.ebay_guard_value ?? 0);
      const fallbackEventual = Math.max(expected - actual, 0);
      const eventualRaw = remainingQty > 0
        ? (ebayGuardValue > 0 ? ebayGuardValue * remainingQty : fallbackEventual)
        : 0;

      return {
        id: String(row.id),
        sku: row.sku ?? null,
        title: String(row.title ?? ""),
        quantity_expected: quantityExpected,
        quantity_sold: quantitySold,
        ebay_guard_value: ebayGuardValue,
        expected_value: expected,
        actual_value: actual,
        eventual_value: Number(eventualRaw),
      };
    });
  };

  const isSupabaseRelationMissing = (error: any) => {
    const code = String(error?.code ?? "");
    const message = String(error?.message ?? "").toLowerCase();
    const details = String(error?.details ?? "").toLowerCase();
    const hint = String(error?.hint ?? "").toLowerCase();

    return (
      code === "42P01" ||
      code.toUpperCase() === "PGRST205" ||
      (message.includes("relation") && message.includes("does not exist")) ||
      message.includes("could not find the table") ||
      message.includes("schema cache") ||
      details.includes("schema cache") ||
      hint.includes("schema cache")
    );
  };

  let lotDecoderSupabaseAvailableCache: boolean | null = null;

  const canUseSupabaseForLotDecoder = async () => {
    if (!usingSupabase || !supabaseAdmin) {
      return false;
    }

    if (lotDecoderSupabaseAvailableCache !== null) {
      return lotDecoderSupabaseAvailableCache;
    }

    const { error } = await supabaseAdmin
      .from("lot_decoder_sessions")
      .select("id")
      .limit(1);

    if (error) {
      if (isSupabaseRelationMissing(error)) {
        lotDecoderSupabaseAvailableCache = false;
        return false;
      }

      throw new Error(error.message);
    }

    lotDecoderSupabaseAvailableCache = true;
    return true;
  };

  app.get("/api/lot-decoder/sessions", async (req, res) => {
    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .select("id, name, status, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        if (isSupabaseRelationMissing(error)) {
          lotDecoderSupabaseAvailableCache = false;
        }
        return res.status(500).json({ error: error.message });
      }

      const sessions = (data ?? []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        status: String(row.status ?? "draft"),
        created_at: row.created_at,
      }));

      return res.json(sessions);
    }

    const stmt = db.prepare(`
      SELECT id, name, status, created_at
      FROM lot_decoder_sessions
      ORDER BY created_at DESC, id DESC
    `);

    const rows = stmt.all() as any[];
    return res.json(rows.map((row) => ({ ...row, id: String(row.id) })));
  });

  app.get("/api/lot-decoder/live-context", async (req, res) => {
    const getSqliteLiveContext = () => {
      const session = (db.prepare(`
        SELECT id, name, status
        FROM lot_decoder_sessions
        WHERE status = 'live'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `).get() || db.prepare(`
        SELECT id, name, status
        FROM lot_decoder_sessions
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).get()) as any;

      if (!session) {
        return { session: null, items: [] as any[] };
      }

      const items = db.prepare(`
        SELECT id, sku, title, quantity_expected, quantity_sold
        FROM lot_decoder_items
        WHERE session_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(session.id) as any[];

      return {
        session: {
          id: String(session.id),
          name: String(session.name ?? ""),
          status: String(session.status ?? "draft"),
        },
        items: items.map((item) => ({
          id: String(item.id),
          sku: item.sku ? String(item.sku) : null,
          title: String(item.title ?? ""),
          quantity_expected: Number(item.quantity_expected ?? 1),
          quantity_sold: Number(item.quantity_sold ?? 0),
        })),
      };
    };

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data: activeRows, error: activeError } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .select("id, name, status")
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (activeError) {
        return res.status(500).json({ error: activeError.message });
      }

      let session = (activeRows ?? [])[0] as any;

      if (!session) {
        const { data: latestRows, error: latestError } = await supabaseAdmin
          .from("lot_decoder_sessions")
          .select("id, name, status")
          .order("created_at", { ascending: false })
          .limit(1);

        if (latestError) {
          return res.status(500).json({ error: latestError.message });
        }

        session = (latestRows ?? [])[0] as any;
      }

      if (!session) {
        const sqliteContext = getSqliteLiveContext();
        return res.json(sqliteContext);
      }

      const { data: items, error: itemsError } = await supabaseAdmin
        .from("lot_decoder_items")
        .select("id, sku, title, quantity_expected, quantity_sold")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });

      if (itemsError) {
        return res.status(500).json({ error: itemsError.message });
      }

      if ((items ?? []).length === 0) {
        const sqliteContext = getSqliteLiveContext();
        if (sqliteContext.session || sqliteContext.items.length > 0) {
          return res.json(sqliteContext);
        }
      }

      return res.json({
        session: {
          id: String(session.id),
          name: String(session.name ?? ""),
          status: String(session.status ?? "draft"),
        },
        items: (items ?? []).map((item: any) => ({
          id: String(item.id),
          sku: item.sku ? String(item.sku) : null,
          title: String(item.title ?? ""),
          quantity_expected: Number(item.quantity_expected ?? 1),
          quantity_sold: Number(item.quantity_sold ?? 0),
        })),
      });
    }

    return res.json(getSqliteLiveContext());
  });

  app.post("/api/lot-decoder/sessions", async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();

    if (!name) {
      return res.status(400).json({ error: "Session name is required" });
    }

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .insert({
          name,
          notes: notes || null,
          status: "draft",
        })
        .select("id, name, status, created_at")
        .single();

      if (error) {
        if (isSupabaseRelationMissing(error)) {
          lotDecoderSupabaseAvailableCache = false;
        }
        return res.status(500).json({ error: error.message });
      }

      return res.json({
        id: String(data.id),
        name: data.name,
        status: data.status,
        created_at: data.created_at,
      });
    }

    const stmt = db.prepare(`
      INSERT INTO lot_decoder_sessions (name, notes, status)
      VALUES (?, ?, 'draft')
    `);

    const info = stmt.run(name, notes || null);

    const selectStmt = db.prepare(`
      SELECT id, name, status, created_at
      FROM lot_decoder_sessions
      WHERE id = ?
    `);

    const row = selectStmt.get(info.lastInsertRowid) as any;
    return res.json({ ...row, id: String(row.id) });
  });

  app.post("/api/lot-decoder/:sessionId/activate", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();

    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .select("id")
        .eq("id", sessionId)
        .maybeSingle();

      if (existingError) {
        return res.status(500).json({ error: existingError.message });
      }

      if (!existing) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { error: resetError } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .update({ status: "draft" })
        .eq("status", "live")
        .neq("id", sessionId);

      if (resetError) {
        return res.status(500).json({ error: resetError.message });
      }

      const { error: activateError } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .update({ status: "live" })
        .eq("id", sessionId);

      if (activateError) {
        return res.status(500).json({ error: activateError.message });
      }

      return res.json({ id: sessionId, status: "live" });
    }

    const selectStmt = db.prepare("SELECT id FROM lot_decoder_sessions WHERE id = ?");
    const existing = selectStmt.get(sessionId);

    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }

    const tx = db.transaction(() => {
      db.prepare("UPDATE lot_decoder_sessions SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE status = 'live'").run();
      db.prepare("UPDATE lot_decoder_sessions SET status = 'live', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
    });

    tx();
    return res.json({ id: String(sessionId), status: "live" });
  });

  app.post("/api/lot-decoder/:sessionId/import", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();
    const inputItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const rowResults = (inputItems as LotDecoderImportItem[]).map((item, index) => {
      const title = String(item?.title ?? "").trim();
      const expected = Number(item?.expected ?? 0);
      const quantityExpectedRaw = Number(item?.quantity_expected ?? 1);
      const quantityExpected = Number.isFinite(quantityExpectedRaw) && quantityExpectedRaw > 0
        ? Math.floor(quantityExpectedRaw)
        : 1;
      const ebayGuard = Number(item?.ebay_guard ?? 0);
      const row = index + 2;

      if (!title) {
        return {
          isValid: false,
          warning: {
            row,
            title: "(missing title)",
            message: "Row skipped because title is missing.",
          } as LotDecoderImportWarning,
        };
      }

      if (!Number.isFinite(expected) || expected < 0) {
        return {
          isValid: false,
          warning: {
            row,
            title,
            message: "Row skipped because expected must be a non-negative number.",
          } as LotDecoderImportWarning,
        };
      }

      if (!Number.isFinite(ebayGuard)) {
        return {
          isValid: false,
          warning: {
            row,
            title,
            message: "Row skipped because ebay_guard must be numeric when provided.",
          } as LotDecoderImportWarning,
        };
      }

      return {
        isValid: true,
        row,
        item: {
          sku: String(item?.sku ?? "").trim() || null,
          title,
          expected,
          quantity_expected: quantityExpected,
          ebay_guard: ebayGuard,
        },
      };
    });

    const items = rowResults
      .filter((row): row is { isValid: true; row: number; item: { sku: string | null; title: string; expected: number; quantity_expected: number; ebay_guard: number } } => row.isValid)
      .map((row) => row.item);

    const warnings: LotDecoderImportWarning[] = rowResults
      .filter((row): row is { isValid: false; warning: LotDecoderImportWarning } => !row.isValid)
      .map((row) => row.warning);

    warnings.push(...items.flatMap((item, index) => {
      if (item.ebay_guard > 0 && item.ebay_guard < item.expected * 0.75) {
        return [{
          row: index + 2,
          title: item.title,
          message: `eBay guard ${item.ebay_guard.toFixed(2)} is below 75% of expected ${item.expected.toFixed(2)}.`,
        }];
      }

      return [];
    }));

    if (items.length === 0) {
      return res.status(400).json({ error: "At least one valid item is required", warnings });
    }

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { error: insertError } = await supabaseAdmin
        .from("lot_decoder_items")
        .insert(
          items.map((item) => ({
            session_id: sessionId,
            sku: item.sku,
            title: item.title,
            quantity_expected: item.quantity_expected,
            ebay_guard_value: item.ebay_guard,
            expected_value: item.expected * item.quantity_expected,
            actual_value: 0,
            quantity_sold: 0,
          })),
        );

      if (insertError) {
        if (isSupabaseRelationMissing(insertError)) {
          lotDecoderSupabaseAvailableCache = false;
        }
        return res.status(500).json({ error: insertError.message });
      }

      return res.json({ imported: items.length, warnings });
    }

    const insertStmt = db.prepare(`
      INSERT INTO lot_decoder_items
      (session_id, sku, title, quantity_expected, quantity_sold, ebay_guard_value, expected_value, actual_value)
      VALUES (?, ?, ?, ?, 0, ?, ?, 0)
    `);

    const transaction = db.transaction((rows: typeof items) => {
      for (const row of rows) {
        insertStmt.run(sessionId, row.sku, row.title, row.quantity_expected, row.ebay_guard, row.expected * row.quantity_expected);
      }
    });

    transaction(items);
    return res.json({ imported: items.length, warnings });
  });

  app.post("/api/lot-decoder/live-rofr-check", async (req, res) => {
    const itemId = String(req.body?.item_id ?? "").trim();
    const itemTitle = String(req.body?.item_title ?? "").trim();
    const winningBid = Number(req.body?.winning_bid ?? 0);
    const winningGuestId = Number(req.body?.winning_guest_id ?? 0);

    if (!Number.isFinite(winningBid) || winningBid <= 0) {
      return res.status(400).json({ error: "winning_bid must be greater than 0" });
    }

    const normalizedTitle = itemTitle.toLowerCase();
    const thresholdRatio = 0.75;

    const buildRofrOrderSqlite = () => {
      const participants = db.prepare(`
        SELECT DISTINCT g.id, g.name
        FROM bids b
        JOIN guests g ON g.id = b.guest_id
        ORDER BY g.joined_at ASC, g.id ASC
      `).all() as Array<{ id: number; name: string }>;

      const order: Array<{ guest_id: number; name: string }> = [];
      const seen = new Set<number>();

      if (Number.isFinite(winningGuestId) && winningGuestId > 0) {
        const winner = participants.find((p) => p.id === winningGuestId);
        if (winner) {
          order.push({ guest_id: winner.id, name: winner.name });
          seen.add(winner.id);
        }
      }

      for (const participant of participants) {
        if (seen.has(participant.id)) {
          continue;
        }
        order.push({ guest_id: participant.id, name: participant.name });
        seen.add(participant.id);
      }

      return order;
    };

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data: activeRows, error: activeError } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .select("id")
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (activeError) {
        return res.status(500).json({ error: activeError.message });
      }

      let session = (activeRows ?? [])[0] as any;

      if (!session) {
        const { data: latestRows, error: latestError } = await supabaseAdmin
          .from("lot_decoder_sessions")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1);

        if (latestError) {
          return res.status(500).json({ error: latestError.message });
        }

        session = (latestRows ?? [])[0] as any;
      }

      if (!session) {
        return res.json({
          meets_guard: true,
          guard_value: 0,
          min_guard_value: 0,
          threshold_ratio: thresholdRatio,
          rofr_order: [],
        });
      }

      let item: any | null = null;

      if (itemId) {
        const { data: skuRows, error: skuError } = await supabaseAdmin
          .from("lot_decoder_items")
          .select("id, expected_value, quantity_expected, ebay_guard_value")
          .eq("session_id", session.id)
          .eq("sku", itemId)
          .order("created_at", { ascending: true })
          .limit(1);

        if (skuError) {
          return res.status(500).json({ error: skuError.message });
        }

        item = (skuRows ?? [])[0] ?? null;
      }

      if (!item && normalizedTitle) {
        const { data: titleRows, error: titleError } = await supabaseAdmin
          .from("lot_decoder_items")
          .select("id, expected_value, quantity_expected, ebay_guard_value")
          .eq("session_id", session.id)
          .ilike("title", normalizedTitle)
          .order("created_at", { ascending: true })
          .limit(1);

        if (titleError) {
          return res.status(500).json({ error: titleError.message });
        }

        item = (titleRows ?? [])[0] ?? null;
      }

      if (!item) {
        return res.json({
          meets_guard: true,
          guard_value: 0,
          min_guard_value: 0,
          threshold_ratio: thresholdRatio,
          rofr_order: [],
        });
      }

      const quantityExpected = Math.max(Number(item.quantity_expected ?? 1), 1);
      const expectedUnitValue = Number(item.expected_value ?? 0) / quantityExpected;
      const minGuardValue = expectedUnitValue * thresholdRatio;
      const guardValueRaw = Number(item.ebay_guard_value ?? 0);
      const guardValue = guardValueRaw > 0 ? guardValueRaw : minGuardValue;
      const meetsGuard = winningBid >= guardValue;

      const { data: bidGuests, error: bidGuestsError } = await supabaseAdmin
        .from("bids")
        .select("guest_id")
        .order("bid_time", { ascending: true });

      if (bidGuestsError) {
        return res.status(500).json({ error: bidGuestsError.message });
      }

      const orderedGuestIds: number[] = [];
      const seen = new Set<number>();
      for (const row of bidGuests ?? []) {
        const guestId = Number((row as any).guest_id);
        if (!Number.isFinite(guestId) || guestId <= 0 || seen.has(guestId)) {
          continue;
        }
        seen.add(guestId);
        orderedGuestIds.push(guestId);
      }

      if (orderedGuestIds.length === 0) {
        return res.json({
          meets_guard: meetsGuard,
          guard_value: guardValue,
          min_guard_value: minGuardValue,
          threshold_ratio: thresholdRatio,
          rofr_order: [],
        });
      }

      const { data: guestsData, error: guestsError } = await supabaseAdmin
        .from("guests")
        .select("id, name")
        .in("id", orderedGuestIds);

      if (guestsError) {
        return res.status(500).json({ error: guestsError.message });
      }

      const guestNameMap = new Map<number, string>((guestsData ?? []).map((g: any) => [Number(g.id), String(g.name)]));
      const rofrOrder: Array<{ guest_id: number; name: string }> = [];
      const rofrSeen = new Set<number>();

      if (Number.isFinite(winningGuestId) && winningGuestId > 0) {
        const winnerName = guestNameMap.get(winningGuestId);
        if (winnerName) {
          rofrOrder.push({ guest_id: winningGuestId, name: winnerName });
          rofrSeen.add(winningGuestId);
        }
      }

      for (const guestId of orderedGuestIds) {
        if (rofrSeen.has(guestId)) {
          continue;
        }
        const name = guestNameMap.get(guestId);
        if (!name) {
          continue;
        }
        rofrOrder.push({ guest_id: guestId, name });
        rofrSeen.add(guestId);
      }

      return res.json({
        meets_guard: meetsGuard,
        guard_value: guardValue,
        min_guard_value: minGuardValue,
        threshold_ratio: thresholdRatio,
        rofr_order: rofrOrder,
      });
    }

    const activeSessionStmt = db.prepare(`
      SELECT id
      FROM lot_decoder_sessions
      WHERE status = 'live'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);

    const latestSessionStmt = db.prepare(`
      SELECT id
      FROM lot_decoder_sessions
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    const session = (activeSessionStmt.get() || latestSessionStmt.get()) as any;

    if (!session) {
      return res.json({
        meets_guard: true,
        guard_value: 0,
        min_guard_value: 0,
        threshold_ratio: thresholdRatio,
        rofr_order: [],
      });
    }

    let item: any;
    if (itemId) {
      item = db.prepare(`
        SELECT expected_value, quantity_expected, ebay_guard_value
        FROM lot_decoder_items
        WHERE session_id = ? AND sku = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `).get(session.id, itemId);
    }

    if (!item && normalizedTitle) {
      item = db.prepare(`
        SELECT expected_value, quantity_expected, ebay_guard_value
        FROM lot_decoder_items
        WHERE session_id = ? AND lower(title) = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `).get(session.id, normalizedTitle);
    }

    if (!item) {
      return res.json({
        meets_guard: true,
        guard_value: 0,
        min_guard_value: 0,
        threshold_ratio: thresholdRatio,
        rofr_order: buildRofrOrderSqlite(),
      });
    }

    const quantityExpected = Math.max(Number(item.quantity_expected ?? 1), 1);
    const expectedUnitValue = Number(item.expected_value ?? 0) / quantityExpected;
    const minGuardValue = expectedUnitValue * thresholdRatio;
    const guardValueRaw = Number(item.ebay_guard_value ?? 0);
    const guardValue = guardValueRaw > 0 ? guardValueRaw : minGuardValue;

    return res.json({
      meets_guard: winningBid >= guardValue,
      guard_value: guardValue,
      min_guard_value: minGuardValue,
      threshold_ratio: thresholdRatio,
      rofr_order: buildRofrOrderSqlite(),
    });
  });

  app.post("/api/lot-decoder/:sessionId/sales", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();
    const itemId = String(req.body?.item_id ?? "").trim();
    const saleAmount = Number(req.body?.sale_amount ?? 0);

    if (!sessionId || !itemId || !Number.isFinite(saleAmount) || saleAmount <= 0) {
      return res.status(400).json({ error: "sessionId, item_id, and sale_amount > 0 are required" });
    }

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("lot_decoder_items")
        .select("id, session_id, actual_value, quantity_sold, quantity_expected")
        .eq("id", itemId)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (existingError) {
        if (isSupabaseRelationMissing(existingError)) {
          lotDecoderSupabaseAvailableCache = false;
        }
        return res.status(500).json({ error: existingError.message });
      }

      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }

      const quantitySold = Number(existing.quantity_sold ?? 0);
      const quantityExpected = Number(existing.quantity_expected ?? 1);

      if (quantitySold >= quantityExpected) {
        return res.status(400).json({ error: "All expected quantity for this item has already been sold" });
      }

      const nextActual = Number(existing.actual_value ?? 0) + saleAmount;
      const nextQuantitySold = quantitySold + 1;

      const { error: updateError } = await supabaseAdmin
        .from("lot_decoder_items")
        .update({
          actual_value: nextActual,
          quantity_sold: nextQuantitySold,
        })
        .eq("id", itemId)
        .eq("session_id", sessionId);

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      const { error: saleError } = await supabaseAdmin
        .from("lot_decoder_sales")
        .insert({
          session_id: sessionId,
          item_id: itemId,
          sale_amount: saleAmount,
        });

      if (saleError) {
        return res.status(500).json({ error: saleError.message });
      }

      return res.json({ ok: true });
    }

    const existingStmt = db.prepare(`
      SELECT id, actual_value, quantity_sold, quantity_expected
      FROM lot_decoder_items
      WHERE id = ? AND session_id = ?
    `);

    const existing = existingStmt.get(itemId, sessionId) as any;

    if (!existing) {
      return res.status(404).json({ error: "Item not found" });
    }

    const quantitySold = Number(existing.quantity_sold ?? 0);
    const quantityExpected = Number(existing.quantity_expected ?? 1);

    if (quantitySold >= quantityExpected) {
      return res.status(400).json({ error: "All expected quantity for this item has already been sold" });
    }

    const nextActual = Number(existing.actual_value ?? 0) + saleAmount;
    const nextQuantitySold = quantitySold + 1;

    const updateStmt = db.prepare(`
      UPDATE lot_decoder_items
      SET actual_value = ?, quantity_sold = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND session_id = ?
    `);
    updateStmt.run(nextActual, nextQuantitySold, itemId, sessionId);

    const saleStmt = db.prepare(`
      INSERT INTO lot_decoder_sales (session_id, item_id, sale_amount)
      VALUES (?, ?, ?)
    `);
    saleStmt.run(sessionId, itemId, saleAmount);

    return res.json({ ok: true });
  });

  app.get("/api/lot-decoder/:sessionId/items", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();

    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("lot_decoder_items")
        .select("id, sku, title, quantity_expected, quantity_sold, ebay_guard_value, expected_value, actual_value, eventual_value")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error) {
        if (isSupabaseRelationMissing(error)) {
          lotDecoderSupabaseAvailableCache = false;
        }
        return res.status(500).json({ error: error.message });
      }

      return res.json(normalizeLotDecoderItemsForResponse(data ?? []));
    }

    const stmt = db.prepare(`
      SELECT
        id,
        sku,
        title,
        quantity_expected,
        quantity_sold,
        ebay_guard_value,
        expected_value,
        actual_value,
        CASE
          WHEN expected_value - actual_value < 0 THEN 0
          ELSE expected_value - actual_value
        END AS eventual_value
      FROM lot_decoder_items
      WHERE session_id = ?
      ORDER BY created_at ASC, id ASC
    `);

    const rows = stmt.all(sessionId) as any[];
    return res.json(normalizeLotDecoderItemsForResponse(rows));
  });

  app.get("/api/lot-decoder/:sessionId/metrics", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();

    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("lot_decoder_items")
        .select("expected_value, actual_value, quantity_expected, quantity_sold, ebay_guard_value")
        .eq("session_id", sessionId);

      if (error) {
        if (isSupabaseRelationMissing(error)) {
          lotDecoderSupabaseAvailableCache = false;
        }
        return res.status(500).json({ error: error.message });
      }

      const rows = data ?? [];
      const projectedTotal = rows.reduce((sum: number, row: any) => sum + Number(row.expected_value ?? 0), 0);
      const actualTotal = rows.reduce((sum: number, row: any) => sum + Number(row.actual_value ?? 0), 0);
      const soldCount = rows.reduce((sum: number, row: any) => sum + Number(row.quantity_sold ?? 0), 0);
      const eventualTotal = rows.reduce((sum: number, row: any) => {
        const quantityExpected = Number(row.quantity_expected ?? 1);
        const quantitySold = Number(row.quantity_sold ?? 0);
        const remainingQty = Math.max(quantityExpected - quantitySold, 0);
        const ebayGuardValue = Number(row.ebay_guard_value ?? 0);
        const fallbackEventual = Math.max(Number(row.expected_value ?? 0) - Number(row.actual_value ?? 0), 0);
        const eventual = remainingQty > 0 ? (ebayGuardValue > 0 ? ebayGuardValue * remainingQty : fallbackEventual) : 0;
        return sum + eventual;
      }, 0);

      return res.json({
        product_count: rows.length,
        projected_total: projectedTotal,
        actual_total: actualTotal,
        eventual_total: eventualTotal,
        sold_count: soldCount,
      });
    }

    const stmt = db.prepare(`
      SELECT
        COUNT(*) AS product_count,
        COALESCE(SUM(expected_value), 0) AS projected_total,
        COALESCE(SUM(actual_value), 0) AS actual_total,
        COALESCE(SUM(quantity_sold), 0) AS sold_count,
        COALESCE(SUM(
          CASE
            WHEN (quantity_expected - quantity_sold) <= 0 THEN 0
            WHEN ebay_guard_value > 0 THEN ebay_guard_value * (quantity_expected - quantity_sold)
            WHEN (expected_value - actual_value) < 0 THEN 0
            ELSE (expected_value - actual_value)
          END
        ), 0) AS eventual_total
      FROM lot_decoder_items
      WHERE session_id = ?
    `);

    const row = stmt.get(sessionId) as any;
    const projectedTotal = Number(row?.projected_total ?? 0);
    const actualTotal = Number(row?.actual_total ?? 0);

    return res.json({
      product_count: Number(row?.product_count ?? 0),
      projected_total: projectedTotal,
      actual_total: actualTotal,
      eventual_total: Number(row?.eventual_total ?? 0),
      sold_count: Number(row?.sold_count ?? 0),
    });
  });

  app.post("/api/lot-decoder/live-sale", async (req, res) => {
    const itemId = String(req.body?.item_id ?? "").trim();
    const itemTitle = String(req.body?.item_title ?? "").trim();
    const saleAmount = Number(req.body?.sale_amount ?? 0);

    if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
      return res.status(400).json({ error: "sale_amount must be greater than 0" });
    }

    const normalizedTitle = itemTitle.toLowerCase();
    const fallbackTitle = itemTitle || itemId || "Live Item";

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data: activeRows, error: activeError } = await supabaseAdmin
        .from("lot_decoder_sessions")
        .select("id, name")
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (activeError) {
        return res.status(500).json({ error: activeError.message });
      }

      let session = (activeRows ?? [])[0] as any;

      if (!session) {
        const { data: latestRows, error: latestError } = await supabaseAdmin
          .from("lot_decoder_sessions")
          .select("id, name")
          .order("created_at", { ascending: false })
          .limit(1);

        if (latestError) {
          return res.status(500).json({ error: latestError.message });
        }

        session = (latestRows ?? [])[0] as any;
      }

      if (!session) {
        return res.status(404).json({ error: "No lot decoder session available" });
      }

      let item: any | null = null;

      if (itemId) {
        const { data: skuRows, error: skuError } = await supabaseAdmin
          .from("lot_decoder_items")
          .select("id, actual_value, quantity_sold, quantity_expected")
          .eq("session_id", session.id)
          .eq("sku", itemId)
          .order("created_at", { ascending: true })
          .limit(1);

        if (skuError) {
          return res.status(500).json({ error: skuError.message });
        }

        item = (skuRows ?? [])[0] ?? null;
      }

      if (!item && normalizedTitle) {
        const { data: titleRows, error: titleError } = await supabaseAdmin
          .from("lot_decoder_items")
          .select("id, actual_value, quantity_sold, quantity_expected, title")
          .eq("session_id", session.id)
          .ilike("title", normalizedTitle)
          .order("created_at", { ascending: true })
          .limit(1);

        if (titleError) {
          return res.status(500).json({ error: titleError.message });
        }

        item = (titleRows ?? [])[0] ?? null;
      }

      if (!item) {
        const { data: created, error: createError } = await supabaseAdmin
          .from("lot_decoder_items")
          .insert({
            session_id: session.id,
            sku: itemId || null,
            title: fallbackTitle,
            expected_value: 0,
            actual_value: 0,
            quantity_expected: 1,
            quantity_sold: 0,
          })
          .select("id, actual_value, quantity_sold, quantity_expected")
          .single();

        if (createError) {
          return res.status(500).json({ error: createError.message });
        }

        item = created;
      }

      const quantitySold = Number(item.quantity_sold ?? 0);
      const quantityExpected = Number(item.quantity_expected ?? 1);

      if (quantitySold >= quantityExpected) {
        return res.status(409).json({ error: "Matched lot item is already fully sold" });
      }

      const nextActual = Number(item.actual_value ?? 0) + saleAmount;
      const nextQuantitySold = quantitySold + 1;

      const { error: updateError } = await supabaseAdmin
        .from("lot_decoder_items")
        .update({
          actual_value: nextActual,
          quantity_sold: nextQuantitySold,
        })
        .eq("id", item.id)
        .eq("session_id", session.id);

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      const { error: saleError } = await supabaseAdmin
        .from("lot_decoder_sales")
        .insert({
          session_id: session.id,
          item_id: item.id,
          sale_amount: saleAmount,
          metadata: {
            source: "live-shopping",
            item_id: itemId || null,
            item_title: itemTitle || null,
          },
        });

      if (saleError) {
        return res.status(500).json({ error: saleError.message });
      }

      return res.json({
        ok: true,
        session_id: String(session.id),
        item_id: String(item.id),
      });
    }

    const activeSessionStmt = db.prepare(`
      SELECT id, name
      FROM lot_decoder_sessions
      WHERE status = 'live'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);

    const latestSessionStmt = db.prepare(`
      SELECT id, name
      FROM lot_decoder_sessions
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    const session = (activeSessionStmt.get() || latestSessionStmt.get()) as any;

    if (!session) {
      return res.status(404).json({ error: "No lot decoder session available" });
    }

    let item: any;
    if (itemId) {
      item = db.prepare(`
        SELECT id, actual_value, quantity_sold, quantity_expected
        FROM lot_decoder_items
        WHERE session_id = ? AND sku = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `).get(session.id, itemId);
    }

    if (!item && normalizedTitle) {
      item = db.prepare(`
        SELECT id, actual_value, quantity_sold, quantity_expected
        FROM lot_decoder_items
        WHERE session_id = ? AND lower(title) = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `).get(session.id, normalizedTitle);
    }

    if (!item) {
      const info = db.prepare(`
        INSERT INTO lot_decoder_items
        (session_id, sku, title, quantity_expected, quantity_sold, expected_value, actual_value)
        VALUES (?, ?, ?, 1, 0, 0, 0)
      `).run(session.id, itemId || null, fallbackTitle);

      item = {
        id: info.lastInsertRowid,
        actual_value: 0,
        quantity_sold: 0,
        quantity_expected: 1,
      };
    }

    const quantitySold = Number(item.quantity_sold ?? 0);
    const quantityExpected = Number(item.quantity_expected ?? 1);

    if (quantitySold >= quantityExpected) {
      return res.status(409).json({ error: "Matched lot item is already fully sold" });
    }

    const nextActual = Number(item.actual_value ?? 0) + saleAmount;
    const nextQuantitySold = quantitySold + 1;

    db.prepare(`
      UPDATE lot_decoder_items
      SET actual_value = ?, quantity_sold = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND session_id = ?
    `).run(nextActual, nextQuantitySold, item.id, session.id);

    db.prepare(`
      INSERT INTO lot_decoder_sales (session_id, item_id, sale_amount, metadata)
      VALUES (?, ?, ?, ?)
    `).run(
      session.id,
      item.id,
      saleAmount,
      JSON.stringify({
        source: "live-shopping",
        item_id: itemId || null,
        item_title: itemTitle || null,
      }),
    );

    return res.json({
      ok: true,
      session_id: String(session.id),
      item_id: String(item.id),
    });
  });

  app.get("/api/lot-decoder/:sessionId/recent-sale", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "").trim();

    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const useSupabaseForLotDecoder = await canUseSupabaseForLotDecoder().catch((err: any) => {
      res.status(500).json({ error: err?.message || "Failed to resolve lot decoder storage mode" });
      return null;
    });

    if (useSupabaseForLotDecoder === null) {
      return;
    }

    if (useSupabaseForLotDecoder && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("lot_decoder_sales")
        .select("id, item_id, sale_amount, sold_at, metadata")
        .eq("session_id", sessionId)
        .order("sold_at", { ascending: false })
        .limit(1);

      if (error) {
        if (isSupabaseRelationMissing(error)) {
          lotDecoderSupabaseAvailableCache = false;
        }
        return res.status(500).json({ error: error.message });
      }

      const sale = (data ?? [])[0] as any;

      if (!sale) {
        return res.json({ sale: null });
      }

      let itemTitle: string | null = null;
      if (sale.item_id) {
        const { data: itemRow } = await supabaseAdmin
          .from("lot_decoder_items")
          .select("title")
          .eq("id", sale.item_id)
          .maybeSingle();

        itemTitle = itemRow?.title ? String(itemRow.title) : null;
      }

      const metadata = typeof sale.metadata === "object" && sale.metadata !== null ? sale.metadata : {};

      return res.json({
        sale: {
          id: String(sale.id),
          sale_amount: Number(sale.sale_amount ?? 0),
          sold_at: sale.sold_at,
          source: String((metadata as any)?.source ?? "manual"),
          item_title: String((metadata as any)?.item_title ?? itemTitle ?? ""),
        },
      });
    }

    const row = db.prepare(`
      SELECT id, item_id, sale_amount, sold_at, metadata
      FROM lot_decoder_sales
      WHERE session_id = ?
      ORDER BY sold_at DESC, id DESC
      LIMIT 1
    `).get(sessionId) as any;

    if (!row) {
      return res.json({ sale: null });
    }

    let metadata: any = {};
    if (row.metadata) {
      try {
        metadata = JSON.parse(String(row.metadata));
      } catch {
        metadata = {};
      }
    }

    let itemTitle = "";
    if (row.item_id) {
      const item = db.prepare("SELECT title FROM lot_decoder_items WHERE id = ?").get(row.item_id) as any;
      itemTitle = String(item?.title ?? "");
    }

    return res.json({
      sale: {
        id: String(row.id),
        sale_amount: Number(row.sale_amount ?? 0),
        sold_at: row.sold_at,
        source: String(metadata?.source ?? "manual"),
        item_title: String(metadata?.item_title ?? itemTitle),
      },
    });
  });

  const auctionNoticeSelectFields = "id, notice_type, message, created_by_guest_id, metadata, reviewed_at, reviewed_by_guest_id, created_at";

  const toNullableMetadata = (value: unknown) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== "string") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const normalizeSqliteNotice = (notice: any) => ({
    ...notice,
    metadata: toNullableMetadata(notice?.metadata),
  });

  const createAuctionNoticeRecord = async ({
    itemId,
    noticeType,
    message,
    createdByGuestId,
    metadata,
  }: {
    itemId: string;
    noticeType: string;
    message: string;
    createdByGuestId?: number | null;
    metadata?: unknown;
  }) => {
    if (usingSupabase && supabaseAdmin) {
      const auction = await ensureAuctionByItemId(itemId);
      if (!auction) {
        throw new Error("Unable to resolve auction");
      }

      const { data, error } = await supabaseAdmin
        .from("auction_notices")
        .insert({
          auction_id: auction.id,
          notice_type: noticeType,
          message,
          created_by_guest_id: createdByGuestId ?? null,
          metadata: metadata ?? null,
        })
        .select(auctionNoticeSelectFields)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return {
        ...data,
        item_id: itemId,
      };
    }

    const stmt = db.prepare(
      "INSERT INTO auction_notices (item_id, notice_type, message, created_by_guest_id, metadata) VALUES (?, ?, ?, ?, ?)"
    );

    const info = stmt.run(
      itemId,
      noticeType,
      message,
      createdByGuestId ?? null,
      metadata ? JSON.stringify(metadata) : null,
    );

    return {
      id: info.lastInsertRowid,
      item_id: itemId,
      notice_type: noticeType,
      message,
      created_by_guest_id: createdByGuestId ?? null,
      metadata: metadata ?? null,
      reviewed_at: null,
      reviewed_by_guest_id: null,
    };
  };

  const reviewAuctionNoticeRecord = async ({ noticeId, reviewedByGuestId }: { noticeId: number; reviewedByGuestId?: number | null }) => {
    if (usingSupabase && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("auction_notices")
        .update({
          reviewed_at: new Date().toISOString(),
          reviewed_by_guest_id: reviewedByGuestId ?? null,
        })
        .eq("id", noticeId)
        .select(`id, auction_id, ${auctionNoticeSelectFields}`)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return null;
      }

      const { data: auction, error: auctionError } = await supabaseAdmin
        .from("auctions")
        .select("item_id")
        .eq("id", data.auction_id)
        .maybeSingle();

      if (auctionError) {
        throw new Error(auctionError.message);
      }

      return {
        id: data.id,
        item_id: auction?.item_id ?? null,
        notice_type: data.notice_type,
        message: data.message,
        created_by_guest_id: data.created_by_guest_id,
        metadata: data.metadata,
        reviewed_at: data.reviewed_at,
        reviewed_by_guest_id: data.reviewed_by_guest_id,
        created_at: data.created_at,
      };
    }

    const updateStmt = db.prepare(
      "UPDATE auction_notices SET reviewed_at = CURRENT_TIMESTAMP, reviewed_by_guest_id = ? WHERE id = ?"
    );
    const info = updateStmt.run(reviewedByGuestId ?? null, noticeId);

    if (info.changes === 0) {
      return null;
    }

    const selectStmt = db.prepare(`
      SELECT id, item_id, notice_type, message, created_by_guest_id, metadata, reviewed_at, reviewed_by_guest_id, created_at
      FROM auction_notices
      WHERE id = ?
    `);

    return normalizeSqliteNotice(selectStmt.get(noticeId));
  };

  app.post("/api/auction-notices", async (req, res) => {
    const { item_id, notice_type, message, created_by_guest_id, metadata } = req.body;

    if (!item_id || !notice_type || !message) {
      return res.status(400).json({ error: "item_id, notice_type, and message are required" });
    }

    try {
      const created = await createAuctionNoticeRecord({
        itemId: String(item_id),
        noticeType: String(notice_type),
        message: String(message),
        createdByGuestId: created_by_guest_id ?? null,
        metadata: metadata ?? null,
      });
      return res.json(created);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to create auction notice" });
    }
  });

  app.patch("/api/auction-notices/:id/review", async (req, res) => {
    const noticeId = Number(req.params.id);
    const { reviewed_by_guest_id } = req.body ?? {};

    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      return res.status(400).json({ error: "Valid notice id is required" });
    }

    try {
      const reviewed = await reviewAuctionNoticeRecord({
        noticeId,
        reviewedByGuestId: reviewed_by_guest_id ?? null,
      });

      if (!reviewed) {
        return res.status(404).json({ error: "Notice not found" });
      }

      return res.json(reviewed);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to review auction notice" });
    }
  });

  const sendAuctionNotices = async (res: any, itemIdInput?: string) => {
    const itemIdQuery = String(itemIdInput ?? "").trim();

    if (usingSupabase && supabaseAdmin) {
      try {
        if (itemIdQuery) {
          const auction = await ensureAuctionByItemId(itemIdQuery);
          if (!auction) {
            return res.json([]);
          }

          const { data, error } = await supabaseAdmin
            .from("auction_notices")
            .select(auctionNoticeSelectFields)
            .eq("auction_id", auction.id)
            .order("created_at", { ascending: false })
            .limit(50);

          if (error) {
            return res.status(500).json({ error: error.message });
          }

          const notices = (data ?? []).map((notice: any) => ({
            ...notice,
            item_id: itemIdQuery,
          }));

          return res.json(notices);
        }

        const { data, error } = await supabaseAdmin
          .from("auction_notices")
          .select(`id, auction_id, ${auctionNoticeSelectFields}`)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        const auctionIds = Array.from(new Set((data ?? []).map((row: any) => row.auction_id).filter(Boolean)));
        const itemIdByAuctionId = new Map<string, string>();

        if (auctionIds.length > 0) {
          const { data: auctions, error: auctionError } = await supabaseAdmin
            .from("auctions")
            .select("id, item_id")
            .in("id", auctionIds);

          if (auctionError) {
            return res.status(500).json({ error: auctionError.message });
          }

          for (const auction of auctions ?? []) {
            itemIdByAuctionId.set(String((auction as any).id), String((auction as any).item_id));
          }
        }

        const notices = (data ?? []).map((notice: any) => ({
          id: notice.id,
          item_id: itemIdByAuctionId.get(String(notice.auction_id)) ?? null,
          notice_type: notice.notice_type,
          message: notice.message,
          created_by_guest_id: notice.created_by_guest_id,
          metadata: toNullableMetadata(notice.metadata),
          reviewed_at: notice.reviewed_at,
          reviewed_by_guest_id: notice.reviewed_by_guest_id,
          created_at: notice.created_at,
        }));

        return res.json(notices);
      } catch (err: any) {
        return res.status(500).json({ error: err?.message || "Failed to load auction notices" });
      }
    }

    try {
      if (itemIdQuery) {
        const stmt = db.prepare(`
          SELECT id, item_id, notice_type, message, created_by_guest_id, metadata, reviewed_at, reviewed_by_guest_id, created_at
          FROM auction_notices
          WHERE item_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        `);

        const notices = (stmt.all(itemIdQuery) as any[]).map(normalizeSqliteNotice);

        return res.json(notices);
      }

      const stmt = db.prepare(`
        SELECT id, item_id, notice_type, message, created_by_guest_id, metadata, reviewed_at, reviewed_by_guest_id, created_at
        FROM auction_notices
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `);

      const notices = (stmt.all() as any[]).map(normalizeSqliteNotice);

      return res.json(notices);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  };

  app.get("/api/auction-notices", async (req, res) => {
    return sendAuctionNotices(res, String(req.query.item_id ?? ""));
  });

  app.get("/api/auction-notices/:item_id", async (req, res) => {
    return sendAuctionNotices(res, req.params.item_id);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
