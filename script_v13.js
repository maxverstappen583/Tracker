/* script_v13.js — Polling (REST) Lanyard client with transition-based last-seen
   - Shows Active/Away/DND once on transition and hides while status unchanged
   - Shows "Last seen X ago" while offline (updated every second)
   - Safer fetch with timeout so the page won't hang on loading
   - Improved Spotify update handling (REST-limited)
*/

const USER_ID = "1319292111325106296";
const POLL_MS = 4000;
const FETCH_TIMEOUT_MS = 8000;

let offlineInterval = null;
let lastOnlineTimestamp = null;
let lastSeenHideTimer = null;
let lastStatus = null;
let spotifyTicker = null;
let previousSpotifyId = null;

document.addEventListener("DOMContentLoaded", () => {
  // initial safe state so page doesn't appear stuck
  document.body.classList.remove('loading');
  run();
  setInterval(run, POLL_MS);
});

async function run() {
  try {
    const j = await fetchWithTimeout(`https://api.lanyard.rest/v1/users/${USER_ID}`, FETCH_TIMEOUT_MS);
    if (!j || !j.success || !j.data) {
      // ensure UI doesn't stay stuck
      document.body.classList.remove('loading');
      return;
    }
    const data = j.data;

    // --- user / avatar / banner ---
    const user = data.discord_user || {};
    setText("username", user.global_name || user.username || "Unknown");
    setImg("avatar", buildAvatar(user));
    setImg("heroAvatar", buildAvatar(user));

    const bannerUrl = buildBanner(user);
    const bannerWrap = document.getElementById("bannerWrap");
    const bannerImg = document.getElementById("bannerImg");
    if (bannerWrap && bannerImg) {
      if (bannerUrl) { bannerWrap.classList.remove("hidden"); bannerImg.src = bannerUrl; }
      else { bannerWrap.classList.add("hidden"); bannerImg.src = ""; }
    }

    renderBadges(user);

    // --- status / last-seen logic ---
    const rawStatus = (data.discord_status || "offline").toLowerCase();
    const status = rawStatus === "invisible" ? "offline" : rawStatus;

    // update lastOnlineTimestamp when we see them active (not offline)
    if (status !== "offline") lastOnlineTimestamp = Date.now();

    const statusMap = { online: "Online", idle: "Away", dnd: "Do not disturb", offline: "Offline" };
    const label = statusMap[status] ?? status;

    // update top-line status
    await setTextFade("statusText", label);

    const lastSeenEl = document.getElementById("lastSeen");

    // offline interval helpers
    function startOfflineIntervalImmediate() {
      stopOfflineInterval();
      if (lastOnlineTimestamp) {
        setTextNoFade("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
      } else {
        setTextNoFade("lastSeen", "Last seen unknown");
      }
      offlineInterval = setInterval(() => {
        if (!lastOnlineTimestamp) return;
        setTextNoFade("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
      }, 1000);
    }
    function stopOfflineInterval() {
      if (offlineInterval) { clearInterval(offlineInterval); offlineInterval = null; }
    }
    function hideLastSeenInstant() {
      if (!lastSeenEl) return;
      lastSeenEl.classList.add("fade-out");
      setTimeout(() => { if (!lastSeenEl) return; lastSeenEl.classList.add("hidden"); }, 380);
    }

    // ---------- transition-based behavior ----------
    if (status === "online" && lastStatus !== "online") {
      stopOfflineInterval();
      if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
      await setTextFade("lastSeen", "Active now");
      if (lastSeenHideTimer) { clearTimeout(lastSeenHideTimer); lastSeenHideTimer = null; }
      lastSeenHideTimer = setTimeout(() => { hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

    } else if (status === "online" && lastStatus === "online") {
      stopOfflineInterval();
      if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

    } else if (status === "idle" && lastStatus !== "idle") {
      stopOfflineInterval();
      if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
      await setTextFade("lastSeen", "Away now");
      if (lastSeenHideTimer) { clearTimeout(lastSeenHideTimer); lastSeenHideTimer = null; }
      lastSeenHideTimer = setTimeout(() => { hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

    } else if (status === "idle" && lastStatus === "idle") {
      stopOfflineInterval();
      if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

    } else if (status === "dnd" && lastStatus !== "dnd") {
      stopOfflineInterval();
      if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
      await setTextFade("lastSeen", "Do not disturb");
      if (lastSeenHideTimer) { clearTimeout(lastSeenHideTimer); lastSeenHideTimer = null; }
      lastSeenHideTimer = setTimeout(() => { hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

    } else if (status === "dnd" && lastStatus === "dnd") {
      stopOfflineInterval();
      if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

    } else if (status === "offline" && lastStatus !== "offline") {
      if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
      startOfflineIntervalImmediate();

    } else {
      // keep consistent intervals
      if (status === "offline") {
        if (!offlineInterval) startOfflineIntervalImmediate();
      } else {
        stopOfflineInterval();
      }
    }

    // update status dot
    setStatusDot(status);

    // contact link
    const contactBtn = document.getElementById("contactBtn");
    if (contactBtn) contactBtn.href = `https://discord.com/users/${USER_ID}`;

    // --- spotify (best-effort) ---
    const spotify = data.spotify || (Array.isArray(data.activities) ? data.activities.find(a => a.name === "Spotify") : null);
    await renderSpotifyImproved(spotify);

    // store lastStatus
    lastStatus = status;

    // remove loading class (defensive)
    document.body.classList.remove('loading');

  } catch (err) {
    console.error("Lanyard polling error:", err);
    // ensure we don't stay stuck on loading if fetch fails
    document.body.classList.remove('loading');
    // clear spotify ticker on errors to avoid ghost timers
    if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
  }
}

/* ---------- fetch with timeout ---------- */
function fetchWithTimeout(url, ms = 8000) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("fetch timeout"));
    }, ms);

    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        clearTimeout(timer);
        resolve(json);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/* ---------- Fade & DOM helpers ---------- */
function setTextNoFade(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
}
function setTextFade(id, text) {
  const el = document.getElementById(id);
  if (!el) return Promise.resolve();
  el._fadeToken = (el._fadeToken || 0) + 1;
  const token = el._fadeToken;

  if (el.textContent === text) {
    el.classList.remove("fade-out");
    return Promise.resolve();
  }

  return new Promise(resolve => {
    el.classList.add("fade-out");
    setTimeout(() => {
      if (el._fadeToken !== token) return resolve();
      el.textContent = text;
      el.classList.remove("fade-out");
      setTimeout(() => {
        if (el._fadeToken !== token) return resolve();
        resolve();
      }, 380);
    }, 220);
  });
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setImg(id, src) { const el = document.getElementById(id); if (el && src) el.src = src; }

/* ---------- avatar/banner/badges ---------- */
function buildAvatar(user) {
  if (!user) return "";
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.id || USER_ID) % 5}.png`;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=512`;
}
function buildBanner(user) {
  if (!user) return "";
  if (!user.banner) return "";
  const ext = user.banner.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
}
function msToHumanShort(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/* ---------- status dot ---------- */
function setStatusDot(status) {
  const dot = document.getElementById("statusDot");
  if (!dot) return;
  const allowed = ["online","idle","dnd","offline"];
  const cls = allowed.includes(status) ? status : "offline";
  dot.className = `status-dot status-${cls}`;
}

/* ---------- simple badges ---------- */
function badgeDefs() {
  return [
    {bit:1, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
    {bit:2, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
    {bit:4, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`}
  ];
}
function renderBadges(user) {
  const container = document.getElementById("badges");
  if (!container) return;
  container.innerHTML = "";
  const flags = (user && (user.public_flags ?? user.flags)) ?? 0;
  const defs = badgeDefs();
  const found = defs.filter(d => (Number(flags) & d.bit) === d.bit);
  if (!found.length) { container.style.display = "none"; return; }
  container.style.display = "flex";
  found.forEach((b, i) => {
    const s = document.createElement("span");
    s.className = "badge-icon";
    s.innerHTML = b.svg;
    container.appendChild(s);
    setTimeout(() => s.classList.add("show"), i * 90);
  });
}

/* ---------- Improved Spotify rendering (best-effort with REST) ---------- */
async function renderSpotifyImproved(spotify) {
  const spBox = document.getElementById("spotify");
  const albumArt = document.getElementById("albumArt");
  const songEl = document.getElementById("song");
  const artistEl = document.getElementById("artist");
  const progressFill = document.getElementById("progressFill");
  const timeCur = document.getElementById("timeCurrent");
  const timeTot = document.getElementById("timeTotal");

  // clear previous ticker always
  if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }

  if (!spotify) {
    previousSpotifyId = null;
    if (spBox) spBox.classList.add("hidden");
    if (progressFill) { progressFill.style.width = "0%"; progressFill.style.background = ""; }
    if (timeCur) timeCur.textContent = "0:00";
    if (timeTot) timeTot.textContent = "0:00";
    return;
  }

  const trackId =
    spotify.track_id
    ?? spotify.sync_id
    ?? spotify.party?.id
    ?? spotify.id
    ?? (spotify.assets?.large_image || null)
    ?? `${spotify.details || ""}::${spotify.state || ""}`;

  const isSameTrack = (trackId && previousSpotifyId === trackId);
  previousSpotifyId = trackId;

  const isTop = !!(spotify.track_id || spotify.album);
  const art = isTop ? spotify.album_art_url : (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:","")}` : null);
  const song = isTop ? spotify.song || spotify.details : spotify.details;
  const artist = isTop ? spotify.artist || spotify.state : spotify.state;

  if (spBox) spBox.classList.remove("hidden");
  if (songEl) songEl.textContent = song || "";
  if (artistEl) artistEl.textContent = artist || "";

  if (albumArt && art) {
    albumArt.crossOrigin = "Anonymous";
    albumArt.src = `${art}${art.includes('?') ? '&' : '?'}_=${Date.now()}`;
  } else if (albumArt) {
    albumArt.src = "";
  }

  // set progress color
  (async () => {
    if (!progressFill) return;
    const color = await sampleColor(art);
    if (color) progressFill.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.18))`;
    else progressFill.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
  })();

  const start = spotify.timestamps?.start ?? null;
  const end = spotify.timestamps?.end ?? null;

  if (start && end && end > start && progressFill) {
    const total = end - start;
    const MIN = 8;
    const tick = () => {
      const now = Date.now();
      let raw = now - start;
      if (raw < 0) raw = 0;
      let elapsed = (total > 0) ? (raw % total) : raw;
      if (elapsed < 0) elapsed = 0;
      const pct = (elapsed / total) * 100;
      const visible = Math.max(pct, MIN);
      progressFill.style.width = `${visible}%`;
      if (timeCur) timeCur.textContent = msToMMSS(elapsed);
      if (timeTot) timeTot.textContent = msToMMSS(total);
    };
    tick();
    spotifyTicker = setInterval(tick, 1000);
  } else {
    if (progressFill) progressFill.style.width = "20%";
    if (timeCur) timeCur.textContent = "0:00";
    if (timeTot) timeTot.textContent = "—";
  }
}

/* sample color from album art center */
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
          const data = ctx.getImageData(0,0,W,H).data;
          let r=0,g=0,b=0,c=0;
          for (let y=8;y<40;y++){
            for (let x=8;x<40;x++){
              const i = (y*W + x) * 4;
              const a = data[i+3];
              if (a === 0) continue;
              r += data[i]; g += data[i+1]; b += data[i+2]; c++;
            }
          }
          if (!c) return resolve(null);
          resolve(`rgb(${Math.round(r/c)}, ${Math.round(g/c)}, ${Math.round(b/c)})`);
        } catch(e){ resolve(null); }
      };
      img.onerror = () => resolve(null);
    } catch(e) { resolve(null); }
  });
}

function msToMMSS(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}