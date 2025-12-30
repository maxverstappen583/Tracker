/* script_ws.js
   Lanyard WebSocket client with robust Spotify update handling.
   - Forces Spotify refresh when song, artist, timestamps.start or album art change.
   - Transition-based status text behavior (show once, then hide).
   - Last seen updates while offline.
   - Reconnect/backoff behavior.
   - Defensive DOM handling.
*/

(() => {
  const USER_ID = "1319292111325106296";
  const SOCKET_URL = "wss://api.lanyard.rest/socket";

  // state
  let ws = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let lastStatus = null;
  let lastOnlineTimestamp = null;
  let lastSeenInterval = null;
  let lastSeenHideTimer = null;
  let spotifyTicker = null;
  let lastSpotifySignature = null;

  // DOM refs (set on ready)
  let $statusText, $lastSeen, $statusDot, $avatar, $heroAvatar, $username, $contactBtn, $badges, $bannerWrap, $bannerImg;
  let $spotifyBox, $song, $artist, $albumArt, $progressFill, $timeCur, $timeTot;

  // helper to query id
  const $ = id => document.getElementById(id);

  // Wait for DOM ready then init
  function onReady() {
    // set refs
    $statusText = $("statusText");
    $lastSeen   = $("lastSeen");
    $statusDot  = $("statusDot");
    $avatar     = $("avatar");
    $heroAvatar = $("heroAvatar");
    $username   = $("username");
    $contactBtn = $("contactBtn");
    $badges     = $("badges");
    $bannerWrap = $("bannerWrap");
    $bannerImg  = $("bannerImg");

    $spotifyBox = $("spotify");
    $song       = $("song");
    $artist     = $("artist");
    $albumArt   = $("albumArt");
    $progressFill = $("progressFill");
    $timeCur    = $("timeCurrent");
    $timeTot    = $("timeTotal");

    // defensive: always remove loading so UI won't stick
    document.body.classList.remove("loading");
    setTimeout(() => document.body.classList.remove("loading"), 3000);

    connect();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady);
  else onReady();

  /* ---------- small UI helpers ---------- */
  function setTextNoFade(el, t) {
    if (!el) return;
    el.textContent = t;
  }

  function setTextFade(el, t) {
    if (!el) return Promise.resolve();
    el._fadeToken = (el._fadeToken || 0) + 1;
    const token = el._fadeToken;
    if (el.textContent === t) { el.classList.remove("fade-out"); return Promise.resolve(); }
    return new Promise(resolve => {
      el.classList.add("fade-out");
      setTimeout(() => {
        if (el._fadeToken !== token) return resolve();
        el.textContent = t;
        el.classList.remove("fade-out");
        setTimeout(() => { if (el._fadeToken !== token) return resolve(); resolve(); }, 380);
      }, 220);
    });
  }

  function msToHumanShort(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  function msToMMSS(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  }

  function setStatusDot(status) {
    if (!$statusDot) return;
    const allowed = ["online","idle","dnd","offline"];
    const cls = allowed.includes(status) ? status : "offline";
    $statusDot.className = `status-dot status-${cls}`;
  }

  /* ---------- badge rendering (simple) ---------- */
  function badgeDefs() {
    return [
      {bit:1, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 15 9l7 .6-5 4 1 7L12 17 6.9 18 8 11l-5-4 7-.6L12 2z"/></svg>`},
      {bit:2, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6 6.6.6-4.8 3.9 1.2 6.5L12 17l-7.9 2 1.2-6.5L.5 8.6l6.6-.6L12 2z"/></svg>`},
      {bit:4, svg:`<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l9 4-9 4-9-4 9-4zm0 12l9 4-9 4-9-4 9-4z"/></svg>`}
    ];
  }
  function renderBadges(user) {
    if (!$badges) return;
    $badges.innerHTML = "";
    const flags = (user && (user.public_flags ?? user.flags)) ?? 0;
    const defs = badgeDefs();
    const found = defs.filter(d => (Number(flags) & d.bit) === d.bit);
    if (!found.length) { $badges.style.display = "none"; return; }
    $badges.style.display = "flex";
    found.forEach((b,i) => {
      const s = document.createElement("span");
      s.className = "badge-icon";
      s.innerHTML = b.svg;
      $badges.appendChild(s);
      setTimeout(()=>s.classList.add("show"), i*90);
    });
  }

  function buildAvatar(user) {
    if (!user) return "";
    if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.id || USER_ID) % 5}.png`;
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=512`;
  }
  function buildBanner(user) {
    if (!user) return "";
    if (!user.banner) return "";
    const ext = user.banner.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=1024`;
  }

  /* ---------- last seen ---------- */
  function startLastSeenInterval() {
    stopLastSeenInterval();
    if (!$lastSeen) return;
    if (!lastOnlineTimestamp) setTextNoFade($lastSeen, "Last seen unknown");
    else setTextNoFade($lastSeen, `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
    lastSeenInterval = setInterval(() => {
      if (!lastOnlineTimestamp) return;
      setTextNoFade($lastSeen, `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
    }, 1000);
  }
  function stopLastSeenInterval() {
    if (lastSeenInterval) { clearInterval(lastSeenInterval); lastSeenInterval = null; }
  }
  function hideLastSeenInstant() {
    if (!$lastSeen) return;
    $lastSeen.classList.add("fade-out");
    setTimeout(()=>{ if (!$lastSeen) return; $lastSeen.classList.add("hidden"); }, 380);
  }

  /* ---------- album color sampling ---------- */
  async function sampleColor(url) {
    if (!url) return null;
    return new Promise(resolve => {
      try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        img.onload = () => {
          try {
            const W = 48, H = 48;
            const canvas = document.createElement("canvas");
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, W, H);
            const data = ctx.getImageData(0,0,W,H).data;
            let r=0,g=0,b=0,c=0;
            for (let y=8;y<40;y++){
              for (let x=8;x<40;x++){
                const i = (y*W + x) * 4;
                const a = data[i+3];
                if (a === 0) continue;
                r += data[i]; g += data[i+1]; b += data[i+2]; c++;
              }
            }
            if (!c) return resolve(null);
            resolve(`rgb(${Math.round(r/c)}, ${Math.round(g/c)}, ${Math.round(b/c)})`);
          } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  /* ---------- spotify rendering (signature-based refresh) ---------- */
  async function renderSpotify(spotify) {
    // clear existing ticker
    if (spotifyTicker) { clearInterval(spotifyTicker); spotifyTicker = null; }

    if (!spotify) {
      lastSpotifySignature = null;
      if ($spotifyBox) $spotifyBox.classList.add("hidden");
      if ($progressFill) { $progressFill.style.width = "0%"; $progressFill.style.background = ""; }
      if ($timeCur) $timeCur.textContent = "0:00";
      if ($timeTot) $timeTot.textContent = "0:00";
      return;
    }

    // build a reliable signature using the parts that matter
    const trackId = spotify.track_id ?? spotify.sync_id ?? spotify.party?.id ?? spotify.id ?? null;
    const song = spotify.song ?? spotify.details ?? "";
    const artist = spotify.artist ?? spotify.state ?? "";
    const start = spotify.timestamps?.start ?? null;
    const albumArtUrl = spotify.album_art_url ?? (spotify.assets?.large_image ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:","")}` : "") || "";

    const signature = JSON.stringify({ trackId, song, artist, start, albumArtUrl });

    // if signature unchanged, still update progress (in case timestamps moved) but we avoid reloading art/title repeatedly
    const isNew = signature !== lastSpotifySignature;
    lastSpotifySignature = signature;

    // update UI fields (title/artist/art) on new signature
    if ($spotifyBox) $spotifyBox.classList.remove("hidden");
    if ($song) $song.textContent = song || "";
    if ($artist) $artist.textContent = artist || "";

    if ($albumArt) {
      if (albumArtUrl) {
        // add cache-buster
        $albumArt.crossOrigin = "Anonymous";
        $albumArt.src = `${albumArtUrl}${albumArtUrl.includes('?') ? '&' : '?'}_=${Date.now()}`;
      } else {
        $albumArt.src = "";
      }
    }

    // set progress fill color from album art (async)
    (async () => {
      if (!$progressFill) return;
      const col = await sampleColor(albumArtUrl);
      if (col) $progressFill.style.background = `linear-gradient(90deg, ${col}, rgba(255,255,255,0.18))`;
      else $progressFill.style.background = `linear-gradient(90deg,#1db954,#6be38b)`;
    })();

    // handle timestamps
    const end = spotify.timestamps?.end ?? null;
    const startTs = start;

    if (startTs && end && end > startTs && $progressFill) {
      const total = end - startTs;
      const MIN = 8;
      const tick = () => {
        const now = Date.now();
        let raw = now - startTs;
        if (raw < 0) raw = 0;
        // if song loops, raw % total will loop
        let elapsed = (total > 0) ? (raw % total) : raw;
        if (elapsed < 0) elapsed = 0;
        const pct = (elapsed / total) * 100;
        const visible = Math.max(pct, MIN);
        $progressFill.style.width = `${visible}%`;
        if ($timeCur) $timeCur.textContent = msToMMSS(elapsed);
        if ($timeTot) $timeTot.textContent = msToMMSS(total);
      };
      tick();
      spotifyTicker = setInterval(tick, 1000);
    } else {
      // fallback small static bar
      if ($progressFill) $progressFill.style.width = "20%";
      if ($timeCur) $timeCur.textContent = "0:00";
      if ($timeTot) $timeTot.textContent = "—";
    }
  }

  /* ---------- presence update handler ---------- */
  async function handlePresence(data) {
    try {
      // discord_user meta
      if (data.discord_user) {
        const u = data.discord_user;
        if ($username) setTextNoFade($username, u.global_name || u.username || "Unknown");
        const avatarUrl = buildAvatar(u);
        if ($avatar) $avatar.src = avatarUrl;
        if ($heroAvatar) $heroAvatar.src = avatarUrl;
        const bannerUrl = buildBanner(u);
        if ($bannerWrap && $bannerImg) {
          if (bannerUrl) { $bannerWrap.classList.remove("hidden"); $bannerImg.src = bannerUrl; }
          else { $bannerWrap.classList.add("hidden"); $bannerImg.src = ""; }
        }
        renderBadges(u);
      }

      const rawStatus = (data.discord_status || "offline").toLowerCase();
      const status = rawStatus === "invisible" ? "offline" : rawStatus;

      // update last online when seen active
      if (status !== "offline") lastOnlineTimestamp = Date.now();

      const labelMap = { online: "Online", idle: "Away", dnd: "Do not disturb", offline: "Offline" };
      const label = labelMap[status] ?? status;

      if ($statusText) await setTextFade($statusText, label);

      // transition logic:
      // - when switching to online/idle/dnd: show once ('Active now'/'Away now'/'Do not disturb'), fade out and keep hidden while status unchanged
      // - when switching to offline: show 'Last seen X ago' and start timer
      if (status === "online" && lastStatus !== "online") {
        stopLastSeenInterval();
        if ($lastSeen) { $lastSeen.classList.remove("hidden"); $lastSeen.classList.remove("fade-out"); }
        if ($lastSeen) await setTextFade($lastSeen, "Active now");
        if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer);
        lastSeenHideTimer = setTimeout(()=>{ hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

      } else if (status === "online" && lastStatus === "online") {
        stopLastSeenInterval();
        if ($lastSeen && !$lastSeen.classList.contains("hidden")) hideLastSeenInstant();

      } else if (status === "idle" && lastStatus !== "idle") {
        stopLastSeenInterval();
        if ($lastSeen) { $lastSeen.classList.remove("hidden"); $lastSeen.classList.remove("fade-out"); }
        if ($lastSeen) await setTextFade($lastSeen, "Away now");
        if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer);
        lastSeenHideTimer = setTimeout(()=>{ hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

      } else if (status === "idle" && lastStatus === "idle") {
        stopLastSeenInterval();
        if ($lastSeen && !$lastSeen.classList.contains("hidden")) hideLastSeenInstant();

      } else if (status === "dnd" && lastStatus !== "dnd") {
        stopLastSeenInterval();
        if ($lastSeen) { $lastSeen.classList.remove("hidden"); $lastSeen.classList.remove("fade-out"); }
        if ($lastSeen) await setTextFade($lastSeen, "Do not disturb");
        if (lastSeenHideTimer) clearTimeout(lastSeenHideTimer);
        lastSeenHideTimer = setTimeout(()=>{ hideLastSeenInstant(); lastSeenHideTimer = null; }, 1500);

      } else if (status === "dnd" && lastStatus === "dnd") {
        stopLastSeenInterval();
        if ($lastSeen && !$lastSeen.classList.contains("hidden")) hideLastSeenInstant();

      } else if (status === "offline" && lastStatus !== "offline") {
        if ($lastSeen) { $lastSeen.classList.remove("hidden"); $lastSeen.classList.remove("fade-out"); }
        if (!lastOnlineTimestamp) setTextNoFade($lastSeen, "Last seen unknown");
        else setTextNoFade($lastSeen, `Last seen ${msToHumanShort(Date.now() - lastOnlineTimestamp)} ago`);
        startLastSeenInterval();

      } else {
        // no transition
        if (status === "offline") {
          if (!lastSeenInterval) startLastSeenInterval();
        } else {
          stopLastSeenInterval();
        }
      }

      setStatusDot(status);

      if ($contactBtn) $contactBtn.href = `https://discord.com/users/${USER_ID}`;

      // spotify data: prefer top-level data.spotify if present
      const spotify = data.spotify || (Array.isArray(data.activities) ? data.activities.find(a => a.name === "Spotify") : null);
      await renderSpotify(spotify);

      lastStatus = status;
      document.body.classList.remove("loading");
    } catch (e) {
      console.error("handlePresence error", e);
      document.body.classList.remove("loading");
    }
  }

  /* ---------- websocket connect & recon ---------- */
  function connect() {
    try {
      if (ws) { try { ws.close(); } catch(e) {} ws = null; }
      if (!("WebSocket" in window)) {
        console.warn("WebSocket not supported in this environment.");
        document.body.classList.remove("loading");
        return;
      }

      ws = new WebSocket(SOCKET_URL);

      ws.onopen = () => {
        reconnectDelay = 1000;
        try { ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: USER_ID } })); } catch(e){ console.error("subscribe error", e); }
        // console.info("WS open, subscribed", USER_ID);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (!msg || !msg.d) return;
          handlePresence(msg.d);
        } catch (e) {
          console.error("WS message parse error", e);
        }
      };

      ws.onclose = (ev) => {
        // console.warn("WS closed", ev.code, ev.reason);
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error("WS error", err);
        try { ws.close(); } catch(e) {}
      };
    } catch (e) {
      console.error("connect error", e);
      document.body.classList.remove("loading");
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(Math.round(reconnectDelay * 1.5), 30000);
      connect();
    }, reconnectDelay);
  }

})();
