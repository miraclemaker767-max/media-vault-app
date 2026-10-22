const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Helper to find the first valid non-empty string
function firstString(...args) {
  for (const arg of args) {
    if (typeof arg === "string" && arg.trim() !== "") {
      return arg.trim();
    }
  }
  return "";
}

// Normalize Eporner / Web Catalog items & Thumbnails
function normalize(item, source) {
  if (!item || typeof item !== "object") return null;

  const title = firstString(item.title, item.name, item.label);
  
  const thumbs = item.thumbs || item.thumbnail_urls;
  const firstThumb = Array.isArray(thumbs) ? thumbs[0] : (thumbs && typeof thumbs === 'object' ? Object.values(thumbs)[0] : null);

  const thumbnail = firstString(
    item.thumbnail,
    item.thumb,
    item.default_thumb,
    item.default_thumb?.src,
    typeof firstThumb === 'string' ? firstThumb : (firstThumb?.src || firstThumb?.url),
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
    if (!title || !watchUrl || new URL(watchUrl).protocol !== "https:") return null;
  } catch {
    return null;
  }

  let validThumbnail = "";
  try {
    if (thumbnail && new URL(thumbnail).protocol === "https:") {
      validThumbnail = thumbnail;
    }
  } catch {}

  return {
    id: String(item.id || watchUrl),
    title,
    thumbnail: validThumbnail,
    watchUrl,
    targetUrl: watchUrl,
    isManual: false,
    source
  };
}

// --- TELEGRAM VIDEOS ENDPOINT (Strict file-existence check to remove deleted posts) ---
app.get("/api/telegram-videos", async (_req, res) => {
  try {
    if (!BOT_TOKEN || !CHANNEL_ID) {
      return res.json({ videos: [] });
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?allowed_updates=["channel_post","message"]`);
    const data = await response.json();

    if (!data.ok || !Array.isArray(data.result)) {
      return res.json({ videos: [] });
    }

    const tgVideos = [];
    const processedFileIds = new Set();

    for (let i = data.result.length - 1; i >= 0; i--) {
      const update = data.result[i];
      const message = update.channel_post || update.message;

      if (message && message.video && String(message.chat.id) === String(CHANNEL_ID)) {
        const fileId = message.video.file_id;

        if (processedFileIds.has(fileId)) continue;
        processedFileIds.add(fileId);

        try {
          const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
          const fileData = await fileRes.json();

          if (!fileData.ok || !fileData.result || !fileData.result.file_path) {
            continue;
          }

          const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
          const caption = message.caption || "Private VIP Video";
          let thumbnailUrl = "";

          if (message.video.thumbnail || message.video.thumb) {
            const thumbObj = message.video.thumbnail || message.video.thumb;
            const thumbRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${thumbObj.file_id}`);
            const thumbData = await thumbRes.json();
            if (thumbData.ok && thumbData.result.file_path) {
              thumbnailUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${thumbData.result.file_path}`;
            }
          }

          tgVideos.push({
            id: fileId,
            title: caption,
            thumbnail: thumbnailUrl,
            watchUrl: directUrl,
            targetUrl: directUrl,
            isManual: true,
            source: "Telegram Private Vault"
          });
        } catch (err) {
          continue;
        }
      }
    }

    res.json({ videos: tgVideos });
  } catch (err) {
    console.error("Telegram fetch error:", err);
    res.status(500).json({ error: "Server error fetching Telegram videos" });
  }
});

// --- STANDARD EPORNER / WEB VIDEOS ENDPOINT ---
app.get("/api/videos", async (_req, res) => {
  try {
    const response = await fetch("https://www.eporner.com/api/v2/video/search/?query=hd&per_page=30&format=json");
    const data = await response.json();
    
    const items = Array.isArray(data.videos) ? data.videos : [];
    const normalizedVideos = items.map(item => normalize(item, "Eporner")).filter(Boolean);

    res.json({ videos: normalizedVideos });
  } catch (err) {
    console.error("Web catalog fetch error:", err);
    res.status(500).json({ error: "Failed to fetch catalog" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
