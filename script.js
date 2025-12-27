/* ---------- CONFIG ---------- */
/* Replace this with your Discord user ID (string) */
const userId = "1319292111325106296";

/* Poll interval (ms) */
const POLL_INTERVAL = 4000;

/* ---------- Helpers ---------- */
function safeGet(arr){ return Array.isArray(arr) ? arr : []; }
function padTime(n){ return String(n).padStart(2, "0"); }
function msToMMSS(ms){
  if(ms === null || ms === undefined) return "0:00";
  const s = Math.floor(Math.max(0, Math.floor(ms/1000)));
  const m = Math.floor(s/60);
  return `${m}:${padTime(s%60)}`;
}
function buildAvatarUrl(user){
  if(!user) return "";
  const id = user.id;
  const av = user.avatar;
  if(!av) return `https://cdn.discordapp.com/embed/avatars/${Number(id)%5}.png`;
  const isAnimated = av.startsWith("a_");
  const ext = isAnimated ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${av}.${ext}?size=512`;
}

/* persist lastOnline across reloads */
function saveLastOnline(ts){ try{ localStorage.setItem("lastOnline", String(ts)); }catch(e){} }
function loadLastOnline(){ try{ const v = localStorage.getItem("lastOnline"); return v ? Number(v) : null;}catch(e){ return null;} }

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

let lastOnline = loadLastOnline() || null;
let spotifyInterval = null;

/* ---------- Main update ---------- */
async function fetchLanyard(){
  try{
    const res = await fetch(`https://api.lanyard.rest/v1/users/${userId}`, { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if(!json.success){
      console.warn("Lanyard not monitoring:", json);
      $username.textContent = "Not monitored";
      $statusText.textContent = "Join Lanyard Discord and allow presence";
      $card.classList.remove("skeleton");
      return;
    }

    const d = json.data;
    $card.classList.remove("skeleton");
    $username.textContent = d.discord_user?.username || "Unknown";
    $avatar.src = buildAvatarUrl(d.discord_user);

    const status = (d.discord_status || "offline").toLowerCase();
    $statusText.textContent = status === "online" ? "Online" : status === "idle" ? "Away" : status === "dnd" ? "Do not disturb" : "Offline";

    $avatarWrap.className = `avatar-wrap avatar-wrap--${status}`;
    $statusDot.className = `status-dot status-${status}`;

    if(status !== "offline"){
      lastOnline = Date.now();
      saveLastOnline(lastOnline);
      $lastSeen.textContent = "Active now";
    } else {
      if(lastOnline){
        const diff = Date.now() - lastOnline;
        if(diff < 60_000) $lastSeen.textContent = "Last seen just now";
        else if(diff < 3_600_000) $lastSeen.textContent = `Last seen ${Math.floor(diff/60000)} min ago`;
        else if(diff < 86_400_000) $lastSeen.textContent = `Last seen ${Math.floor(diff/3600000)} hr ago`;
        else $lastSeen.textContent = `Last seen ${Math.floor(diff/86400000)} day(s) ago`;
      } else {
        $lastSeen.textContent = "Offline";
      }
    }

    const spotify = safeGet(d.activities).find(a => a.name === "Spotify");
    if(spotify && spotify.timestamps && spotify.assets){
      $spotify.classList.remove("hidden");
      $song.textContent = spotify.details || "Unknown song";
      $artist.textContent = spotify.state || "";
      const artId = (spotify.assets.large_image || "").replace("spotify:", "");
      $albumArt.src = artId ? `https://i.scdn.co/image/${artId}` : "";

      const start = spotify.timestamps.start || null;
      const end = spotify.timestamps.end || null;
      if(start && end && end > start){
        if(spotifyInterval) { clearInterval(spotifyInterval); spotifyInterval = null; }
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
        spotifyInterval = setInterval(tick, 1000);
      } else {
        $progressBar.style.width = "12%";
        $timeCurrent.textContent = "0:00";
        $timeTotal.textContent = "—";
        if(spotifyInterval) { clearInterval(spotifyInterval); spotifyInterval = null; }
      }
    } else {
      $spotify.classList.add("hidden");
      if(spotifyInterval){ clearInterval(spotifyInterval); spotifyInterval = null; }
    }

  }catch(err){
    console.error("Failed to fetch Lanyard:", err);
    $card.classList.remove("skeleton");
    $username.textContent = "Connection error";
    $statusText.textContent = "Could not reach Lanyard API";
  }
}

/* start polling */
fetchLanyard();
setInterval(fetchLanyard, POLL_INTERVAL);