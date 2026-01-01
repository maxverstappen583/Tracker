// api/presence.js
// Vercel serverless route — proxies Lanyard REST to avoid client-side blocking/CORS.
export default async function handler(req, res) {
  try {
    const userId = "1319292111325106296"; // tracked Discord ID
    const r = await fetch(`https://api.lanyard.rest/v1/users/${userId}`, {
      headers: { "User-Agent": "vercel-proxy" },
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(502).json({ success: false, error: "Lanyard returned non-ok", details: txt });
    }

    const json = await r.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ success: false, error: "proxy error", details: String(err) });
  }
}
