/* ---------- CONFIG ---------- */
/* Replace USER_ID if needed */
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

/* ---------- DOM refs ---------- */
const $card = document.getElementById("card");
const $username = document.getElementById("username");
const $avatar = document.getElementById("avatar");
const $avatarWrap = document.getElementById("avatarWrap");
const $statusText = document.getElementById("statusText");
const $lastSeen = document.getElementById("lastSeen");
const $statusDot = document.getElementById("statusDot");

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
    $username.textContent = d.discord_user?.username || "Unknown";
    $avatar.src = buildAvatarUrl(d.discord_user);

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

/* start */
fetchStatus();
setInterval(fetchStatus, POLL_MS);