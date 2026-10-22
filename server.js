
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;
const CACHE_MS = 10 * 60 * 1000;

app.use(cors());
app.use(express.json());

let videos = [];
let lastUpdated = null;
let refreshing = false;

app.get("/", (req, res) =>
  res.json({ status: "Media Vault API is running" })
);

app.get("/health", (req, res) =>
  res.status(200).json({ status: "ok" })
);

app.get("/api/videos", async (req, res) => {
  res.set("Cache-Control", "no-store");

  // Never make visitors wait for a third-party feed.
  if (!lastUpdated || Date.now() - lastUpdated > CACHE_MS) {
    refreshCatalog().catch(console.error);
  }

  res.json({ videos, lastUpdated });
});

app.get("/api/catalog-status", (req, res) => {
  res.json({
    status: "running",
    videoCount: videos.length,
    lastUpdated,
    refreshing
  });
});

function normalize(item, source) {
  const thumbnail =
    item.thumbnail ||
    item.thumb ||
    item.default_thumb?.src ||
    item.thumbs?.[0]?.src ||
    item.image ||
    "";

  const watchUrl =
    item.watchUrl ||
    item.targetUrl ||
    item.url ||
    item.link ||
    "";

  if (!item.title || !thumbnail || !watchUrl) return null;

  // Only accept secure web links.
  for (const value of [thumbnail, watchUrl]) {
    try {
      if (new URL(value).protocol !== "https:") return null;
    } catch {
      return null;
    }
  }

  return {
    id: String(item.id || watchUrl),
    title: String(item.title),
    thumbnail,
    watchUrl,
    targetUrl: watchUrl,
    source
  };
}

async function fetchEporner() {
  const url = new URL(
    "https://www.eporner.com/api/v2/video/search/"
  );

  url.searchParams.set("query", process.env.EPORNER_QUERY || "trending");
  url.searchParams.set("per_page", "30");
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Video feed returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const items = Array.isArray(data.videos)
    ? data.videos
    : Array.isArray(data.videos?.video)
      ? data.videos.video
      : Array.isArray(data)
        ? data
        : [];

  return items
    .map(item => normalize(item, "Eporner"))
    .filter(Boolean);
}

async function fetchJsonFeed(feedUrl) {
  const response = await fetch(feedUrl, {
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Additional feed returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data.videos)
      ? data.videos
      : [];

  let source = "Additional source";
  try {
    source = new URL(feedUrl).hostname;
  } catch {}

  return items
    .map(item => normalize(item, source))
    .filter(Boolean);
}

async function refreshCatalog() {
  if (refreshing) return;
  refreshing = true;

  try {
    const feeds = (
      process.env.CATALOG_FEED_URLS || ""
    ).split(",").map(s => s.trim()).filter(Boolean);

    const results = await Promise.allSettled([
      fetchEporner(),
      ...feeds.map(fetchJsonFeed)
    ]);

    const collected = results
      .filter(result => result.status === "fulfilled")
      .flatMap(result => result.value);

    const unique = [
      ...new Map(collected.map(v => [v.watchUrl, v])).values()
    ].slice(0, 60);

    if (unique.length > 0) {
      videos = unique;
      lastUpdated = Date.now();
      console.log(`Catalog refreshed: ${videos.length} videos`);
    } else {
      console.log("No valid videos received; keeping existing cache.");
    }
  } catch (error) {
    console.error("Catalog refresh failed:", error.message);
  } finally {
    refreshing = false;
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Media Vault API listening on port ${PORT}`);
  refreshCatalog().catch(console.error);
  setInterval(() => {
    refreshCatalog().catch(console.error);
  }, CACHE_MS);
});
