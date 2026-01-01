<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Max — Portfolio & Status</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>

  <main class="wrap">

    <!-- HERO -->
    <header class="hero">
      <h1 class="intro">Hello, I'm <span>Max</span></h1>
      <p class="subtitle">A developer specializing in software development</p>
    </header>

    <!-- ABOUT -->
    <section class="about section card">
      <h2 class="section-title">About Me</h2>
      <p class="about-text">
        I’m a Full Stack Developer with a strong focus on Python, passionate about building clean,
        efficient, and scalable web applications. I also work with HTML, CSS, and JavaScript.
      </p>

      <div class="skills">
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" alt="Python" loading="lazy">
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" alt="JS" loading="lazy">
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" alt="HTML" loading="lazy">
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" alt="CSS" loading="lazy">
      </div>
    </section>

    <!-- PROFILE / STATUS -->
    <section class="profile-section section card" id="profileCard">

      <div id="bannerWrap" class="banner-wrap hidden"><img id="bannerImg" alt="banner"></div>

      <div class="profile-inner">
        <div class="avatar-wrap">
          <img id="avatar" alt="avatar">
          <span id="statusDot" class="status-dot status-offline" aria-hidden="true"></span>
        </div>

        <div class="profile-meta">
          <div class="top-row">
            <h2 id="username" class="username">Loading…</h2>
            <div id="badges" class="badges" aria-hidden="true"></div>
          </div>

          <!-- first line status, second line last-seen -->
          <div class="status-box">
            <div id="statusText" class="status-text">—</div>
            <div id="lastSeen" class="last-seen hidden">—</div>
          </div>

          <div class="profile-buttons">
            <a id="contactBtn" class="btn contact" href="#" target="_blank" rel="noopener">Contact for Business</a>
          </div>
        </div>
      </div>

      <!-- Spotify -->
      <div id="spotify" class="spotify-card hidden" aria-live="polite">
        <img id="albumArt" class="spotify-art" alt="album art">
        <div class="spotify-info">
          <div class="song" id="song">—</div>
          <div class="artist muted" id="artist">—</div>

          <div class="progress-container" aria-hidden="true">
            <div id="progressFill" class="progress-fill"></div>
          </div>

          <div class="progress-time muted">
            <span id="timeCurrent">0:00</span>
            <span id="timeTotal">0:00</span>
          </div>
        </div>
      </div>

    </section>

    <!-- PROJECTS -->
    <section class="projects section">
      <h2 class="section-title">Projects</h2>

      <div class="project-card card">
        <div class="project-image-wrap">
          <img class="project-image" src="https://files.catbox.moe/mf3gcj.png" alt="Maxy">
        </div>
        <div class="project-content">
          <h3 class="project-title">Maxy</h3>
          <p class="project-desc">Maxy is a personal project focused on building a reliable and user-friendly platform designed to support and manage online communities efficiently.</p>
          <a class="btn view-bot" href="https://discord.com/oauth2/authorize?client_id=1408075564853493811" target="_blank" rel="noopener">View Bot</a>
        </div>
      </div>

      <div class="project-card card">
        <div class="project-image-wrap">
          <img class="project-image" src="https://files.catbox.moe/76zc28.png" alt="Max">
        </div>
        <div class="project-content">
          <h3 class="project-title">Max</h3>
          <p class="project-desc">Max is a discontinued project that explored efficient tools and structured platform design.</p>
        </div>
      </div>

    </section>
  </main>

  <script src="script.js" defer></script>
</body>
</html>