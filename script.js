// script.js — direct Lanyard polling (no server proxy)
// Set YOUR Discord ID here:
const USER_ID = "1319292111325106296"; // <-- put your ID if different

const POLL_MS = 4000; // poll interval
let lastStatus = null;
let lastOnlineTs = null;
let lastSeenInterval = null;
let spotifyTicker = null;
let lastSpotifySignature = null;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  poll();
  setInterval(poll, POLL_MS);
});

async function poll() {
  try {
    const res = await fetch(`https://api.lanyard.rest/v1/users/${USER_ID}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Lanyard fetch failed: " + res.status);
    const obj = await res.json();
    if (!obj || !obj.success || !obj.data) throw new Error("Bad data");
    const d = obj.data;

    // user
    const user = d.discord_user || {};
    setText("username", user.global_name || user.username || "Unknown");
    setImg("avatar", buildAvatar(user));
    if (user.id) $("contactBtn").href = `https://discord.com/users/${user.id}`;

    // banner if exists
    const banner = buildBanner(user);
    if (banner) { show("bannerWrap"); setImg("bannerImg", banner); } else hide("bannerWrap");

    renderBadges(user);

    // status
    const raw = (d.discord_status || "offline").toLowerCase();
    const status = raw === "invisible" ? "offline" : raw;
    if (status !== "offline") lastOnlineTs = Date.now();

    const label = ({online:"Online", idle:"Away", dnd:"Do not disturb", offline:"Offline"})[status] || status;
    await setTextFade("statusText", label);

    handleLastSeen(status);

    // spotify: prefer top-level spotify object if present (lanyard includes it)
    const spotify = d.spotify || (Array.isArray(d.activities) ? d.activities.find(a => a.name === "Spotify") : null);
    renderSpotify(spotify);

    // update status dot color class
    updateStatusDot(status);

    lastStatus = status;
  } catch (err) {
    // if fetch fails (CORS or network), show offline fallback
    setText("username", "Offline");
    setText("statusText", "Offline");
    hide("spotify");
    console.warn("Lanyard fetch error:", err);
  }
}

/* --- helpers --- */
function setText(id, t){ const e=$(id); if(e) e.textContent=t; }
function setImg(id, src){ const e=$(id); if(e && src) e.src=src; }
function show(id){ const e=$(id); if(e) e.classList.remove("hidden"); }
function hide(id){ const e=$(id); if(e) e.classList.add("hidden"); }

function setTextFade(id, text){
  const el=$(id);
  if(!el) return Promise.resolve();
  el._f=(el._f||0)+1; const tk = el._f;
  if(el.textContent===text){ el.classList.remove("fade-out"); return Promise.resolve(); }
  return new Promise(res=>{
    el.classList.add("fade-out");
    setTimeout(()=>{
      if(el._f!==tk) return res();
      el.textContent=text;
      el.classList.remove("fade-out");
      setTimeout(()=>res(),360);
    },220);
  });
}

/* last seen handling */
function handleLastSeen(status){
  const el = $("lastSeen");
  function startOffline(){
    stopOffline();
    if(!lastOnlineTs) setText("lastSeen","Last seen unknown");
    else setText("lastSeen", `Last seen ${msShort(Date.now()-lastOnlineTs)} ago`);
    lastSeenInterval = setInterval(()=> {
      if(!lastOnlineTs) return;
      setText("lastSeen", `Last seen ${msShort(Date.now()-lastOnlineTs)} ago`);
    },1000);
  }
  function stopOffline(){ if(lastSeenInterval){ clearInterval(lastSeenInterval); lastSeenInterval=null; } }
  function hideNow(){ if(!el) return; el.classList.add("fade-out"); setTimeout(()=>el.classList.add("hidden"),380); }

  if(status==="online"){
    stopOffline();
    if(el){ el.classList.remove("hidden"); el.classList.remove("fade-out"); }
    setTextFade("lastSeen","Active now").then(()=> setTimeout(()=> hideNow(),1500));
  } else if(status==="idle"){
    stopOffline();
    if(el){ el.classList.remove("hidden"); el.classList.remove("fade-out"); }
    setTextFade("lastSeen","Away now").then(()=> setTimeout(()=> hideNow(),1500));
  } else if(status==="dnd"){
    stopOffline();
    if(el){ el.classList.remove("hidden"); el.classList.remove("fade-out"); }
    setTextFade("lastSeen","Do not disturb").then(()=> setTimeout(()=> hideNow(),1500));
  } else { // offline
    if(el){ el.classList.remove("hidden"); el.classList.remove("fade-out"); }
    startOffline();
  }
}

function updateStatusDot(status){
  const dot = $("statusDot");
  if(!dot) return;
  dot.className = "status-dot status-" + (status || "offline");
}

/* avatar/banner/badges */
function buildAvatar(user){
  if(!user) return "";
  if(!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.id||0)%5}.png`;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=512`;
}
function buildBanner(user){
  if(!user) return "";
  if(!user.banner) return "";
  const ext = user.banner.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
}
function renderBadges(user){
  const c = $("badges"); if(!c){return;}
  c.innerHTML = "";
  const flags = (user && (user.public_flags ?? user.flags)) || 0;
  const defs = [
    {bit:1, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
    {bit:2, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
    {bit:4, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`}
  ];
  const found = defs.filter(d=> (Number(flags) & d.bit) === d.bit);
  if(!found.length){ c.style.display="none"; return; }
  c.style.display="flex";
  found.forEach((f,i)=>{
    const s = document.createElement("span");
    s.className="badge-icon";
    s.innerHTML = f.svg;
    c.appendChild(s);
    setTimeout(()=>s.classList.add("show"), i*90);
  });
}

/* --- Spotify rendering (simple + fast) --- */
function renderSpotify(spotify){
  if(spotifyTicker){ clearInterval(spotifyTicker); spotifyTicker = null; }
  const sp = $("spotify");
  const album = $("albumArt");
  const songEl = $("song");
  const artistEl = $("artist");
  const pf = $("progressFill");
  const tc = $("timeCurrent");
  const tt = $("timeTotal");

  if(!spotify){ if(sp) sp.classList.add("hidden"); if(pf) pf.style.width="0%"; if(tc) tc.textContent="0:00"; if(tt) tt.textContent="0:00"; return; }

  const song = spotify.song ?? spotify.details ?? "";
  const artist = spotify.artist ?? spotify.state ?? "";
  const start = spotify.timestamps?.start ?? null;
  const end = spotify.timestamps?.end ?? null;
  const art = spotify.album_art_url ?? (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace('spotify:','')}` : "");

  if(sp) sp.classList.remove("hidden");
  if(songEl) songEl.textContent = song;
  if(artistEl) artistEl.textContent = artist;
  if(album && art) album.src = art;

  // color sample is optional and cheap-ish (runs once per new track)
  (async ()=>{
    if(!pf) return;
    const col = await sampleColor(art);
    pf.style.background = col ? `linear-gradient(90deg, ${col}, rgba(255,255,255,0.12))` : `linear-gradient(90deg,#1db954,#6be38b)`;
  })();

  if(start && end && end>start && pf){
    const total = end - start;
    const MIN = 8; // minimum progress width percent
    const tick = ()=>{
      const now = Date.now();
      let elapsed = now - start;
      if(elapsed < 0) elapsed = 0;
      // if track repeats (Spotify), show elapsed % within total
      const pct = (elapsed % total) / total * 100;
      const visible = Math.max(pct, MIN);
      pf.style.width = `${visible}%`;
      if(tc) tc.textContent = formatMS(elapsed % total);
      if(tt) tt.textContent = formatMS(total);
    };
    tick();
    spotifyTicker = setInterval(tick, 1000);
  } else {
    if(pf) pf.style.width = "20%";
    if(tc) tc.textContent = "0:00";
    if(tt) tt.textContent = "—";
  }
}

function formatMS(ms){ const s = Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function msShort(ms){ const s = Math.floor(ms/1000); if(s<60) return `${s}s`; const m = Math.floor(s/60); if(m<60) return `${m}m`; const h = Math.floor(m/60); if(h<24) return `${h}h`; return `${Math.floor(h/24)}d`; }

/* fast color sample (returns rgb string or null) */
async function sampleColor(url){
  if(!url) return null;
  return new Promise(resolve=>{
    try{
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = ()=>{
        try{
          const W=40,H=40;
          const canvas = document.createElement("canvas");
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img,0,0,W,H);
          const data = ctx.getImageData(0,0,W,H).data;
          let r=0,g=0,b=0,c=0;
          for(let y=6;y<34;y++){
            for(let x=6;x<34;x++){
              const i = (y*W + x)*4;
              if(data[i+3] === 0) continue;
              r += data[i]; g += data[i+1]; b += data[i+2]; c++;
            }
          }
          if(!c) return resolve(null);
          resolve(`rgb(${Math.round(r/c)}, ${Math.round(g/c)}, ${Math.round(b/c)})`);
        }catch(e){ resolve(null); }
      };
      img.onerror = ()=> resolve(null);
    }catch(e){ resolve(null); }
  });
}