// script.js — polling client (uses /api/presence proxy)
const POLL_MS = 4000;
const FETCH_TIMEOUT = 8000;

let lastStatus = null;
let lastOnlineTimestamp = null;
let lastSeenInterval = null;
let lastSeenHideTimer = null;
let spotifyTicker = null;
let lastSpotifySignature = null;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  poll();
  setInterval(poll, POLL_MS);
});

async function poll() {
  try {
    const json = await fetchWithTimeout("/api/presence", FETCH_TIMEOUT);
    if (!json || !json.success || !json.data) {
      setText("username", "Offline");
      setText("statusText", "Offline");
      hideSpotify();
      return;
    }
    const d = json.data;
    const user = d.discord_user || {};

    setText("username", user.global_name || user.username || "Unknown");
    setImg("avatar", buildAvatar(user));

    const banner = buildBanner(user);
    if (banner) { showElement("bannerWrap"); setImg("bannerImg", banner); } else hideElement("bannerWrap");

    renderBadges(user);

    const rawStatus = (d.discord_status || "offline").toLowerCase();
    const status = rawStatus === "invisible" ? "offline" : rawStatus;
    if (status !== "offline") lastOnlineTimestamp = Date.now();

    const labelMap = { online: "Online", idle: "Away", dnd: "Do not disturb", offline: "Offline" };
    const label = labelMap[status] ?? status;
    await setTextFade("statusText", label);

    handleLastSeenTransition(status);

    if ($("contactBtn") && user.id) $("contactBtn").href = `https://discord.com/users/${user.id}`;

    const spotify = d.spotify || (Array.isArray(d.activities) ? d.activities.find(a => a.name === "Spotify") : null);
    await renderSpotify(spotify);

    lastStatus = status;
  } catch (e) {
    // silent fail
    console.error("poll error", e);
  }
}

/* fetch with timeout */
function fetchWithTimeout(url, ms=8000){
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(()=>{ controller.abort(); reject(new Error("fetch timeout")); }, ms);
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(r => r.json())
      .then(json => { clearTimeout(timer); resolve(json); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/* DOM helpers */
function setText(id, t){ const el=$(id); if(el) el.textContent = t; }
function setImg(id, src){ const el=$(id); if(el && src) el.src = src; }
function showElement(id){ const el=$(id); if(el) el.classList.remove("hidden"); }
function hideElement(id){ const el=$(id); if(el) el.classList.add("hidden"); }

function setTextFade(id, text){
  const el = $(id);
  if (!el) return Promise.resolve();
  el._fadeToken = (el._fadeToken || 0) + 1;
  const token = el._fadeToken;
  if (el.textContent === text) { el.classList.remove("fade-out"); return Promise.resolve(); }
  return new Promise(resolve => {
    el.classList.add("fade-out");
    setTimeout(()=> {
      if (el._fadeToken !== token) return resolve();
      el.textContent = text;
      el.classList.remove("fade-out");
      setTimeout(()=>{ if (el._fadeToken !== token) return resolve(); resolve(); }, 380);
    }, 220);
  });
}

/* last seen handling */
function handleLastSeenTransition(status){
  const lastSeenEl = $("lastSeen");
  function startOfflineIntervalNow(){
    stopLastSeenInterval();
    if (!lastOnlineTimestamp) setText("lastSeen", "Last seen unknown");
    else setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
    lastSeenInterval = setInterval(()=> {
      if (!lastOnlineTimestamp) return;
      setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
    }, 1000);
  }
  function stopLastSeenInterval(){
    if (lastSeenInterval) { clearInterval(lastSeenInterval); lastSeenInterval = null; }
  }
  function hideLastSeenInstant(){
    if (!lastSeenEl) return;
    lastSeenEl.classList.add("fade-out");
    setTimeout(()=>{ if (!lastSeenEl) return; lastSeenEl.classList.add("hidden"); }, 380);
  }

  if (status === "online" && lastStatus !== "online") {
    stopLastSeenInterval();
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    setTextFade("lastSeen","Active now").then(()=>{ if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer); lastSeenHideTimer=setTimeout(()=>{ hideLastSeenInstant(); lastSeenHideTimer=null; },1500); });

  } else if (status === "online" && lastStatus === "online") {
    stopLastSeenInterval();
    if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

  } else if (status === "idle" && lastStatus !== "idle") {
    stopLastSeenInterval();
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    setTextFade("lastSeen","Away now").then(()=>{ if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer); lastSeenHideTimer=setTimeout(()=>{ hideLastSeenInstant(); lastSeenHideTimer=null; },1500); });

  } else if (status === "idle" && lastStatus === "idle") {
    stopLastSeenInterval();
    if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

  } else if (status === "dnd" && lastStatus !== "dnd") {
    stopLastSeenInterval();
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    setTextFade("lastSeen","Do not disturb").then(()=>{ if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer); lastSeenHideTimer=setTimeout(()=>{ hideLastSeenInstant(); lastSeenHideTimer=null; },1500); });

  } else if (status === "dnd" && lastStatus === "dnd") {
    stopLastSeenInterval();
    if (lastSeenEl && !lastSeenEl.classList.contains("hidden")) hideLastSeenInstant();

  } else if (status === "offline" && lastStatus !== "offline") {
    if (lastSeenEl) { lastSeenEl.classList.remove("hidden"); lastSeenEl.classList.remove("fade-out"); }
    startOfflineIntervalNow();

  } else {
    if (status === "offline") {
      if (!lastSeenInterval) startOfflineIntervalNow();
    } else {
      stopLastSeenInterval();
    }
  }
}

