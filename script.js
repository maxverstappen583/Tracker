/* ---------- script.js (updated) ----------
 - Handles Lanyard status + banner + badges (animated only when present)
 - Spotify improvements:
    * If Spotify timestamps pass the 'end' (repeat/loop), the progress wraps correctly
    * For very short songs the visible filled bar will never become invisible (min percent)
    * Progress bar color is sampled from the album art (dominant-ish color) when possible
 - Drop in to replace your existing script.js (keep same HTML/CSS)
*/

/* CONFIG */
const USER_ID = "1319292111325106296"; // <-- your Discord ID
const POLL_MS = 4000;

/* Helpers */
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

/* Badge defs (same as before) */
function badgeDefinitions() {
  return [
    { bit: 1, key: "staff", title: "Discord Staff", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
    { bit: 2, key: "partner", title: "Partner", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
    { bit: 4, key: "hypesquad_events", title: "HypeSquad Events", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`},
    { bit: 8, key: "bug_hunter", title: "Bug Hunter", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2a6 6 0 016 6v2h2v2h-2v2a6 6 0 01-6 6 6 6 0 01-6-6v-2H4v-2h2V8a6 6 0 016-6z"/></svg>`},
    { bit: 512, key: "early_supporter", title: "Early Supporter", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2l3 7h7l-5.6 4.1L20 22l-8-5-8 5 1.6-8.9L0 9h7l3-7z"/></svg>`},
    { bit: 16384, key: "bug_hunter_gold", title: "Bug Hunter (Gold)", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2a6 6 0 016 6v2h2v2h-2v2a6 6 0 01-6 6 6 6 0 01-6-6v-2H4v-2h2V8a6 6 0 016-6z"/></svg>`},
    { bit: 65536, key: "verified_bot_dev", title: "Verified Bot Developer", svg:
      `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2a3 3 0 013 3v1h3v2H6V6h3V5a3 3 0 013-3zM6 10h12v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8z"/></svg>`},
  ];
}

/* DOM refs (expected to exist in the page) */
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
const $contactBtn = document.getElementById("contactBtn");

let lastActive = null;
let spotifyTicker = null;

/* Animation helper */
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

/* Get dominant-ish color from image (averaging center region).
   Returns CSS rgb(...) string or null on failure. */
async function getDominantColorFromImageUrl(url) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = () => {
        try {
          // draw a small canvas and sample central area
          const w = 64, h = 64;
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          // draw image scaled to canvas
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          // average color but bias to center by sample fewer edge pixels
          let r = 0, g = 0, b = 0, count = 0;
          for (let y = 8; y < h - 8; y++) {
            for (let x = 8; x < w - 8; x++) {
              const i = (y * w + x) * 4;
              const alpha = data[i + 3];
              if (alpha === 0) continue;
              r += data[i]; g += data[i + 1]; b += data[i + 2];
              count++;
            }
          }
          if (!count) { resolve(null); return; }
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          resolve(`rgb(${r}, ${g}, ${b})`);
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      // If the image is already cached and loaded, onload will still fire.
    } catch (e) {
      resolve(null);
    }
  });
}

/* Main Fetch & Render */
async function fetchStatus() {
  try {
    const res = await fetch(`https://api.lanyard.rest/v1/users/${USER_ID}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();

    if (!json.success) {
      // not monitored
      $username.textContent = "Not monitored";
      $statusText.textContent = "Join the Lanyard Discord and allow presence";
      $card.classList.remove("skeleton");
      $badges.innerHTML = "";
      $badges.style.display = "none";
      return;
    }

    const d = json.data;
    $card.classList.remove("skeleton");

    // username + avatar
    $username.textContent = d.discord_user?.username || "Unknown";
    $avatar.src = buildAvatarUrl(d.discord_user);
    if ($heroAvatar) $heroAvatar.src = buildAvatarUrl(d.discord_user);

    // banner
    const bannerUrl = buildBannerUrl(d.discord_user);
    if (bannerUrl) {
      $bannerWrap.classList.remove("hidden");
      $bannerImg.src = bannerUrl;
    } else {
      $bannerWrap.classList.add("hidden");
      $bannerImg.src = "";
    }

    // Badges: show only if flags exist
    $badges.innerHTML = "";
    const rawFlags = (d.discord_user && (d.discord_user.public_flags ?? d.discord_user.flags)) ?? 0;
    const defs = badgeDefinitions();
    const found = defs.filter(def => (Number(rawFlags) & def.bit) === def.bit);

    if (!found.length) {
      $badges.style.display = "none"; // hide container
    } else {
      $badges.style.display = "flex";
      found.forEach((b, idx) => {
        const el = document.createElement("span");
        el.className = "badge-icon";
        el.setAttribute("title", b.title);
        el.innerHTML = b.svg;
        el.style.opacity = "0";
        el.style.transform = "scale(.6)";
        $badges.appendChild(el);
        setTimeout(() => popBadge(el), idx * 80);
      });
    }

    // status text
    const status = (d.discord_status || "offline").toLowerCase();
    $statusText.textContent =
      status === "online" ? "Online" :
      status === "idle" ? "Away" :
      status === "dnd" ? "Do not disturb" : "Offline";

    // avatar glow classes
    $avatarWrap.className = `avatar-wrap`;
    $avatarWrap.classList.add(`avatar-wrap--${status}`);

    // status dot
    $statusDot.className = `status-dot status-${status}`;

    // last seen logic
    if (status !== "offline") {
      lastActive = Date.now();
      $lastSeen.textContent = "Active now";
    } else {
      $lastSeen.textContent = lastActive ? `Offline for ${msToHuman(Date.now() - lastActive)}` : "Offline";
    }

    // contact button -> profile
    if ($contactBtn) $contactBtn.href = `https://discord.com/users/${USER_ID}`;

    // Spotify handling
    const activities = Array.isArray(d.activities) ? d.activities : [];
    const spotify = activities.find(a => a.name === "Spotify");
    if (spotify && spotify.assets) {
      $spotify.classList.remove("hidden");
      $song.textContent = spotify.details || "Unknown song";
      $artist.textContent = spotify.state || "";

      const artId = (spotify.assets.large_image || "").replace("spotify:", "");
      const artUrl = artId ? `https://i.scdn.co/image/${artId}` : "";

      // set album art
      $albumArt.src = artUrl;

      // try to extract a color from the album art to use for progress bar
      (async () => {
        const color = artUrl ? await getDominantColorFromImageUrl(artUrl) : null;
        if (color) {
          // set a two-stop gradient based on color
          $progressBar.style.background = `linear-gradient(90deg, ${color}, rgba(255,255,255,0.2))`;
        } else {
          // fallback gradient
          $progressBar.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
        }
      })();

      // timestamps
      const start = spotify.timestamps?.start ?? null;
      const end = spotify.timestamps?.end ?? null;

      if (start && end && end > start) {
        // clear old ticker
        if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }

        const total = end - start;
        const MIN_VISIBLE_PERCENT = 8; // ensures very short songs still show a visible bar

        const tick = () => {
          const now = Date.now();
          // If the current time has passed 'end', assume the track may have looped/repeated.
          // Wrap elapsed so it doesn't keep increasing beyond end. This makes the progress bar wrap.
          let rawElapsed = now - start;
          if (rawElapsed < 0) rawElapsed = 0;

          // compute elapsed modulo total so repeating songs wrap correctly
          let elapsed = rawElapsed;
          if (rawElapsed > total) {
            elapsed = rawElapsed % total;
          }

          // percent
          const pct = Math.min(100, (elapsed / total) * 100);
          const visiblePct = Math.max(pct, MIN_VISIBLE_PERCENT);

          // update UI
          $progressBar.style.width = `${visiblePct}%`;
          $timeCurrent.textContent = msToMMSS(elapsed);
          $timeTotal.textContent = msToMMSS(total);
        };

        // run immediately then every second
        tick();
        spotifyTicker = setInterval(tick, 1000);
      } else {
        // no timestamps -> static fallback
        $progressBar.style.width = "20%";
        $timeCurrent.textContent = "0:00";
        $timeTotal.textContent = "—";
        if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
      }
    } else {
      // hide spotify
      $spotify.classList.add("hidden");
      if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
      // reset progress bar style to default (so old gradient doesn't persist)
      $progressBar.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
      $progressBar.style.width = `0%`;
    }

  } catch (err) {
    console.error("Error fetching Lanyard:", err);
    $card.classList.remove("skeleton");
    $username.textContent = "Error";
    $statusText.textContent = "Could not reach Lanyard API";
    $badges.innerHTML = "";
    $badges.style.display = "none";
  }
}

/* start polling */
fetchStatus();
setInterval(fetchStatus, POLL_MS);