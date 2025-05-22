const socket = io();
const seatIds = ["seat-top-left", "seat-top-right", "seat-bottom-right", "seat-bottom-left"];

const CHIP_VALUES = [
  { value: 200, img: "black_chip.png" },
  { value: 100, img: "white_chip.png" },
  { value: 50, img: "yellow_chip.png" },
  { value: 25, img: "pink_chip.png" },
  { value: 10, img: "red_chip.png" },
  { value: 5, img: "green_chip.png" },
  { value: 1, img: "blue_chip.png" },
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

function renderChips(container, amount) {
  if (container) {
    container.innerHTML = "";

    let columnBuffer = []; // Temporarily hold up to 4 columns
    let columnsInRow = 0;
    let rowContainer = document.createElement("div");
    rowContainer.className = "chip-row";
    container.appendChild(rowContainer);

    for (const chip of CHIP_VALUES) {
      let count = Math.floor(amount / chip.value);
      amount %= chip.value;

      let fullStacks = Math.floor(count / 10);
      let remaining = count % 10;

      const createStack = (chipCount) => {
        const column = document.createElement("div");
        column.className = "chip-column";

        for (let j = 0; j < chipCount; j++) {
          const img = document.createElement("img");
          img.src = `/img/${chip.img}`;
          img.alt = chip.value;
          img.style.position = "absolute";
          img.style.top = `-${j * 5}px`; // 2px visible spacing
          img.style.zIndex = j + 1;
          img.style.width = "32px";
          img.style.height = "30px";
          column.appendChild(img);
        }

        // Add column to current row
        rowContainer.appendChild(column);
        columnsInRow++;

        // Start new row after 4 columns
        if (columnsInRow >= 4) {
          rowContainer = document.createElement("div");
          rowContainer.className = "chip-row";
          container.appendChild(rowContainer);
          columnsInRow = 0;
        }
      };

      for (let i = 0; i < fullStacks; i++) {
        createStack(10);
      }
      if (remaining > 0) {
        createStack(remaining);
      }
    }
  }
}

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

function playWinAnimation(seatId) {
  const seat = document.getElementById(seatId);
  if (!seat) return;

  seat.classList.add("win-animation");

  // Optional: remove animation class after it's done
  setTimeout(() => {
    seat.classList.remove("win-animation");
  }, 3000); // Match the total animation duration (1s x 3)
}

socket.on("winner_update", (data) => {
  const { name, description } = data;

  const winnerBanner = document.createElement("div");
  winnerBanner.className = "winner-banner";
  winnerBanner.innerText = `${name} wins with ${description}`;
  document.body.appendChild(winnerBanner);

  setTimeout(() => {
    winnerBanner.remove();
  }, 6000); // Show for 6 seconds

  // Match winner's name to a seat and trigger animation
  seatIds.forEach((seatId) => {
    const seatDiv = document.getElementById(seatId);
    const playerNameDiv = seatDiv.querySelector(".player-name");

    if (playerNameDiv && playerNameDiv.textContent === name) {
      playWinAnimation(seatId);
    }
  });
});

socket.on("players_update", (game) => {
  console.log(game.players);
  const mainpot = game.pots?.[0]?.amount ?? 0;
  document.getElementById("potDisplay").textContent = `Pot: $${mainpot}`;

  const potDisplay = document.getElementById("potChips");
  renderChips(potDisplay, mainpot);
  const cardContainer = document.getElementById("community-cards");
  cardContainer.innerHTML = "";

  game.state.community_card.forEach((card) => {
    const div = document.createElement("div");
    div.className = "card";
    div.textContent = card;
    cardContainer.appendChild(div);
  });

  seatIds.forEach((id, index) => {
    const seatDiv = document.getElementById(id);
    if (Array.isArray(game.players) && index >= 0 && index < game.players.length) {
      const player = game.players[index];

      const playerNameDiv = seatDiv.querySelector(".player-name");

      const dealerBadge = seatDiv.querySelector(".dealer");
      const sbBadge = seatDiv.querySelector(".small-blind");
      const bbBadge = seatDiv.querySelector(".big-blind");
      const balance = seatDiv.querySelector(".balance");

      if (player) {
        if (playerNameDiv) playerNameDiv.textContent = player.name;
        seatDiv.style.backgroundColor = player.isTurn ? "red" : "#1e5631";
        seatDiv.style.opacity = player.folded ? "0.4" : "1";

        // Update badges visibility
        dealerBadge.hidden = !player.isDealer;
        sbBadge.hidden = !player.isSmallBlind;
        bbBadge.hidden = !player.isBigBlind;
        balance.textContent = `$${player.balance}`;
        renderChips(seatDiv.querySelector(".chip-stack"), player.balance);
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
