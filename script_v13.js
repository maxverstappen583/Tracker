/* script_ws.js — Lanyard WebSocket client (instant presence + Spotify)
   - Subscribe to a user via wss://api.lanyard.rest/socket (op 2)
   - Transition-based "Active/Away/DND" shown once then fade+hide while status unchanged
   - Offline: "Last seen X ago" updates every second
   - Spotify: instant updates, progress bar, album-art color sampling
   - Reconnect backoff on close/error
*/

const USER_ID = "1319292111325106296";
const SOCKET_URL = "wss://api.lanyard.rest/socket";

let ws = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let lastStatus = null;
let lastOnlineTimestamp = null;
let lastSeenInterval = null;
let lastSeenHideTimer = null;
let spotifyTicker = null;
let previousSpotifyId = null;

// DOM refs
const statusTextEl = document.getElementById("statusText");
const lastSeenEl = document.getElementById("lastSeen");
const avatarEl = document.getElementById("avatar");
const heroAvatarEl = document.getElementById("heroAvatar");
const usernameEl = document.getElementById("username");
const statusDotEl = document.getElementById("statusDot");
const contactBtn = document.getElementById("contactBtn");
const badgesContainer = document.getElementById("badges");
const bannerWrap = document.getElementById("bannerWrap");
const bannerImg = document.getElementById("bannerImg");

// spotify refs
const spotifyBox = document.getElementById("spotify");
const songEl = document.getElementById("song");
const artistEl = document.getElementById("artist");
const albumArtEl = document.getElementById("albumArt");
const progressFillEl = document.getElementById("progressFill");
const timeCurrentEl = document.getElementById("timeCurrent");
const timeTotalEl = document.getElementById("timeTotal");

/* utility: fade text with token to avoid race */
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
  return new Promise(res => {
    el.classList.add("fade-out");
    setTimeout(() => {
      if (el._fadeToken !== token) return res();
      el.textContent = text;
      el.classList.remove("fade-out");
      setTimeout(() => {
        if (el._fadeToken !== token) return res();
        res();
      }, 380);
    }, 220);
  });
}

/* short humanizer for last seen */
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

/* status dot */
function setStatusDot(status) {
  if (!statusDotEl) return;
  const allowed = ["online","idle","dnd","offline"];
  const cls = allowed.includes(status) ? status : "offline";
  statusDotEl.className = `status-dot status-${cls}`;
}

