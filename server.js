
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
let lastError = null;

app.get("/", (_req, res) => {
  res.json({ status: "Media Vault API is running" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/videos", (_req, res) => {
  res.set("Cache-Control", "no-store");

  if (!lastUpdated || Date.now() - lastUpdated > CACHE_MS) {
    refreshCatalog().catch(console.error);
  }

  res.json({ videos, lastUpdated, refreshing });
});

app.get("/api/catalog-status", (_req, res) => {
  res.json({
    status: "running",
    videoCount: videos.length,
    videosWithThumbnail: videos.filter(v => Boolean(v.thumbnail)).length,
    videosWithWatchUrl: videos.filter(v => Boolean(v.watchUrl)).length,
    lastUpdated,
    refreshing,
    lastError
  });
});

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (value && typeof value === "object" &&
        typeof value.src === "string" && value.src.trim()) {
      return value.src.trim();
    }
  }
  return "";
}

function normalize(item, source) {
  if (!item || typeof item !== "object") return null;

  const title = firstString(item.title, item.name, item.label);
  const thumbs = item.thumbs;
  const firstThumb = Array.isArray(thumbs) ? thumbs[0] : null;

  const thumbnail = firstString(
    item.thumbnail,
    item.thumb,
    item.default_thumb,
    item.default_thumb?.src,
    firstThumb,
    firstThumb?.src,
    thumbs?.src,
    item.image,
    item.poster,
    item.preview,
    item.preview_url
  );

  const watchUrl = firstString(
    item.watchUrl,
    item.targetUrl,
    item.url,
    item.link,
    item.embedUrl,
    item.embed_url
  );

  try {
    if (!title || new URL(watchUrl).protocol !== "https:") return null;
  } catch {
    return null;
  }

  let validThumbnail = "";
  try {
    if (new URL(thumbnail).protocol === "https:") {
      validThumbnail = thumbnail;
    }
  } catch {}

  return {
    id: String(item.id || watchUrl),
    title,
    thumbnail: validThumbnail,
    watchUrl,
    targetUrl: watchUrl,
    source
  };
}

async function fetchEporner() {
  const url = new URL(
    "https://www.eporner.com/api/v2/video/search/"
  );

  url.searchParams.set(
    "query",
    process.env.EPORNER_QUERY || "trending"
  );
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
  lastError = null;

  try {
    const feeds = (process.env.CATALOG_FEED_URLS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    const results = await Promise.allSettled([
      fetchEporner(),
      ...feeds.map(fetchJsonFeed)
    ]);

    const collected = results
      .filter(result => result.status === "fulfilled")
      .flatMap(result => result.value);

    const failures = results
      .filter(result => result.status === "rejected")
      .map(result => result.reason?.message || "Feed failed");

    const unique = [
      ...new Map(collected.map(v => [v.watchUrl, v])).values()
    ].slice(0, 60);

    if (unique.length > 0) {
      videos = unique;
      lastUpdated = Date.now();

      console.log(
        `Catalog refreshed: ${videos.length} videos; ` +
        `${videos.filter(v => v.thumbnail).length} have thumbnails`
      );
    } else if (failures.length) {
      lastError = failures.join(" | ");
    } else {
      lastError = "No usable videos returned by configured feeds";
    }

    if (failures.length) {
      lastError = failures.join(" | ");
      console.warn("Some feeds failed:", lastError);
    }
  } catch (error) {
    lastError = error.message || "Catalog refresh failed";
    console.error(lastError);
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
