// api/presence.js
// Vercel serverless route: proxies Lanyard REST API to avoid client-side blocking
export default async function handler(req, res) {
  try {
    const userId = "1319292111325106296"; // change this if you want a different Discord ID
    const r = await fetch(`https://api.lanyard.rest/v1/users/${userId}`, {
      headers: { "User-Agent": "Vercel-Proxy" }
    });

    if (!r.ok) {
      const text = await r.text().catch(()=>"");
      return res.status(502).json({ success: false, error: "Lanyard returned non-ok", details: text });
    }

    const data = await r.json();
    // don't cache (live)
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ success: false, error: "Proxy error", details: String(e) });
  }
}
