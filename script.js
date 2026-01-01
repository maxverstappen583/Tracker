// script.js — Lanyard WebSocket realtime client (no server)
// USER_ID: tracked Discord user ID (you gave this ID)
const USER_ID = "1319292111325106296";

const wsUrl = "wss://api.lanyard.rest/socket";
let ws = null;
let heartbeatInterval = null;
let lastOnlineTimestamp = null;
let lastSeenTimer = null;
let spotifyTicker = null;

const $ = id => document.getElementById(id);

// UI helpers
function setText(id, txt){ const el = $(id); if(el) el.textContent = txt; }
function setImg(id, src){ const el = $(id); if(el) el.src = src; }
function show(id){ const el = $(id); if(el) el.classList.remove("hidden"); }
function hide(id){ const el = $(id); if(el) el.classList.add("hidden"); }
function setStatusDot(status){
  const dot = $("statusDot");
  if(!dot) return;
  dot.className = "status-dot status-" + (status || "offline");
}

/* Start connection */
function connect() {
  if (ws) try { ws.close(); } catch(e){ }
  ws = new WebSocket(wsUrl);
  ws.addEventListener("open", () => {
    // no-op; wait for Hello
  });

  ws.addEventListener("message", ev => {
    try {
      const msg = JSON.parse(ev.data);
      handleMessage(msg);
    } catch (e) {
      // ignore invalid
      console.warn("Invalid WS message", e);
    }
  });

  ws.addEventListener("close", () => {
    cleanupHeartbeat();
    // reconnect after backoff
    setTimeout(connect, 2500);
  });

  ws.addEventListener("error", () => {
    cleanupHeartbeat();
  });
}

/* Handle incoming opcode messages */
function handleMessage(msg){
  if (!msg || typeof msg.op !== "number") return;
  // Hello (op 1)
  if (msg.op === 1 && msg.d && msg.d.heartbeat_interval) {
    const interval = msg.d.heartbeat_interval;
    startHeartbeat(interval);
    // Subscribe to our ID
    sendInit();
    return;
  }

  // Events (op 0): INIT_STATE or PRESENCE_UPDATE
  if (msg.op === 0 && msg.t) {
    if (msg.t === "INIT_STATE") {
      // msg.d may be a map (userId->presence) or a single presence object
      const data = msg.d;
      let presence = null;
      if (data && data[USER_ID]) presence = data[USER_ID];
      else presence = data;
      if (presence) updatePresence(presence);
    } else if (msg.t === "PRESENCE_UPDATE") {
      // msg.d is presence object (with user_id)
      updatePresence(msg.d);
    }
  }
}

/* Send Initialize (op 2) */
function sendInit(){
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const payload = { op: 2, d: { subscribe_to_id: String(USER_ID) } };
  ws.send(JSON.stringify(payload));
}

/* Heartbeat (op 3) */
function startHeartbeat(intervalMs) {
  cleanupHeartbeat();
  // Lanyard expects sending {op: 3} on interval
  heartbeatInterval = setInterval(() => {
    try { ws.send(JSON.stringify({ op: 3 })); } catch(e) {}
  }, Math.max(1000, intervalMs || 30000));
}
function cleanupHeartbeat(){
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

/* Update UI from presence object */
function updatePresence(pres){
  if (!pres) return;
  // username & avatar
  const user = pres.discord_user || pres.user || {};
  setText("username", user.global_name || user.username || "Unknown");
  setImg("avatar", buildAvatar(user));
  // banner
  const banner = buildBanner(user);
  if (banner) { show("bannerWrap"); setImg("bannerImg", banner); } else hide("bannerWrap");
  // badges
  renderBadges(user);

  // status handling
  const raw = (pres.discord_status || "offline").toLowerCase();
  const status = raw === "invisible" ? "offline" : raw;
  setStatusDot(status);
  const labels = { online: "Online", idle: "Away", dnd: "Do not disturb", offline: "Offline" };
  setTextFade("statusText", labels[status] || status);

  // last seen logic: if status != offline -> set lastOnlineTimestamp to now
  if (status !== "offline") {
    lastOnlineTimestamp = Date.now();
  }
  handleLastSeen(status);

  // contact link
  if (user.id) $("contactBtn").href = `https://discord.com/users/${user.id}`;

  // spotify — Lanyard may provide top-level spotify or in activities
  const spotify = pres.spotify || (Array.isArray(pres.activities) ? pres.activities.find(a => a.name === "Spotify") : null);
  renderSpotify(spotify);
}

/* Build avatar/banner urls */
function buildAvatar(user){
  if(!user) return "";
  if(!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.id||0) % 5}.png`;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=512`;
}
function buildBanner(user){
  if(!user) return "";
  if(!user.banner) return "";
  const ext = user.banner.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
}

