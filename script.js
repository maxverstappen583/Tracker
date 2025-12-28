/* ---------- script.js (full file) ----------
   Shows Lanyard-powered Discord status, banner, badges (animated only when present),
   Spotify mini-card, last-seen timer. Drop this in place of your existing script.js.
*/

/* ---------- CONFIG ---------- */
const USER_ID = "1319292111325106296"; // <-- your Discord ID
const POLL_MS = 4000;

/* ---------- small helpers ---------- */
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

/* ---------- badge definitions (bit -> svg) ----------
   Keep this list as a small set of common badges. We will show badges
   only if the account actually has the corresponding bits in public_flags/flags.
*/
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
const $contactBtn = document.getElementById("contactBtn");

let lastActive = null;
let spotifyTicker = null;

/* ---------- animate helper (Web Animations API) ---------- */
function popBadge(node) {
  // animate scale & fade in; returns the Animation object
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
    // fallback: apply final style
    node.style.transform = "scale(1)";
    node.style.opacity = "1";
    return null;
  }
}

/* ---------- main Lanyard fetch & render ---------- */
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
      // hide badges if present
      $badges.innerHTML = "";
      $badges.style.display = "none";
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
    if (bannerUrl) {
      $bannerWrap.classList.remove("hidden");
      $bannerImg.src = bannerUrl;
    } else {
      $bannerWrap.classList.add("hidden");
      $bannerImg.src = "";
    }

    // BADGES: only show when actual flags exist
    // Discord can expose flags under public_flags or flags (try both)
    const rawFlags = (d.discord_user && (d.discord_user.public_flags ?? d.discord_user.flags)) ?? 0;
    const defs = badgeDefinitions();
    const found = defs.filter(def => (Number(rawFlags) & def.bit) === def.bit);

    $badges.innerHTML = "";
    if (!found.length) {
      // no badges: hide the container (so nothing shows)
      $badges.style.display = "none";
    } else {
      $badges.style.display = "flex";
      // append badges and animate them individually in sequence
      found.forEach((b, idx) => {
        const el = document.createElement("span");
        el.className = "badge-icon";
        el.setAttribute("title", b.title);
        // svg uses currentColor; style via CSS (.badge-icon svg { fill: ... } )
        el.innerHTML = b.svg;
        // start invisible for animation
        el.style.opacity = "0";
        el.style.transform = "scale(.6)";
        $badges.appendChild(el);

        // staggered pop animation
        const delay = idx * 80; // ms
        setTimeout(() => popBadge(el), delay);
      });
    }

    // status
    const status = (d.discord_status || "offline").toLowerCase();
    $statusText.textContent =
      status === "online" ? "Online" :
      status === "idle" ? "Away" :
      status === "dnd" ? "Do not disturb" : "Offline";

    // avatar glow class
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

    // contact button -> discord profile
    if ($contactBtn) $contactBtn.href = `https://discord.com/users/${USER_ID}`;

    // Spotify handling
    const activities = Array.isArray(d.activities) ? d.activities : [];
    const spotify = activities.find(a => a.name === "Spotify");
    if (spotify && spotify.assets) {
      $spotify.classList.remove("hidden");
      $song.textContent = spotify.details || "Unknown song";
      $artist.textContent = spotify.state || "";

      const artId = (spotify.assets.large_image || "").replace("spotify:", "");
      $albumArt.src = artId ? `https://i.scdn.co/image/${artId}` : "";

      const start = spotify.timestamps?.start ?? null;
      const end = spotify.timestamps?.end ?? null;
      if (start && end && end > start) {
        if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
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
        if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
      }
    } else {
      $spotify.classList.add("hidden");
      if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }
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