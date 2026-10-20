const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Set your destination Telegram Channel or CPA Smartlink
const TARGET_DESTINATION_URL = "https://t.me/your_telegram_channel";

// API Endpoint fetching public catalog items automatically
app.get('/api/videos', async (req, res) => {
    try {
        const response = await fetch('https://api.redtube.com/?data=redtube.Videos.searchVideos&output=json&thumbsize=big');
        const data = await response.json();
        
        const cleanList = data.videos.map(item => ({
            id: item.video.video_id,
            title: item.video.title,
            thumbnail: item.video.default_thumb,
            targetUrl: TARGET_DESTINATION_URL
        }));

        res.json(cleanList);
    } catch (err) {
        res.status(500).json({ error: "Failed to load catalog feed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
