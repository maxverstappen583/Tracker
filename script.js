/* script.js - Lanyard + Spotify + badges (drop-in replacement)
   USER_ID must be your Discord ID string.
*/
const USER_ID = "1319292111325106296";
const POLL_MS = 4000;

/* small helpers */
function msToHuman(ms) {
  if (ms == null) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
function msToMMSS(ms) {
  if (ms == null) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
function buildAvatarUrl(user) {
  if (!user) return "";
  const id = user.id;
  const av = user.avatar;
  if (!av) return `https://cdn.discordapp.com/embed/avatars/${Number(id) % 5}.png`;
  const isAnim = av.startsWith("a_");
  const ext = isAnim ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${av}.${ext}?size=512`;
}
function buildBannerUrl(user) {
  if (!user) return "";
  const id = user.id;
  const banner = user.banner;
  if (!banner) return "";
  const isAnim = banner.startsWith("a_");
  const ext = isAnim ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${id}/${banner}.${ext}?size=1024`;
}

/* badge defs (bit -> svg) */
function badgeDefinitions() {
  return [
    { bit: 1, title: "Discord Staff", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>` },
    { bit: 2, title: "Partner", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>` },
    { bit: 4, title: "HypeSquad Events", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>` },
    { bit: 8, title: "Bug Hunter", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2a6 6 0 016 6v2h2v2h-2v2a6 6 0 01-6 6 6 6 0 01-6-6v-2H4v-2h2V8a6 6 0 016-6z"/></svg>` },
    { bit: 512, title: "Early Supporter", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2l3 7h7l-5.6 4.1L20 22l-8-5-8 5 1.6-8.9L0 9h7l3-7z"/></svg>` },
    { bit: 16384, title: "Bug Hunter (Gold)", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2a6 6 0 016 6v2h2v2h-2v2a6 6 0 01-6 6 6 6 0 01-6-6v-2H4v-2h2V8a6 6 0 016-6z"/></svg>` },
    { bit: 65536, title: "Verified Bot Developer", svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2a3 3 0 013 3v1h3v2H6V6h3V5a3 3 0 013-3zM6 10h12v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8z"/></svg>` },
  ];
}

/* DOM refs */
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
const $progressFill = document.getElementById("progressFill");
const $timeCurrent = document.getElementById("timeCurrent");
const $timeTotal = document.getElementById("timeTotal");
const $contactBtn = document.getElementById("contactBtn");

let lastActive = null;
let spotifyTicker = null;

/* animation helper */
function popBadge(node) {
  try {
    return node.animate(
      [
        { transform: "scale(.6)", opacity: 0 },
        { transform: "scale(1.05)", opacity: 1, offset: 0.75 },
        { transform: "scale(1)", opacity: 1 }
      ],
      { duration: 380, easing: "cubic-bezier(.2,.85,.25,1)", fill: "forwards" }
    );
  } catch (e) {
    node.style.transform = "scale(1)";
    node.style.opacity = "1";
    return null;
  }
}

/* sample dominant color from image by drawing to canvas (center area) */
async function getDominantColorFromImageUrl(url) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = () => {
        try {
          const w = 64, h = 64;
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d', { willReadFrequently: true });
        } catch(e) {
          // some browsers require different context options; fallback:
        }
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 64; canvas.height = 64;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, 64, 64);
          const data = ctx.getImageData(0, 0, 64, 64).data;
          let r=0,g=0,b=0,count=0;
          for (let y = 8; y < 56; y++) {
            for (let x = 8; x < 56; x++) {
              const i = (y * 64 + x) * 4;
              const a = data[i+3];
              if (a === 0) continue;
              r += data[i]; g += data[i+1]; b += data[i+2]; count++;
            }
          }
          if (!count) { resolve(null); return; }
          r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
          resolve(`rgb(${r}, ${g}, ${b})`);
        } catch (err) { resolve(null); }
      };
      img.onerror = () => resolve(null);
    } catch (err) { resolve(null); }
  });
}

