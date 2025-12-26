const userId = "1319292111325106296"; // PUT YOUR ID HERE

let lastOnline = null;

function fmt(ms){
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  return `${m}:${String(s%60).padStart(2,"0")}`;
}

async function update(){
  const res = await fetch(`https://api.lanyard.rest/v1/users/${1319292111325106296}`);
  const { data } = await res.json();

  document.getElementById("card").classList.remove("skeleton");

  document.getElementById("username").textContent = data.discord_user.username;
  document.getElementById("avatar").src =
    `https://cdn.discordapp.com/avatars/${userId}/${data.discord_user.avatar}.png?size=256`;

  const status = data.discord_status;
  document.getElementById("status").className = `status ${status}`;
  document.getElementById("status").textContent = status.toUpperCase();
  document.querySelector(".avatar-wrapper").className = `avatar-wrapper ${status}`;

  if(status !== "offline"){
    lastOnline = Date.now();
    document.getElementById("lastSeen").textContent = "Online now";
  }else{
    document.getElementById("lastSeen").textContent =
      lastOnline ? `Last seen ${fmt(Date.now()-lastOnline)} ago` : "Offline";
  }

  const spotify = data.activities.find(a=>a.name==="Spotify");
  const sEl = document.getElementById("spotify");

  if(spotify){
    sEl.classList.remove("hidden");
    document.getElementById("song").textContent = spotify.details;
    document.getElementById("artist").textContent = spotify.state;
    document.getElementById("albumArt").src =
      `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:","")}`;

    const now = Date.now();
    const start = spotify.timestamps.start;
    const end = spotify.timestamps.end;
    document.getElementById("current").textContent = fmt(now-start);
    document.getElementById("end").textContent = fmt(end-start);
    document.getElementById("progress").style.width =
      `${Math.min(((now-start)/(end-start))*100,100)}%`;
  }else{
    sEl.classList.add("hidden");
  }
}

update();
setInterval(update, 4000);
