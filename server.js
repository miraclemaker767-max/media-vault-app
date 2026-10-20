const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Set your destination link (Telegram channel, landing page, or CPA Smartlink)
const TARGET_DESTINATION_URL = "https://t.me/your_telegram_channel";

app.get('/api/videos', async (req, res) => {
    try {
        // Fetch real videos directly from Eporner API
        const response = await fetch('https://www.eporner.com/api/v2/video/search/?query=trending&per_page=18&format=json', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        if (!response.ok) {
            throw new Error(`API HTTP Error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.videos || data.videos.length === 0) {
            return res.status(404).json({ error: "No videos found" });
        }

        // Clean and format media data for frontend
        const cleanList = data.videos.map(v => ({
            id: v.id,
            title: v.title,
            thumbnail: v.default_thumb ? v.default_thumb.src : v.thumbs[0]?.src,
            targetUrl: TARGET_DESTINATION_URL
        }));

        res.json(cleanList);
    } catch (err) {
        console.error("Failed to load catalog feed:", err.message);
        res.status(500).json({ error: "Failed to load catalog feed from API" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
