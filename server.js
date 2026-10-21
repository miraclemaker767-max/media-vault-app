const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "100kb" }));

// Set FRONTEND_ORIGIN to your exact site origin when the frontend is hosted
// separately, e.g. https://your-site.example. Leave unset for permissive CORS.
const allowedOrigin = process.env.FRONTEND_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

const PORT = Number(process.env.PORT || 3000);
const CACHE_TTL_MS = Math.max(60_000, Number(process.env.CACHE_TTL_SECONDS || 600) * 1000);
const REQUEST_TIMEOUT_MS = Math.max(3_000, Number(process.env.SOURCE_TIMEOUT_MS || 8000));
const MAX_ITEMS = Math.min(100, Math.max(1, Number(process.env.MAX_CATALOG_ITEMS || 60)));
const EPORNER_BASE = "https://www.eporner.com/api/v2/video/search/";

let cachedVideos = [];
let lastUpdated = null;
let refreshInProgress = false;
let lastRefreshError = null;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeHttpUrl(value) {
  const raw = asString(value);
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeEntry(item, sourceName, index) {
  const thumbnail =
    safeHttpUrl(item.thumbnailUrl) ||
    safeHttpUrl(item.thumbnail) ||
    safeHttpUrl(item.default_thumb && item.default_thumb.src) ||
    safeHttpUrl(item.thumbs && item.thumbs[0] && item.thumbs[0].src) ||
    safeHttpUrl(item.preview) ||
    "";

  const watchUrl =
    safeHttpUrl(item.watchUrl) ||
    safeHttpUrl(item.url) ||
    safeHttpUrl(item.video_url) ||
    safeHttpUrl(item.page_url) ||
    "";

  const embedUrl = safeHttpUrl(item.embedUrl) || safeHttpUrl(item.embed_url) || "";
  const id = asString(item.id) || asString(item.video_id) || `${sourceName}:${index}`;
  const title = asString(item.title) || asString(item.name) || "Untitled video";

  if (!thumbnail || !watchUrl) return null;

  return {
    id: `${sourceName}:${id}`,
    title: title.slice(0, 300),
    thumbnail,
    source: sourceName,
    watchUrl,
    embedUrl: embedUrl || null,
    targetUrl: watchUrl
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "MediaVaultCatalog/1.1" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchEporner() {
  const url = new URL(EPORNER_BASE);
  url.searchParams.set("query", process.env.EPORNER_QUERY || "trending");
  url.searchParams.set("per_page", String(Math.min(50, MAX_ITEMS)));
  url.searchParams.set("format", "json");
  const data = await fetchJson(url.toString());
  const items = Array.isArray(data.videos) ? data.videos : [];
  return items.map((item, i) => normalizeEntry(item, "Eporner", i)).filter(Boolean);
}

// Optional additional feeds. Configure CATALOG_FEED_URLS as a comma-separated
// list of JSON feed URLs that you are authorized to access and display.
// Each feed may return an array, {videos:[...]}, {items:[...]}, or {results:[...]}.
// Supported fields include title/name, id/video_id, thumbnailUrl/thumbnail,
// url/watchUrl/video_url/page_url, and embedUrl/embed_url.
async function fetchAdditionalFeeds() {
  const urls = (process.env.CATALOG_FEED_URLS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const all = await Promise.allSettled(urls.map(async (feedUrl, i) => {
    const url = safeHttpUrl(feedUrl);
    if (!url) throw new Error("Feed URL must use HTTP or HTTPS");
    const data = await fetchJson(url);
    const items = Array.isArray(data) ? data :
      (data.videos || data.items || data.results || []);
    if (!Array.isArray(items)) return [];
    let sourceName = `Feed ${i + 1}`;
    try { sourceName = new URL(url).hostname; } catch {}
    return items.map((item, index) => normalizeEntry(item, sourceName, index)).filter(Boolean);
  }));
  return all.filter(r => r.status === "fulfilled").flatMap(r => r.value);
}

async function refreshCatalog() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const results = await Promise.allSettled([fetchEporner(), fetchAdditionalFeeds()]);
    const fresh = results.filter(r => r.status === "fulfilled").flatMap(r => r.value);
    if (fresh.length > 0) {
      const seen = new Set();
      cachedVideos = fresh.filter(v => {
        const key = `${v.source}:${v.id}:${v.watchUrl}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, MAX_ITEMS);
      lastUpdated = new Date().toISOString();
      lastRefreshError = null;
    } else if (cachedVideos.length === 0) {
      lastRefreshError = "No configured source returned usable catalog entries.";
    }
  } catch (error) {
    lastRefreshError = error.message;
    console.error("Catalog refresh failed:", error.message);
  } finally {
    refreshInProgress = false;
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, cachedItems: cachedVideos.length, lastUpdated });
});

app.get("/api/videos", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");

  const cacheFresh = lastUpdated && Date.now() - new Date(lastUpdated).getTime() < CACHE_TTL_MS;
  if (cacheFresh && cachedVideos.length) {
    return res.json({ videos: cachedVideos, cached: true, lastUpdated });
  }

  // Never make the visitor wait for a provider if we already have cached data.
  if (cachedVideos.length) {
    res.json({ videos: cachedVideos, cached: true, stale: true, lastUpdated });
    refreshCatalog().catch(() => {});
    return;
  }

  // First request after process startup: wait for one bounded source refresh.
  await Promise.race([
    refreshCatalog(),
    new Promise(resolve => setTimeout(resolve, REQUEST_TIMEOUT_MS + 1000))
  ]);

  if (cachedVideos.length) {
    return res.json({ videos: cachedVideos, cached: false, lastUpdated });
  }

  return res.status(503).json({
    error: "Catalog is warming up. Please retry shortly.",
    retryAfterSeconds: 10,
    detail: process.env.NODE_ENV === "development" ? lastRefreshError : undefined
  });
});

app.get("/api/catalog-status", (_req, res) => {
  res.json({
    itemCount: cachedVideos.length,
    lastUpdated,
    refreshInProgress,
    hasConfiguredAdditionalFeeds: Boolean(process.env.CATALOG_FEED_URLS),
    lastRefreshError: process.env.NODE_ENV === "development" ? lastRefreshError : undefined
  });
});

// Refresh at startup and periodically; the previous successful cache stays available
// if a source fails. On Render free tier, in-memory cache resets after sleep/restart.
refreshCatalog().catch(() => {});
setInterval(() => refreshCatalog().catch(() => {}), CACHE_TTL_MS).unref();

app.listen(PORT, () => console.log(`Media Vault API listening on port ${PORT}`));
