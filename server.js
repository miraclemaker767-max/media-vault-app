const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const TARGET_DESTINATION_URL = "https://t.me/your_telegram_channel";

// Hardcoded fallback data in case external API fails or is slow
const FALLBACK_VIDEOS = [
    { id: "1", title: "VIP Exclusive Selection Vol. 1", thumbnail: "https://picsum.photos/300/200?random=1", targetUrl: TARGET_DESTINATION_URL },
    { id: "2", title: "Premium Vault Special Clip", thumbnail: "https://picsum.photos/300/200?random=2", targetUrl: TARGET_DESTINATION_URL },
    { id: "3", title: "Ultra HD Gold Collection", thumbnail: "https://picsum.photos/300/200?random=3", targetUrl: TARGET_DESTINATION_URL },
    { id: "4", title: "Top Rated Trending Media", thumbnail: "https://picsum.photos/300/200?random=4", targetUrl: TARGET_DESTINATION_URL },
    { id: "5", title: "VIP Secret Release #88", thumbnail: "https://picsum.photos/300/200?random=5", targetUrl: TARGET_DESTINATION_URL },
    { id: "6", title: "Exclusive Featured Pass", thumbnail: "https://picsum.photos/300/200?random=6", targetUrl: TARGET_DESTINATION_URL }
];

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
                thumbnail: thumbUrl || 'https://picsum.photos/300/200',
                targetUrl: TARGET_DESTINATION_URL
            };
        });

        res.json(cleanList);
    } catch (err) {
        console.error("Backend fetch failed, returning fallback:", err.message);
        res.json(FALLBACK_VIDEOS);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