/* main fetch/render loop */
async function fetchStatus() {
  try {
    const res = await fetch(`https://api.lanyard.rest/v1/users/${USER_ID}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    if (!json.success) {
      $username.textContent = "Not monitored";
      $statusText.textContent = "Join the Lanyard Discord and allow presence";
      $card.classList.remove("skeleton");
      $badges.innerHTML = ""; $badges.style.display = "none";
      return;
    }

    const d = json.data;
    $card.classList.remove("skeleton");

    // username + avatars
    $username.textContent = d.discord_user?.username || "Unknown";
    $avatar.src = buildAvatarUrl(d.discord_user);
    if ($heroAvatar) $heroAvatar.src = buildAvatarUrl(d.discord_user);

    // banner
    const bannerUrl = buildBannerUrl(d.discord_user);
    if (bannerUrl) { $bannerWrap.classList.remove("hidden"); $bannerImg.src = bannerUrl; }
    else { $bannerWrap.classList.add("hidden"); $bannerImg.src = ""; }

    // badges: show only if actual flags exist
    $badges.innerHTML = "";
    const rawFlags = (d.discord_user && (d.discord_user.public_flags ?? d.discord_user.flags)) ?? 0;
    const defs = badgeDefinitions();
    const found = defs.filter(def => (Number(rawFlags) & def.bit) === def.bit);
    if (!found.length) {
      $badges.style.display = "none";
    } else {
      $badges.style.display = "flex";
      found.forEach((b, idx) => {
        const el = document.createElement("span");
        el.className = "badge-icon";
        el.title = b.title;
        el.innerHTML = b.svg;
        el.style.opacity = "0"; el.style.transform = "scale(.6)";
        $badges.appendChild(el);
        setTimeout(() => popBadge(el), idx * 90);
      });
    }

    // status text
    const status = (d.discord_status || "offline").toLowerCase();
    $statusText.textContent = status === "online" ? "Online" : status === "idle" ? "Away" : status === "dnd" ? "Do not disturb" : "Offline";

    // avatar glow class
    $avatarWrap.className = `avatar-wrap`;
    $avatarWrap.classList.add(`avatar-wrap--${status}`);

    // status dot
    $statusDot.className = `status-dot status-${status}`;

    // last seen
    if (status !== "offline") { lastActive = Date.now(); $lastSeen.textContent = "Active now"; }
    else { $lastSeen.textContent = lastActive ? `Offline for ${msToHuman(Date.now() - lastActive)}` : "Offline"; }

    // contact button -> profile
    if ($contactBtn) $contactBtn.href = `https://discord.com/users/${USER_ID}`;

    // Spotify
    const activities = Array.isArray(d.activities) ? d.activities : [];
    const spotify = activities.find(a => a.name === "Spotify");
    if (spotify && spotify.assets) {
      $spotify.classList.remove("hidden");
      $song.textContent = spotify.details || "Unknown song";
      $artist.textContent = spotify.state || "";

      const artId = (spotify.assets.large_image || "").replace("spotify:", "");
      const artUrl = artId ? `https://i.scdn.co/image/${artId}` : "";
      $albumArt.src = artUrl;

      // color sampling + apply to progress fill bg
      (async () => {
        const color = artUrl ? await getDominantColorFromImageUrl(artUrl) : null;
        if (color) {
          $progressFill.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.18))`;
        } else {
          $progressFill.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
        }
      })();

      const start = spotify.timestamps?.start ?? null;
      const end = spotify.timestamps?.end ?? null;

      if (start && end && end > start) {
        if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
        const total = end - start;
        const MIN_VISIBLE_PERCENT = 8;

        const tick = () => {
          const now = Date.now();
          let rawElapsed = now - start;
          if (rawElapsed < 0) rawElapsed = 0;

          // wrap for songs that repeat/loop by modulo
          let elapsed = rawElapsed;
          if (rawElapsed > total) elapsed = rawElapsed % total;

          let pct = (elapsed / total) * 100;
          const visiblePct = Math.max(pct, MIN_VISIBLE_PERCENT);

          // update only the FILL
          $progressFill.style.width = `${visiblePct}%`;

          $timeCurrent.textContent = msToMMSS(elapsed);
          $timeTotal.textContent = msToMMSS(total);
        };

        tick();
        spotifyTicker = setInterval(tick, 1000);
      } else {
        $progressFill.style.width = "20%";
        $timeCurrent.textContent = "0:00";
        $timeTotal.textContent = "—";
        if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
      }
    } else {
      $spotify.classList.add("hidden");
      if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
      $progressFill.style.width = `0%`;
      $progressFill.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
    }

  } catch (err) {
    console.error("Error fetching Lanyard:", err);
    $card.classList.remove("skeleton");
    $username.textContent = "Error";
    $statusText.textContent = "Could not reach Lanyard API";
    $badges.innerHTML = ""; $badges.style.display = "none";
  }
}

/* start */
fetchStatus();
setInterval(fetchStatus, POLL_MS);