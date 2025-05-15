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
      if (!response.success) {
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

socket.on("players_update", (players, gameState) => {
  const me = players.find((player) => player.id === socket.id);
  const isMyTurn = me && me.isTurn;

  const actionsEl = document.getElementById("actions");
  actionsEl.style.display = me ? "block" : "none";
  actionsEl.style.opacity = isMyTurn ? "1.0" : "0.4";

  const buttons = actionsEl.querySelectorAll("button");
  const checkbutton = actionsEl.querySelector(".check");
  buttons.forEach((btn) => {
    btn.disabled = !isMyTurn;
  });

  if (checkbutton && me && gameState.highestbet) {
    checkbutton.textContent = me.bet === gameState.highestbet ? "Check" : "Call";
  }

  if (me) {
    document.querySelector("#playerInfo .player-name").textContent = me.name;
    document.querySelector("#playerInfo .balance").textContent = `Balance: $${me.balance}`;
    document.querySelector("#playerInfo .dealer").hidden = !me.isDealer;
    document.querySelector("#playerInfo .small-blind").hidden = !me.isSmallBlind;
    document.querySelector("#playerInfo .big-blind").hidden = !me.isBigBlind;
  }
});

function sendFold() {
  const code = document.getElementById("code").value.toUpperCase();
  socket.emit("player_fold", code);
}

function sendcallandcheck() {
  const code = document.getElementById("code").value.toUpperCase();
  socket.emit("player_callandcheck", code);
}

function debug() {
  const code = document.getElementById("code").value.toUpperCase();
  socket.emit("debug", code, (response) => {
    console.log("DEBUG RESPONSE:", response);
  });
}

function showRaiseControls() {
  const raiseControls = document.getElementById("raiseControls");

  const minRaise = 4;
  const maxRaise = 1000;

  const slider = document.getElementById("raiseSlider");
  const input = document.getElementById("raiseInput");

  slider.min = minRaise;
  slider.max = maxRaise;
  slider.value = minRaise;

  input.min = minRaise;
  input.max = maxRaise;
  input.value = minRaise;

  raiseControls.style.display = "block";
}

function syncRaiseInput() {
  const slider = document.getElementById("raiseSlider");
  const input = document.getElementById("raiseInput");
  input.value = slider.value;
}

function syncRaiseSlider() {
  const slider = document.getElementById("raiseSlider");
  const input = document.getElementById("raiseInput");
  slider.value = input.value;
}

function sendRaise() {
  const code = document.getElementById("code").value.toUpperCase();
  const raiseAmount = parseInt(document.getElementById("raiseInput").value);
  socket.emit("player_raise", code, raiseAmount);
  document.getElementById("raiseControls").style.display = "none";
}