/* badge rendering (basic placeholders) */
function badgeDefs() {
  return [
    {bit:1, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
    {bit:2, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
    {bit:4, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`}
  ];
}
function renderBadges(user) {
  if (!badgesContainer) return;
  badgesContainer.innerHTML = "";
  const flags = (user && (user.public_flags ?? user.flags)) ?? 0;
  const defs = badgeDefs();
  const found = defs.filter(d => (Number(flags) & d.bit) === d.bit);
  if (!found.length) { badgesContainer.style.display = "none"; return; }
  badgesContainer.style.display = "flex";
  found.forEach((b, i) => {
    const s = document.createElement("span");
    s.className = "badge-icon";
    s.innerHTML = b.svg;
    badgesContainer.appendChild(s);
    setTimeout(() => s.classList.add("show"), i * 90);
  });
}

/* avatar / banner helpers */
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

/* last-seen interval management */
function startLastSeenInterval() {
  stopLastSeenInterval();
  if (!lastOnlineTimestamp) {
    setTextNoFade("lastSeen", "Last seen unknown");
  } else {
    setTextNoFade("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
  }
  lastSeenInterval = setInterval(() => {
    if (!lastOnlineTimestamp) return;
    setTextNoFade("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
  }, 1000);
}
function stopLastSeenInterval() {
  if (lastSeenInterval) { clearInterval(lastSeenInterval); lastSeenInterval = null; }
}
function hideLastSeenInstant() {
  if (!lastSeenEl) return;
  lastSeenEl.classList.add("fade-out");
  setTimeout(() => { if (!lastSeenEl) return; lastSeenEl.classList.add("hidden"); }, 380);
}

/* spotify rendering & progress */
async function renderSpotify(spotify) {
  // clear previous ticker
  if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }

  if (!spotify) {
    previousSpotifyId = null;
    if (spotifyBox) spotifyBox.classList.add("hidden");
    if (progressFillEl) { progressFillEl.style.width = "0%"; progressFillEl.style.background = ""; }
    if (timeCurrentEl) timeCurrentEl.textContent = "0:00";
    if (timeTotalEl) timeTotalEl.textContent = "0:00";
    return;
  }

  // robust track id
  const trackId = spotify.track_id ?? spotify.sync_id ?? spotify.party?.id ?? spotify.id ?? (spotify.assets?.large_image || null) ?? `${spotify.details || ""}::${spotify.state || ""}`;
  const isNewTrack = trackId && trackId !== previousSpotifyId;
  previousSpotifyId = trackId;

  const isTop = !!(spotify.track_id || spotify.album);
  const art = isTop ? (spotify.album_art_url || null) : (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:","")}` : null);
  const song = isTop ? (spotify.song || spotify.details || "") : (spotify.details || "");
  const artist = isTop ? (spotify.artist || spotify.state || "") : (spotify.state || "");

  if (spotifyBox) spotifyBox.classList.remove("hidden");
  if (songEl) songEl.textContent = song || "";
  if (artistEl) artistEl.textContent = artist || "";

  if (albumArtEl) {
    if (art) {
      albumArtEl.crossOrigin = "Anonymous";
      albumArtEl.src = `${art}${art.includes('?') ? '&' : '?'}_=${Date.now()}`;
    } else {
      albumArtEl.src = "";
    }
  }

  (async () => {
    if (!progressFillEl) return;
    const color = await sampleColor(art);
    if (color) progressFillEl.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.18))`;
    else progressFillEl.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
  })();

  const start = spotify.timestamps?.start ?? null;
  const end = spotify.timestamps?.end ?? null;

  if (start && end && end > start && progressFillEl) {
    const total = end - start;
    const MIN = 8;
    const tick = () => {
      const now = Date.now();
      let raw = now - start;
      if (raw < 0) raw = 0;
      let elapsed = (total > 0) ? (raw % total) : raw;
      const pct = (elapsed / total) * 100;
      const visible = Math.max(pct, MIN);
      progressFillEl.style.width = `${visible}%`;
      if (timeCurrentEl) timeCurrentEl.textContent = msToMMSS(elapsed);
      if (timeTotalEl) timeTotalEl.textContent = msToMMSS(total);
    };
    tick();
    spotifyTicker = setInterval(tick, 1000);
  } else {
    if (progressFillEl) progressFillEl.style.width = "20%";
    if (timeCurrentEl) timeCurrentEl.textContent = "0:00";
    if (timeTotalEl) timeTotalEl.textContent = "—";
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

/* handle presence update (from Lanyard payload d) */
async function handlePresenceUpdate(data) {
  // discord_user updates
  if (data.discord_user) {
    const user = data.discord_user;
    setTextNoFade("username", user.global_name || user.username || "Unknown");
    const avatarUrl = buildAvatar(user);
    if (avatarEl) avatarEl.src = avatarUrl;
    if (heroAvatarEl) heroAvatarEl.src = avatarUrl;
    const bannerUrl = buildBanner(user);
    if (bannerWrap && bannerImg) {
      if (bannerUrl) { bannerWrap.classList.remove("hidden"); bannerImg.src = bannerUrl; }
      else { bannerWrap.classList.add("hidden"); bannerImg.src = ""; }
    }
    renderBadges(user);
  }

  const rawStatus = (data.discord_status || "offline").toLowerCase();
  const status = rawStatus === "invisible" ? "offline" : rawStatus;

  // capture last online when not offline
  if (status !== "offline") lastOnlineTimestamp = Date.now();

  const humanMap = { online: "Online", idle: "Away", dnd: "Do not disturb", offline: "Offline" };
  const statusLabel = humanMap[status] ?? status;

  await setTextFade("statusText", statusLabel);

  // transition handling: show once when transitioning into online/idle/dnd then hide and keep hidden
  if (status === "online" && lastStatus !== "online") {
    stopLastSeenInterval();
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    await setTextFade("lastSeen", "Active now");
    if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer);
    lastSeenHideTimer = setTimeout(() => { hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

  } else if (status === "online" && lastStatus === "online") {
    stopLastSeenInterval();
    if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

  } else if (status === "idle" && lastStatus !== "idle") {
    stopLastSeenInterval();
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    await setTextFade("lastSeen", "Away now");
    if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer);
    lastSeenHideTimer = setTimeout(() => { hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

  } else if (status === "idle" && lastStatus === "idle") {
    stopLastSeenInterval();
    if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

  } else if (status === "dnd" && lastStatus !== "dnd") {
    stopLastSeenInterval();
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    await setTextFade("lastSeen", "Do not disturb");
    if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer);
    lastSeenHideTimer = setTimeout(() => { hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

  } else if (status === "dnd" && lastStatus === "dnd") {
    stopLastSeenInterval();
    if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

  } else if (status === "offline" && lastStatus !== "offline") {
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    // show last seen and update every second
    if (!lastOnlineTimestamp) setTextNoFade("lastSeen", "Last seen unknown");
    else setTextNoFade("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
    startLastSeenInterval();

  } else {
    // no transition: ensure intervals consistent
    if (status === "offline") {
      if (!lastSeenInterval) startLastSeenInterval();
    } else {
      stopLastSeenInterval();
    }
  }

  setStatusDot(status);

  // contact button
  if (contactBtn) contactBtn.href = `https://discord.com/users/${USER_ID}`;

  // spotify (prefers top-level data.spotify)
  const spotify = data.spotify || (Array.isArray(data.activities) ? data.activities.find(a => a.name === "Spotify") : null);
  await renderSpotify(spotify);

  lastStatus = status;

  // remove loading
  document.body.classList.remove("loading");
}

/* WebSocket connect + message handling */
function connectSocket() {
  if (ws) {
    try { ws.close(); } catch(e) {}
    ws = null;
  }

  ws = new WebSocket(SOCKET_URL);

  ws.onopen = () => {
    reconnectDelay = 1000;
    ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: USER_ID } }));
    console.info("Lanyard WS open — subscribed to", USER_ID);
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (!msg || !msg.d) return;
      // Lanyard wraps presence updates inside d
      handlePresenceUpdate(msg.d);
    } catch (e) {
      console.error("WS message parse error", e);
    }
  };

  ws.onclose = (ev) => {
    console.warn("Lanyard WS closed", ev.code, ev.reason);
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error("Lanyard WS error", err);
    try { ws.close(); } catch(e) {}
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(Math.round(reconnectDelay * 1.5), 30000);
    connectSocket();
  }, reconnectDelay);
}

/* start on DOM ready */
document.addEventListener("DOMContentLoaded", () => {
  // remove loading state even if socket slower
  document.body.classList.remove("loading");
  connectSocket();
});