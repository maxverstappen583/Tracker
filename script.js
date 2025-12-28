// script_v12.js — minimal, robust Lanyard + Spotify UI updater
// Replace your existing script with this file, then deploy and hard-refresh.

const USER_ID = "1319292111325106296";
let lastOnline = Date.now();
let spotifyTicker = null;

document.addEventListener("DOMContentLoaded", () => {
  debug("JS loaded");
  run();
  setInterval(run, 4000);
});

function debug(msg) {
  const d = document.getElementById("debug");
  if (d) d.textContent = "Debug: " + msg;
}

// main runner
async function run() {
  debug("Fetching Lanyard…");
  try {
    const res = await fetch(`https://api.lanyard.rest/v1/users/${USER_ID}`, { cache: "no-store" });
    if (!res.ok) { debug("HTTP " + res.status); return; }
    const j = await res.json();
    if (!j.success) { debug("Lanyard success=false"); return; }

    const data = j.data;
    debug("Data OK");

    // user
    const user = data.discord_user || {};
    setText("username", user.global_name || user.username || "Unknown");
    setImg("avatar", buildAvatar(user));
    setImg("heroAvatar", buildAvatar(user));

    // banner
    const bannerUrl = buildBanner(user);
    const bannerWrap = document.getElementById("bannerWrap");
    const bannerImg = document.getElementById("bannerImg");
    if (bannerWrap && bannerImg) {
      if (bannerUrl) { bannerWrap.classList.remove("hidden"); bannerImg.src = bannerUrl; }
      else { bannerWrap.classList.add("hidden"); bannerImg.src = ""; }
    }

    // badges (best-effort: show only if flags exist)
    renderBadges(user);

    // status / last seen
    const status = (data.discord_status || "offline").toLowerCase();
    if (status !== "offline") {
      lastOnline = Date.now();
      setText("statusText", "Online");
      setText("lastSeen", "Active now");
      setStatusDot(status);
    } else {
      setText("statusText", "Offline");
      setText("lastSeen", lastOnline ? `Offline for ${msToHuman(Date.now() - lastOnline)}` : "Offline");
      setStatusDot("offline");
    }

    // contact link
    const contactBtn = document.getElementById("contactBtn");
    if (contactBtn) contactBtn.href = `https://discord.com/users/${USER_ID}`;

    // Spotify (try data.spotify first, then activity)
    const spotify = data.spotify || (Array.isArray(data.activities) ? data.activities.find(a => a.name === "Spotify") : null);
    await renderSpotifySafe(spotify);

    document.body.classList.remove("loading");
    debug("Rendered");

  } catch (err) {
    console.error(err);
    debug("Fetch error");
    document.body.classList.remove("loading");
  }
}

/* helpers */
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setImg(id, src) { const el = document.getElementById(id); if (el && src) el.src = src; }
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
function msToHuman(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  return `${Math.floor(s/3600)}h`;
}

/* status dot */
function setStatusDot(status) {
  const dot = document.getElementById("statusDot");
  if (!dot) return;
  dot.className = `status-dot status-${status}`;
}

/* BADGES - show only if flags present, animate if so */
function badgeDefs() {
  return [
    {bit:1, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
    {bit:2, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
    {bit:4, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`},
    {bit:8, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a6 6 0 016 6v2h2v2h-2v2a6 6 0 01-6 6 6 6 0 01-6-6v-2H4v-2h2V8a6 6 0 016-6z"/></svg>`},
    {bit:512, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3 7h7l-5.6 4.1L20 22l-8-5-8 5 1.6-8.9L0 9h7l3-7z"/></svg>`},
    {bit:16384, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a6 6 0 016 6v2h2v2h-2v2a6 6 0 01-6 6 6 6 0 01-6-6v-2H4v-2h2V8a6 6 0 016-6z"/></svg>`},
    {bit:65536, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a3 3 0 013 3v1h3v2H6V6h3V5a3 3 0 013-3zM6 10h12v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8z"/></svg>`},
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

/* SPOTIFY rendering — safe and repeat-aware */
async function renderSpotifySafe(spotify) {
  const spBox = document.getElementById("spotify");
  const albumArt = document.getElementById("albumArt");
  const songEl = document.getElementById("song");
  const artistEl = document.getElementById("artist");
  const progressFill = document.getElementById("progressFill");
  const timeCur = document.getElementById("timeCurrent");
  const timeTot = document.getElementById("timeTotal");

  // clear old ticker
  if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }

  if (!spotify) {
    if (spBox) spBox.classList.add("hidden");
    if (progressFill) { progressFill.style.width = "0%"; progressFill.style.background = ""; }
    if (timeCur) timeCur.textContent = "0:00";
    if (timeTot) timeTot.textContent = "0:00";
    return;
  }

  // In Lanyard you may have a top-level spotify object OR activity-based one
  // Normalize fields
  const isTop = !!spotify.track_id || !!spotify.album;
  const start = isTop ? spotify.timestamps?.start : spotify.timestamps?.start;
  const end = isTop ? spotify.timestamps?.end : spotify.timestamps?.end;
  const art = isTop ? spotify.album_art_url : (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:","")}` : "");
  const song = isTop ? spotify.song || spotify.details : spotify.details;
  const artist = isTop ? spotify.artist || spotify.state : spotify.state;

  if (spBox) spBox.classList.remove("hidden");
  if (songEl) songEl.textContent = song || "";
  if (artistEl) artistEl.textContent = artist || "";
  if (albumArt && art) albumArt.src = art;

  // try sampling color but fallback if blocked
  (async () => {
    if (!progressFill) return;
    const color = await sampleColor(art);
    if (color) progressFill.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.18))`;
    else progressFill.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
  })();

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

/* sample center color — returns 'rgb(r,g,b)' or null */
async function sampleColor(url) {
  if (!url) return null;
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = () => {
        try {
          const W=48,H=48; const canvas = document.createElement("canvas");
          canvas.width=W; canvas.height=H;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img,0,0,W,H);
          const data = ctx.getImageData(0,0,W,H).data;
          let r=0,g=0,b=0,c=0;
          for (let y=8;y<40;y++) for (let x=8;x<40;x++){
            const i=(y*W+x)*4; const a=data[i+3]; if(a===0) continue;
            r+=data[i]; g+=data[i+1]; b+=data[i+2]; c++;
          }
          if(!c) return resolve(null);
          resolve(`rgb(${Math.round(r/c)}, ${Math.round(g/c)}, ${Math.round(b/c)})`);
        } catch(e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
    } catch(e) { resolve(null); }
  });
}

function msToMMSS(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}