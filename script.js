// script.js — single-file Lanyard REST poller + UI updater
// Place this file in the same folder as your index.html & style.css
// Uses USER_ID below (you provided it). Polls Lanyard (no websocket).

const USER_ID = "1319292111325106296";
const LANYARD_URL = `https://api.lanyard.rest/v1/users/${USER_ID}`;
const POLL_MS = 4000;
const FETCH_TIMEOUT = 8000;

let lastStatus = null;
let lastOnlineTimestamp = null;
let lastSeenInterval = null;
let lastSeenHideTimer = null;
let spotifyTicker = null;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  pollOnce();
  setInterval(pollOnce, POLL_MS);
});

/* ------- Fetch with timeout ------- */
async function fetchWithTimeout(url, ms = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

/* ------- Main poll ------- */
async function pollOnce() {
  const json = await fetchWithTimeout(LANYARD_URL).catch(() => null);
  if (!json || !json.success || !json.data) {
    fallbackOffline();
    return;
  }

  const d = json.data;
  const user = d.discord_user || {};

  // Username & avatar
  setText("username", user.global_name || user.username || "Unknown");
  setImg("avatar", buildAvatar(user));

  // Contact button -> user profile
  if ($("contactBtn") && user.id) $("contactBtn").href = `https://discord.com/users/${user.id}`;

  // Banner
  const banner = buildBanner(user);
  if (banner) { show("bannerWrap"); setImg("bannerImg", banner); } else hide("bannerWrap");

  // Badges
  renderBadges(user);

  // Status label
  const raw = (d.discord_status || "offline").toLowerCase();
  const status = raw === "invisible" ? "offline" : raw;
  if (status !== "offline") lastOnlineTimestamp = Date.now();

  const labelMap = { online: "Online", idle: "Away", dnd: "Do not disturb", offline: "Offline" };
  await setTextFade("statusText", (labelMap[status] ?? status));

  // last seen / transitions
  handleLastSeenTransition(status);

  // Spotify (Lanyard provides d.spotify or as activity)
  const spotify = d.spotify || (Array.isArray(d.activities) ? d.activities.find(a => a.name === "Spotify") : null);
  await renderSpotify(spotify);

  // status dot
  setStatusDot(status);

  lastStatus = status;
}

/* ------- UI helpers ------- */
function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function setImg(id, src) { const el = $(id); if (el && src) el.src = src; }
function show(id) { const el = $(id); if (el) el.classList.remove("hidden"); }
function hide(id) { const el = $(id); if (el) el.classList.add("hidden"); }

function setTextFade(id, text) {
  const el = $(id);
  if (!el) return Promise.resolve();
  el._token = (el._token || 0) + 1;
  const token = el._token;
  if (el.textContent === text) { el.classList.remove("fade-out"); return Promise.resolve(); }
  return new Promise(resolve => {
    el.classList.add("fade-out");
    setTimeout(() => {
      if (el._token !== token) return resolve();
      el.textContent = text;
      el.classList.remove("fade-out");
      setTimeout(() => resolve(), 360);
    }, 220);
  });
}

/* ------- Last-seen logic ------- */
function handleLastSeenTransition(status) {
  const lastEl = $("lastSeen");
  // clear previous timers
  if (lastSeenInterval) { clearInterval(lastSeenInterval); lastSeenInterval = null; }
  if (lastSeenHideTimer) { clearTimeout(lastSeenHideTimer); lastSeenHideTimer = null; }

  const hideAfter = (ms = 1500) => {
    lastSeenHideTimer = setTimeout(() => {
      if (!lastEl) return;
      lastEl.classList.add("fade-out");
      setTimeout(() => lastEl.classList.add("hidden"), 360);
      lastSeenHideTimer = null;
    }, ms);
  };

  // Only trigger transitions on real status change to avoid reappearing
  if (status !== lastStatus) {
    if (status === "online") {
      if (lastEl) { lastEl.classList.remove("hidden"); lastEl.classList.remove("fade-out"); }
      setText("lastSeen", "Active now");
      hideAfter(1500);
    } else if (status === "idle") {
      if (lastEl) { lastEl.classList.remove("hidden"); lastEl.classList.remove("fade-out"); }
      setText("lastSeen", "Away now");
      hideAfter(1500);
    } else if (status === "dnd") {
      if (lastEl) { lastEl.classList.remove("hidden"); lastEl.classList.remove("fade-out"); }
      setText("lastSeen", "Do not disturb");
      hideAfter(1500);
    } else { // offline
      if (lastEl) { lastEl.classList.remove("hidden"); lastEl.classList.remove("fade-out"); }
      if (!lastOnlineTimestamp) setText("lastSeen", "Last seen unknown");
      else {
        setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
        lastSeenInterval = setInterval(() => {
          setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
        }, 1000);
      }
    }
  } else {
    // status unchanged
    if (status === "offline") {
      if (!lastSeenInterval) {
        if (!lastEl) return;
        if (!lastOnlineTimestamp) setText("lastSeen", "Last seen unknown");
        else {
          setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
          lastSeenInterval = setInterval(() => {
            setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
          }, 1000);
        }
      }
    } else {
      // still online/idle/dnd -> make sure lastSeen is hidden
      if (lastEl && !lastEl.classList.contains("hidden")) {
        lastEl.classList.add("fade-out");
        setTimeout(() => lastEl.classList.add("hidden"), 360);
      }
    }
  }
}

/* ------- Avatar/Banner/Badges ------- */
function buildAvatar(user) {
  if (!user) return "";
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.id || 0) % 5}.png`;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=512`;
}
function buildBanner(user) {
  if (!user) return "";
  if (!user.banner) return "";
  const ext = user.banner.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
}
function renderBadges(user) {
  const container = $("badges");
  if (!container) return;
  container.innerHTML = "";
  const flags = Number(user?.public_flags ?? user?.flags ?? 0);
  const defs = [
    { bit: 1, svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>` },
    { bit: 2, svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>` },
    { bit: 4, svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>` }
  ];
  const found = defs.filter(d => (flags & d.bit) === d.bit);
  if (!found.length) { container.style.display = "none"; return; }
  container.style.display = "flex";
  found.forEach((b, i) => {
    const s = document.createElement("span");
    s.className = "badge-icon";
    s.innerHTML = b.svg;
    container.appendChild(s);
    setTimeout(() => s.classList.add("show"), i * 80);
  });
}

/* ------- Status dot ------- */
function setStatusDot(status) {
  const dot = $("statusDot");
  if (!dot) return;
  dot.className = "status-dot status-" + (status || "offline");
}

/* ------- Spotify rendering ------- */
let spotifyInterval = null;
async function renderSpotify(spotify) {
  if (spotifyInterval) { clearInterval(spotifyInterval); spotifyInterval = null; }

  const spBox = $("spotify");
  const albumEl = $("albumArt");
  const songEl = $("song");
  const artistEl = $("artist");
  const progressFill = $("progressFill");
  const timeCur = $("timeCurrent");
  const timeTot = $("timeTotal");

  if (!spotify) {
    if (spBox) spBox.classList.add("hidden");
    if (progressFill) { progressFill.style.width = "0%"; progressFill.style.background = ""; }
    if (timeCur) timeCur.textContent = "0:00";
    if (timeTot) timeTot.textContent = "0:00";
    return;
  }

  const song = spotify.song ?? spotify.details ?? "";
  const artist = spotify.artist ?? spotify.state ?? "";
  const start = spotify.timestamps?.start;
  const end = spotify.timestamps?.end;
  const albumArtUrl = spotify.album_art_url ?? (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:", "")}` : "") || "";

  if (spBox) spBox.classList.remove("hidden");
  if (songEl) songEl.textContent = song || "";
  if (artistEl) artistEl.textContent = artist || "";

  if (albumEl && albumArtUrl) albumEl.src = `${albumArtUrl}${albumArtUrl.includes("?") ? "&" : "?"}_=${Date.now()}`;
  else if (albumEl) albumEl.src = "";

  (async () => {
    if (!progressFill) return;
    const col = await sampleColor(albumArtUrl);
    if (col) progressFill.style.background = `linear-gradient(90deg, ${col}, rgba(255,255,255,0.18))`;
    else progressFill.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
  })();

  if (start && end && end > start && progressFill) {
    const total = end - start;
    const MIN = 8; // minimum visible percent
    const tick = () => {
      const now = Date.now();
      let elapsed = now - start;
      if (elapsed < 0) elapsed = 0;
      // keep showing full loop if song repeats: show elapsed % total
      let use = total > 0 ? (elapsed % total) : elapsed;
      const pct = (use / total) * 100;
      const visible = Math.max(pct, MIN);
      progressFill.style.width = `${visible}%`;
      if (timeCur) timeCur.textContent = msToMMSS(use);
      if (timeTot) timeTot.textContent = msToMMSS(total);
    };
    tick();
    spotifyInterval = setInterval(tick, 1000);
  } else {
    if (progressFill) progressFill.style.width = "20%";
    if (timeCur) timeCur.textContent = "0:00";
    if (timeTot) timeTot.textContent = "—";
  }
}

/* ------- Color sampling (may fail due to CORS) ------- */
async function sampleColor(url) {
  if (!url) return null;
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = () => {
        try {
          const W = 48, H = 48;
          const canvas = document.createElement("canvas");
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, W, H);
          const data = ctx.getImageData(0, 0, W, H).data;
          let r = 0, g = 0, b = 0, c = 0;
          for (let y = 8; y < 40; y++) {
            for (let x = 8; x < 40; x++) {
              const i = (y * W + x) * 4;
              if (data[i + 3] === 0) continue;
              r += data[i]; g += data[i + 1]; b += data[i + 2]; c++;
            }
          }
          if (!c) return resolve(null);
          resolve(`rgb(${Math.round(r / c)}, ${Math.round(g / c)}, ${Math.round(b / c)})`);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

/* ------- Fallback when API fails ------- */
function fallbackOffline() {
  setText("username", "Loading...");
  setText("statusText", "—");
  hide("spotify");
  setStatusDot("offline");
}

/* ------- util: ms to mm:ss and human ------- */
function msToMMSS(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function msToHumanShort(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}