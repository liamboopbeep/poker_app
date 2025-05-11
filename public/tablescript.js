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
        socket.emit("players_update_request", code, response);
        document.getElementById("gameCode").innerText = "Game Code: " + code;
        document.getElementById("joinLink").href = `/player.html?code=${code}`;
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
  });
}

function toggleDeckMode() {
  const usePhysical = document.getElementById("physicalDeckToggle").checked;
  document.getElementById("dealBtn").style.display = usePhysical
    ? "none"
    : "inline-block";
}

function startGame() {
  if (currentGameCode) {
    socket.emit("start_game", currentGameCode);
  }
}

socket.on("players_update", (players) => {
  seatIds.forEach((id, index) => {
    const seatDiv = document.getElementById(id);
    const player = players[index];
    seatDiv.textContent = player ? player.name : "";
    seatDiv.style.color = "white";
  });
});

socket.on("turn_update", (activeId, players) => {
  seatIds.forEach((id, index) => {
    const seatDiv = document.getElementById(id);
    const player = players[index];
    seatDiv.textContent = player ? player.name : "";
    seatDiv.style.color = player && player.isTurn ? "red" : "white";
  });
});
