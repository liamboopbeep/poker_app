const socket = io();
const seatIds = [
  "seat-top-left",
  "seat-top-right",
  "seat-bottom-left",
  "seat-bottom-right",
];

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
      seatDiv.textContent = "";
      seatDiv.style.color = "white";
      seatDiv.style.backgroundColor = "green";
    });
  });
}

function startGame() {
  if (currentGameCode) {
    socket.emit("start_game", currentGameCode);
  }
}

socket.on("players_update", (players) => {
  console.log(players);
  seatIds.forEach((id, index) => {
    const seatDiv = document.getElementById(id);
    const player = players[index];

    if (player) {
      seatDiv.textContent = player.name;
      seatDiv.style.backgroundColor = player.isTurn ? "red" : "#1e5631";
      seatDiv.style.opacity = player.folded ? "0.4" : "1";
    } else {
      seatDiv.textContent = "";
      seatDiv.style.backgroundColor = "#1e5631";
      seatDiv.style.opacity = "1";
    }
  });
});
