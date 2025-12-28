/* ---------- CONFIG ---------- */
/* PUT YOUR DISCORD ID (string) */
const USER_ID = "1319292111325106296";
const POLL_MS = 4000;

/* ---------- helpers ---------- */
function msToHuman(ms) {
  if (ms == null) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
function msToMMSS(ms){
  if(ms == null) return "0:00";
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  return `${m}:${String(s%60).padStart(2,"0")}`;
}
function buildAvatarUrl(user){
  if(!user) return "";
  const id = user.id;
  const av = user.avatar;
  if(!av) return `https://cdn.discordapp.com/embed/avatars/${Number(id)%5}.png`;
  const isAnim = av.startsWith("a_");
  const ext = isAnim ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${av}.${ext}?size=512`;
}
function buildBannerUrl(user){
  if(!user) return "";
  const id = user.id;
  const banner = user.banner;
  if(!banner) return "";
  const isAnim = banner.startsWith("a_");
  const ext = isAnim ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${id}/${banner}.${ext}?size=1024`;
}

/* ---------- badge icons mapping (bit -> {name,svg}) ---------- */
function badgesFromFlags(flags){
  const n = Number(flags) || 0;
  const mapping = [
    {bit:1, key:"staff", title:"Discord Staff", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.6 5.6 6.1.6-4.5 3.7.9 6.1L12 16.9 6.9 18.0l.9-6.1L3.3 8.2l6.1-.6L12 2z"/></svg>`},
    {bit:2, key:"partner", title:"Partner", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.6 5.6 6.1.6-4.5 3.7.9 6.1L12 16.9 6.9 18.0l.9-6.1L3.3 8.2l6.1-.6L12 2z"/></svg>`},
    {bit:4, key:"hypesquad", title:"HypeSquad", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5"/></svg>`},
    {bit:8, key:"bughunter", title:"Bug Hunter", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a6 6 0 016 6v2h2v2h-2v2a6 6 0 01-6 6 6 6 0 01-6-6v-2H4v-2h2V8a6 6 0 016-6z"/></svg>`},
    {bit:512, key:"early", title:"Early Supporter", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3 7h7l-5.6 4.1L20 22l-8-5-8 5 1.6-8.9L0 9h7l3-7z"/></svg>`},
    {bit:65536, key:"botdev", title:"Verified Bot Dev", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a3 3 0 013 3v1h3v2H6V6h3V5a3 3 0 013-3zM6 10h12v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8z"/></svg>`},
    // add more mappings as needed
  ];
  return mapping.filter(m => (n & m.bit) === m.bit);
}

/* ---------- DOM refs ---------- */
const $card = document.getElementById("card");
const $username = document.getElementById("username");
const $avatar = document.getElementById("avatar");
const $heroAvatar = document.getElementById("heroAvatar");
const $avatarWrap = document.getElementById("avatarWrap");
const $statusText = document.getElementById("statusText");
const $lastSeen = document.getElementById("lastSeen");
const $statusDot = document.getElementById("statusDot");
const $badges = document.getElementById("badges");
const $bannerWrap = document.getElementById("bannerWrap");
const $bannerImg = document.getElementById("bannerImg");

const $spotify = document.getElementById("spotify");
const $albumArt = document.getElementById("albumArt");
const $song = document.getElementById("song");
const $artist = document.getElementById("artist");
const $progressBar = document.getElementById("progressBar");
const $timeCurrent = document.getElementById("timeCurrent");
const $timeTotal = document.getElementById("timeTotal");

let lastActive = null;
let spotifyTicker = null;

/* ---------- main fetch ---------- */
async function fetchStatus(){
  try{
    const res = await fetch(`https://api.lanyard.rest/v1/users/${USER_ID}`, { cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    if(!json.success){
      // not monitored by Lanyard
      $username.textContent = "Not monitored";
      $statusText.textContent = "Join the Lanyard Discord and allow presence";
      $card.classList.remove("skeleton");
      return;
    }

    const d = json.data;
    $card.classList.remove("skeleton");

    // username + avatars
    $username.textContent = d.discord_user?.username || "Unknown";
    $avatar.src = buildAvatarUrl(d.discord_user);
    $heroAvatar.src = buildAvatarUrl(d.discord_user);

    // banner
    const bannerUrl = buildBannerUrl(d.discord_user);
    if(bannerUrl){
      $bannerWrap.classList.remove("hidden");
      $bannerImg.src = bannerUrl;
    } else {
      $bannerWrap.classList.add("hidden");
    }

    // badges (icons)
    $badges.innerHTML = "";
    const flags = d.discord_user?.public_flags ?? d.discord_user?.flags ?? 0;
    const badgeDefs = badgesFromFlags(flags);
    badgeDefs.forEach(b => {
      const el = document.createElement("span");
      el.className = "badge-icon";
      el.title = b.title;
      el.innerHTML = b.svg;
      $badges.appendChild(el);
    });

    // status
    const status = (d.discord_status || "offline").toLowerCase();
    $statusText.textContent = status === "online" ? "Online" : status === "idle" ? "Away" : status === "dnd" ? "Do not disturb" : "Offline";

    // avatar glow class
    $avatarWrap.className = `avatar-wrap`;
    $avatarWrap.classList.add(`avatar-wrap--${status}`);

    // status dot
    $statusDot.className = `status-dot status-${status}`;

    // last seen logic
    if(status !== "offline"){
      lastActive = Date.now();
      $lastSeen.textContent = "Active now";
    } else {
      $lastSeen.textContent = lastActive ? `Offline for ${msToHuman(Date.now() - lastActive)}` : "Offline";
    }

    // contact button -> discord profile
    const contactBtn = document.getElementById("contactBtn");
    contactBtn.href = `https://discord.com/users/${USER_ID}`;

    // Spotify handling
    const activities = Array.isArray(d.activities) ? d.activities : [];
    const spotify = activities.find(a => a.name === "Spotify");
    if(spotify && spotify.assets){
      $spotify.classList.remove("hidden");
      $song.textContent = spotify.details || "Unknown song";
      $artist.textContent = spotify.state || "";

      const artId = (spotify.assets.large_image || "").replace("spotify:", "");
      $albumArt.src = artId ? `https://i.scdn.co/image/${artId}` : "";

      const start = spotify.timestamps?.start ?? null;
      const end = spotify.timestamps?.end ?? null;
      if(start && end && end > start){
        if(spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
        const tick = () => {
          const now = Date.now();
          const elapsed = Math.max(0, now - start);
          const total = Math.max(1, end - start);
          const pct = Math.min(100, (elapsed / total) * 100);
          $progressBar.style.width = pct + "%";
          $timeCurrent.textContent = msToMMSS(elapsed);
          $timeTotal.textContent = msToMMSS(total);
        };
        tick();
        spotifyTicker = setInterval(tick, 1000);
      } else {
        $progressBar.style.width = "8%";
        $timeCurrent.textContent = "0:00";
        $timeTotal.textContent = "—";
        if(spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
      }
    } else {
      $spotify.classList.add("hidden");
      if(spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
    }

  }catch(err){
    console.error("Error fetching Lanyard:", err);
    $card.classList.remove("skeleton");
    $username.textContent = "Error";
    $statusText.textContent = "Could not reach Lanyard API";
  }
}

/* start polling */
fetchStatus();
setInterval(fetchStatus, POLL_MS);