const socket = io();
const seatIds = ["seat-top-left", "seat-top-right", "seat-bottom-right", "seat-bottom-left"];

let currentGameCode = null;

window.addEventListener("load", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  if (code) {
    socket.emit("table_rejoin_game", code, (response) => {
      if (response.success) {
        alert(response.message);
        socket.emit("players_update_request", code);
        document.getElementById("gameCode").innerText = "Game Code: " + code;
        document.getElementById("joinLink").href = `/player.html?code=${code}`;
      } else {
        document.getElementById("gameCode").innerText = "Game Code: " + code;
        document.getElementById("joinLink").href = `/player.html?code=${code}`;
        alert(response.message);
      }
    });
  }
});

function createGame() {
  socket.emit("create_game", (code) => {
    document.getElementById("gameCode").innerText = "Game Code: " + code;
    document.getElementById("joinLink").href = `/player.html?code=${code}`;
    currentGameCode = code;
    const newUrl = `${window.location.pathname}?code=${code}`;
    window.history.pushState({}, "", newUrl);
    seatIds.forEach((id) => {
      const seatDiv = document.getElementById(id);

      const playerNameDiv = seatDiv.querySelector(".player-name");
      if (playerNameDiv) playerNameDiv.textContent = "";

      seatDiv.style.color = "white";
      seatDiv.style.backgroundColor = "1e5631";
      seatDiv.style.opacity = "1";

      seatDiv.querySelectorAll(".badge").forEach((badge) => {
        badge.hidden = true;
      });
    });
  });
}

function startGame() {
  if (currentGameCode) {
    socket.emit("start_game", currentGameCode);
  }
}

socket.on("players_update", (game) => {
  console.log(game.players);
  const mainpot = game.pots?.[0]?.amount ?? 0;
  document.getElementById("potDisplay").textContent = `Pot: $${mainpot}`;

  seatIds.forEach((id, index) => {
    const seatDiv = document.getElementById(id);
    if (Array.isArray(game.players) && index >= 0 && index < game.players.length) {
      const player = game.players[index];

      const playerNameDiv = seatDiv.querySelector(".player-name");

      const dealerBadge = seatDiv.querySelector(".dealer");
      const sbBadge = seatDiv.querySelector(".small-blind");
      const bbBadge = seatDiv.querySelector(".big-blind");

      if (player) {
        if (playerNameDiv) playerNameDiv.textContent = player.name;
        seatDiv.style.backgroundColor = player.isTurn ? "red" : "#1e5631";
        seatDiv.style.opacity = player.folded ? "0.4" : "1";

        // Update badges visibility
        dealerBadge.hidden = !player.isDealer;
        sbBadge.hidden = !player.isSmallBlind;
        bbBadge.hidden = !player.isBigBlind;
      } else {
        // Reset seat
        if (playerNameDiv) playerNameDiv.textContent = "";
        seatDiv.style.backgroundColor = "#1e5631";
        seatDiv.style.opacity = "1";

        // Hide all badges
        dealerBadge.hidden = true;
        sbBadge.hidden = true;
        bbBadge.hidden = true;
      }
    }
  });
});
