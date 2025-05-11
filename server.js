const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

function createShuffledDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ];
  let deck = [];

  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push(rank + suit);
    }
  }

  // Shuffle using Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function dealHands(game) {
  const deck = createShuffledDeck();
  game.deck = deck; // save for community cards later
  console.log("shuffle deck");
  for (let player of game.players) {
    player.hand = [deck.pop(), deck.pop()];
    io.to(player.id).emit("your_hand", player.hand); // send hand privately
  }
}

let games = {}; // sessionCode => { players: [...], state: {...} }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  console.log("All current games:", Object.keys(games));

  socket.on("table_rejoin_game", (code, callback) => {
    const game = games[code];
    for (const [gameCode, gameObj] of Object.entries(games)) {
      if (gameCode != code) {
        if (!gameObj.players || gameObj.players.length === 0) {
          console.log(`Cleaning up empty game: ${gameCode}`);
          delete games[gameCode];
        }
      }
    }

    if (!game) {
      console.log("failed");
      return callback({ success: false, message: `${code} Game not found` });
    }

    socket.join(code);
    console.log("nailed");
    callback({ success: true, message: "Rejoined successfully" });
  });

  socket.on("rejoin_game", (code, callback) => {
    const game = games[code];
    if (!game) {
      return callback({ success: false, message: "Game not found" });
    }

    const player = game.players.find((p) => p.id === socket.id);

    if (!player) {
      return callback({ success: false, message: "Player not found in game" });
    }

    socket.join(code);
    io.to(code).emit("players_update", game.players);
    callback({ success: true, message: "Rejoined successfully" });
  });

  socket.on("create_game", (callback) => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    games[code] = {
      players: [],
      deck: [],
      state: { pot: 0, currentTurnIndex: 0, community_card: [] },
    };
    console.log("All current games:", Object.keys(games));
    socket.join(code);
    callback(code);
  });

  socket.on("player_update_request", (code, callback) => {
    const game = games[code];
    if (!game) {
      return callback({ success: false, message: "Game not found" });
    }
    io.to(code).emit("players_update", game.players);
  });

  socket.on("join_game", (code, name, callback) => {
    const game = games[code];
    if (!game) {
      return callback({ success: false, message: "Game not found" });
    }

    if (game.players.length >= 4) {
      return callback({
        success: false,
        message: "Game is full (max 4 players)",
      });
    }

    const nameExists = game.players.some(
      (player) => player.name.toLowerCase() === name.toLowerCase()
    );

    if (nameExists) {
      return callback({ success: false, message: "Name already taken" });
    }

    game.players.push({
      id: socket.id,
      name,
      hand: [], // e.g., ['Ah', 'Ks']
      balance: 1000, // default starting chips
      folded: false, // for round tracking
    });
    socket.join(code);
    io.to(code).emit("players_update", game.players);
    callback({ success: true });
  });

  socket.on("start_game", (code) => {
    const game = games[code];
    if (game && game.players.length >= 2) {
      dealHands(game);
      game.state.currentTurnIndex = 0;
      const currentPlayer = game.players[game.state.currentTurnIndex];
      io.to(code).emit("turn_update", currentPlayer.id, game.players);
      console.log(players);
    }
  });

  socket.on("disconnect", () => {
    for (const code in games) {
      const game = games[code];
      const index = game.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        game.players.splice(index, 1);
        io.to(code).emit("players_update", game.players);
        break;
      }
    }
  });

  socket.on("player_action", ({ code, action }) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players[game.state.currentTurnIndex];
    if (socket.id !== currentPlayer.id) {
      socket.emit("error_message", "Not your turn!");
      return;
    }

    // Broadcast action
    io.to(code).emit("action_taken", { id: socket.id, action });

    // Advance turn
    let nextIndex = game.state.currentTurnIndex;
    const totalPlayers = game.players.length;

    do {
      nextIndex = (nextIndex + 1) % totalPlayers;
    } while (
      game.players[nextIndex].folded &&
      nextIndex !== game.state.currentTurnIndex
    );

    game.state.currentTurnIndex = nextIndex;
    const nextPlayer = game.players[nextIndex];
    io.to(code).emit("turn_update", nextPlayer.id, game.players);
  });
});

server.listen(3000, () =>
  console.log("Server running on http://localhost:3000")
);
