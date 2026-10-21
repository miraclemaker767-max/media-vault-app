
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

let videos = [];
let lastUpdated = null;

app.get("/", (req, res) => {
  res.json({ status: "Media Vault API is running" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/videos", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ videos, lastUpdated });
});

app.get("/api/catalog-status", (req, res) => {
  res.json({
    status: "running",
    videoCount: videos.length,
    lastUpdated
  });
});

// Keep the server responsive even when video sources are unavailable.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Media Vault API listening on port ${PORT}`);
});
