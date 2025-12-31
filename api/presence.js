// api/presence.js
// Vercel serverless function — proxies Lanyard REST.
// Keeps live data accessible to the client without CORS/fetch issues.

export default async function handler(req, res) {
  try {
    const userId = "1319292111325106296"; // tracked Discord ID
    const resp = await fetch(`https://api.lanyard.rest/v1/users/${userId}`, {
      headers: { "User-Agent": "vercel-proxy" },
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(()=>"");
      return res.status(502).json({ success: false, error: "Lanyard returned non-ok", details: txt });
    }

    const json = await resp.json();
    // no-store: always live
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ success: false, error: "proxy error", details: String(err) });
  }
}