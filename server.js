const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const TARGET_DESTINATION_URL = "https://t.me/your_telegram_channel";

// Default content array to serve immediately if external feed is delayed
const FALLBACK_VIDEOS = Array.from({ length: 12 }, (_, i) => ({
    id: `vid_${i + 1}`,
    title: `VIP Exclusive Collection #${i + 1}`,
    thumbnail: `https://picsum.photos/300/200?random=${i + 1}`,
    targetUrl: TARGET_DESTINATION_URL
}));

app.get('/api/videos', async (req, res) => {
    try {
        const response = await fetch('https://api.redtube.com/?data=redtube.Videos.searchVideos&output=json&thumbsize=medium', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (!response.ok) throw new Error("API response error");

        const data = await response.json();
        
        if (!data.videos || data.videos.length === 0) {
            return res.json(FALLBACK_VIDEOS);
        }

        const cleanList = data.videos.map(item => {
            const v = item.video;
            let thumbUrl = v.default_thumb;
            if (!thumbUrl && v.thumbs && v.thumbs.length > 0) {
                thumbUrl = v.thumbs[0].src;
            }

            return {
                id: v.video_id,
                title: v.title,
                thumbnail: thumbUrl || `https://picsum.photos/300/200?random=${v.video_id}`,
                targetUrl: TARGET_DESTINATION_URL
            };
        });

        res.json(cleanList);
    } catch (err) {
        console.error("Fetch fallback engaged:", err.message);
        res.json(FALLBACK_VIDEOS);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