/* Badges (simple icons if flags set) */
function renderBadges(user){
  const container = $("badges");
  if(!container) return;
  container.innerHTML = "";
  const flags = Number(user?.public_flags ?? user?.flags ?? 0);
  const defs = [
    {bit:1, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
    {bit:2, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
    {bit:4, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`}
  ];
  const found = defs.filter(d => (flags & d.bit) === d.bit);
  if (!found.length) { container.style.display = "none"; return; }
  container.style.display = "flex";
  found.forEach((b,i)=>{
    const span = document.createElement("span");
    span.className = "badge-icon";
    span.innerHTML = b.svg;
    container.appendChild(span);
    setTimeout(()=> span.classList.add("show"), i * 80);
  });
}

/* LAST-SEEN logic */
/* Show Active/Away/DND briefly then hide; on offline show "Last seen X" updating */
function handleLastSeen(status){
  const el = $("lastSeen");
  if (!el) return;
  clearInterval(lastSeenTimer);
  lastSeenTimer = null;

  const hideDelayed = (ms=1500) => {
    setTimeout(()=> {
      el.classList.add("fade-out");
      setTimeout(()=> el.classList.add("hidden"), 360);
    }, ms);
  };

  if (status === "online") {
    el.classList.remove("hidden"); el.classList.remove("fade-out");
    setText("lastSeen", "Active now");
    hideDelayed(1500);
  } else if (status === "idle") {
    el.classList.remove("hidden"); el.classList.remove("fade-out");
    setText("lastSeen", "Away now");
    hideDelayed(1500);
  } else if (status === "dnd") {
    el.classList.remove("hidden"); el.classList.remove("fade-out");
    setText("lastSeen", "Do not disturb");
    hideDelayed(1500);
  } else { // offline
    el.classList.remove("hidden"); el.classList.remove("fade-out");
    if (!lastOnlineTimestamp) {
      setText("lastSeen", "Last seen unknown");
    } else {
      setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
      lastSeenTimer = setInterval(()=> {
        setText("lastSeen", `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
      }, 1000);
    }
  }
}

/* Simple fade + text setter to animate text changes */
function setTextFade(id, text){
  const el = $(id);
  if(!el) return;
  if(el.textContent === text){ el.classList.remove("fade-out"); return; }
  el.classList.add("fade-out");
  setTimeout(()=> {
    el.textContent = text;
    el.classList.remove("fade-out");
  }, 220);
}

/* Spotify rendering: show card, progress bar with minimum size, color sample from album image */
function renderSpotify(spotify){
  if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
  const spBox = $("spotify");
  const albumEl = $("albumArt");
  const songEl = $("song");
  const artistEl = $("artist");
  const progressEl = $("progressFill");
  const tCur = $("timeCurrent");
  const tTot = $("timeTotal");

  if (!spotify) {
    if (spBox) spBox.classList.add("hidden");
    if (progressEl) { progressEl.style.width = "0%"; progressEl.style.background = ""; }
    if (tCur) tCur.textContent = "0:00";
    if (tTot) tTot.textContent = "0:00";
    return;
  }

  // spotify object shape: Lanyard exposes spotify{song,artist,album_art_url,timestamps}
  const song = spotify.song ?? spotify.details ?? "";
  const artist = spotify.artist ?? spotify.state ?? "";
  const start = spotify.timestamps?.start ?? null;
  const end = spotify.timestamps?.end ?? null;
  const art = spotify.album_art_url ?? (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:","")}` : "");

  if (spBox) spBox.classList.remove("hidden");
  if (songEl) songEl.textContent = song || "Unknown";
  if (artistEl) artistEl.textContent = artist || "";

  if (albumEl && art) albumEl.src = art;

  // sample color once per new album (cheap)
  (async () => {
    if (!progressEl) return;
    const col = await sampleColor(art);
    progressEl.style.background = col ? `linear-gradient(90deg, ${col}, rgba(255,255,255,0.12))` : `linear-gradient(90deg,#1db954,#6be38b)`;
  })();

  if (start && end && end > start && progressEl) {
    const total = end - start;
    const MIN = 8; // minimum width percent so short songs still show
    const tick = () => {
      const now = Date.now();
      let elapsed = now - start;
      if (elapsed < 0) elapsed = 0;
      // If song set to repeat on client, lanyard timestamps will still be absolute; use modulo
      const pct = ((elapsed % total) / total) * 100;
      const visible = Math.max(pct, MIN);
      progressEl.style.width = `${visible}%`;
      if (tCur) tCur.textContent = formatMS(elapsed % total);
      if (tTot) tTot.textContent = formatMS(total);
    };
    tick();
    spotifyTicker = setInterval(tick, 1000);
  } else {
    if (progressEl) progressEl.style.width = "20%";
    if (tCur) tCur.textContent = "0:00";
    if (tTot) tTot.textContent = "—";
  }
}

/* Format helpers */
function formatMS(ms){ const s = Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
function msToHumanShort(ms){
  const s = Math.floor(ms/1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s/60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h/24);
  return `${d}d`;
}

/* Fast, small average color sample for album art (may fail due to CORS sometimes) */
async function sampleColor(url){
  if (!url) return null;
  return new Promise(resolve => {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = () => {
        try {
          const W = 40, H = 40;
          const canvas = document.createElement("canvas");
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, W, H);
          const data = ctx.getImageData(0,0,W,H).data;
          let r=0,g=0,b=0,c=0;
          for (let y=6;y<34;y++){
            for (let x=6;x<34;x++){
              const i = (y*W + x)*4;
              if (data[i+3] === 0) continue;
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

/* set up WS and start */
connect();