/* avatar/banner/badges */
function buildAvatar(user){
  if (!user) return "";
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.id||0)%5}.png`;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=512`;
}
function buildBanner(user){
  if (!user) return "";
  if (!user.banner) return "";
  const ext = user.banner.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
}
function badgeDefs(){
  return [
    {bit:1, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
    {bit:2, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
    {bit:4, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`}
  ];
}
function renderBadges(user){
  const container = $("badges");
  if (!container) return;
  container.innerHTML = "";
  const flags = (user && (user.public_flags ?? user.flags)) ?? 0;
  const defs = badgeDefs();
  const found = defs.filter(d => (Number(flags) & d.bit) === d.bit);
  if (!found.length) { container.style.display = "none"; return; }
  container.style.display = "flex";
  found.forEach((b,i)=> {
    const s = document.createElement("span");
    s.className = "badge-icon";
    s.innerHTML = b.svg;
    container.appendChild(s);
    setTimeout(()=>s.classList.add("show"), i*90);
  });
}

/* spotify */
async function renderSpotify(spotify){
  if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker=null; }

  const spBox = $("spotify");
  const albumArt = $("albumArt");
  const songEl = $("song");
  const artistEl = $("artist");
  const progressFill = $("progressFill");
  const timeCur = $("timeCurrent");
  const timeTot = $("timeTotal");

  if (!spotify) {
    lastSpotifySignature = null;
    if (spBox) spBox.classList.add("hidden");
    if (progressFill) { progressFill.style.width = "0%"; progressFill.style.background = ""; }
    if (timeCur) timeCur.textContent = "0:00";
    if (timeTot) timeTot.textContent = "0:00";
    return;
  }

  const trackId = spotify.track_id ?? spotify.sync_id ?? spotify.party?.id ?? spotify.id ?? null;
  const song = spotify.song ?? spotify.details ?? "";
  const artist = spotify.artist ?? spotify.state ?? "";
  const start = spotify.timestamps?.start ?? null;
  const albumArtUrl = spotify.album_art_url ?? (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:","")}` : "") || "";

  const signature = JSON.stringify({ trackId, song, artist, start, albumArtUrl });
  lastSpotifySignature = signature;

  if (spBox) spBox.classList.remove("hidden");
  if (songEl) songEl.textContent = song || "";
  if (artistEl) artistEl.textContent = artist || "";

  if (albumArt && albumArtUrl) albumArt.src = `${albumArtUrl}${albumArtUrl.includes('?') ? '&' : '?'}_=${Date.now()}`;
  else if (albumArt) albumArt.src = "";

  (async () => {
    if (!progressFill) return;
    const col = await sampleColor(albumArtUrl);
    if (col) progressFill.style.background = `linear-gradient(90deg, ${col}, rgba(255,255,255,0.18))`;
    else progressFill.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
  })();

  const end = spotify.timestamps?.end ?? null;
  const startTs = start;

  if (startTs && end && end > startTs && progressFill) {
    const total = end - startTs;
    const MIN = 8;
    const tick = () => {
      const now = Date.now();
      let raw = now - startTs; if (raw < 0) raw = 0;
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
function hideSpotify(){ const sp=$("spotify"); if(sp) sp.classList.add("hidden"); }

/* color sample */
async function sampleColor(url){
  if(!url) return null;
  return new Promise(resolve=>{
    try{
      const img=new Image(); img.crossOrigin="Anonymous"; img.src=url;
      img.onload=()=>{
        try{
          const W=48,H=48; const canvas=document.createElement("canvas"); canvas.width=W; canvas.height=H;
          const ctx=canvas.getContext("2d"); ctx.drawImage(img,0,0,W,H);
          const data=ctx.getImageData(0,0,W,H).data;
          let r=0,g=0,b=0,c=0;
          for(let y=8;y<40;y++){ for(let x=8;x<40;x++){ const i=(y*W+x)*4; const a=data[i+3]; if(!a) continue; r+=data[i]; g+=data[i+1]; b+=data[i+2]; c++; } }
          if(!c) return resolve(null);
          resolve(`rgb(${Math.round(r/c)}, ${Math.round(g/c)}, ${Math.round(b/c)})`);
        }catch(e){ resolve(null); }
      };
      img.onerror=()=>resolve(null);
    }catch(e){ resolve(null); }
  });
}

/* utils */
function msToMMSS(ms){ const s=Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
function msToHumanShort(ms){ const s=Math.floor(ms/1000); if(s<60) return `${s}s`; const m=Math.floor(s/60); if(m<60) return `${m}m`; const h=Math.floor(m/60); if(h<24) return `${h}h`; const d=Math.floor(h/24); return `${d}d`; }