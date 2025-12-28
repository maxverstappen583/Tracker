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

/* Best-effort badge mapping from common public_flags bits.
   Note: Discord's flags values may change; this is best-effort. */
function decodeBadges(flags){
  if(!flags) return [];
  const n = Number(flags);
  const badges = [];
  const mapping = [
    {bit:1, name:"Staff"},
    {bit:2, name:"Partner"},
    {bit:4, name:"HypeSquadEvents"},
    {bit:8, name:"Bug Hunter Level 1"},
    {bit:64, name:"HypeSquad Bravery"}, // etc - best-effort
    {bit:128, name:"House Brilliance"},
    {bit:256, name:"House Balance"},
    {bit:512, name:"Early Supporter"},
    {bit:1024, name:"Team User"},
    {bit:16384, name:"Bug Hunter Level 2"},
    {bit:65536, name:"Verified Bot Dev"},
    {bit:131072, name:"Certified Moderator"},
  ];
  for(const m of mapping){
    if((n & m.bit) === m.bit) badges.push(m.name);
  }
  return badges;
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

    // username + avatar + hero avatar
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

    // badges (best-effort)
    $badges.innerHTML = "";
    const flags = d.discord_user?.public_flags ?? d.discord_user?.flags ?? null;
    const badgeNames = flags ? decodeBadges(flags) : [];
    if(badgeNames.length){
      badgeNames.forEach(name => {
        const el = document.createElement("span");
        el.className = "badge";
        el.textContent = name;
        $badges.appendChild(el);
      });
    }

    // status
    const status = (d.discord_status || "offline").toLowerCase();
    $statusText.textContent = status === "online" ? "Online" : status === "idle" ? "Away" : status === "dnd" ? "Do not disturb" : "Offline";

    // avatar glow class (applies visual effect via CSS classes)
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