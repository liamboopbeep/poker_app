const socket = io();

//autofill code from URL query
const urlParams = new URLSearchParams(window.location.search);
const gameCodeFromUrl = urlParams.get("code");
if (gameCodeFromUrl) {
  document.getElementById("code").value = gameCodeFromUrl.toUpperCase();
}

function join() {
  const code = document.getElementById("code").value.toUpperCase();
  const name = document.getElementById("name").value.trim(); // trim removes whitespace

  if (name) {
    socket.emit("join_game", code, name, (response) => {
      if (response.success) {
        document.getElementById("actions").style.display = "block";
      } else {
        alert(response.message);
      }
    });
  } else {
    alert("Name cannot be empty.");
  }
}

socket.on("your_hand", (hand) => {
  const display = document.getElementById("handDisplay");
  document.getElementById("handBox").style.display = "block";
  display.textContent = hand.join("  ");
});

socket.on("players_update", (players) => {
  const me = players.find((player) => player.id === socket.id);
  const isMyTurn = me && me.isTurn;

  const actionsEl = document.getElementById("actions");
  actionsEl.style.display = isMyTurn ? "block" : "none";
});

function sendFold() {
  const code = document.getElementById("code").value.toUpperCase();
  socket.emit("player_fold", code);
}

function sendcallandcheck() {
  const code = document.getElementById("code").value.toUpperCase();
  socket.emit("player_callandcheck", code);
}
