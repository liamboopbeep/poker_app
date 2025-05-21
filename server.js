const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const Hand = require("pokersolver");

app.use(express.static("public"));

function createShuffledDeck() {
  const suits = ["s", "h", "d", "c"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
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

function getNextPhase(current) {
  const phases = ["preflop", "flop", "turn", "river", "showdown"];
  const idx = phases.indexOf(current);
  return phases[idx + 1] || "showdown";
}

function checkStartNextRound(game, currentPlayer) {
  const activePlayers = game.players.filter((p) => !p.folded && !p.allIn);
  const allCalled = activePlayers.every((p) => p.bet === game.state.highestbet);
  const lastRaiser = game.players.find((p) => p.id === game.state.lastRaiserId);

  if (allCalled && currentPlayer.id === lastRaiser.id) {
    game.players.forEach((player) => {
      player.bet = 0;
      player.isTurn = false;
    });

    game.state.highestbet = 0;
    game.state.lastRaiserId = null;

    switch (game.state.phase) {
      case "preflop":
        game.state.community_card = [game.deck.pop(), game.deck.pop(), game.deck.pop()];
        break;
      case "flop":
        game.state.community_card.push(game.deck.pop());
        break;
      case "turn":
        game.state.community_card.push(game.deck.pop());
        break;
      case "river":
        game.state.community_card.push(game.deck.pop());
        break;
      case "showdown":
        return handleShowdown(game);
    }
    game.state.phase = getNextPhase(game.state.phase);
    // Determine the first active player to the left of the dealer
    const dealerIndex = game.players.findIndex((p) => p.isDealer);
    const total = game.players.length;

    for (let i = 1; i <= total; i++) {
      const nextIndex = (dealerIndex + i) % total;
      if (!game.players[nextIndex].folded && !game.players[nextIndex].allIn) {
        game.players[nextIndex].isTurn = true;
        break;
      }
    }
  } else {
    currentPlayer.isTurn = false;
    // get index of current player
    let nextIndex = game.players.indexOf(currentPlayer);
    const totalPlayers = game.players.length;

    do {
      nextIndex = (nextIndex + 1) % totalPlayers;
    } while (game.players[nextIndex].folded && nextIndex !== game.players.indexOf(currentPlayer));

    const nextPlayer = game.players[nextIndex];
    nextPlayer.isTurn = true;
  }
}

function send_bet(code, player, bet) {
  const game = games[code];
  if (!game || !player || bet <= 0 || player.folded || player.balance < bet) return;

  player.balance -= bet;
  player.bet += bet;

  if (bet < game.state.highestbet) {
    game.pots[game.pots.length - 1].amount += bet;
    // Create new side pot
    const newPot = {
      amount: 0,
      contenders: game.players.filter((p) => !p.folded && p.balance > 0 && p.id !== player.id).map((p) => p.id),
    };
    game.pots.push(newPot);
  } else {
    game.pots[game.pots.length - 1].amount += bet;
    if (bet > game.state.highestbet) {
      game.state.highestbet = bet;
    }
  }

  io.to(code).emit("players_update", game.players, game.state);
}

const minimalbet = 2;

let games = {};

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
    io.to(code).emit("players_update", game);
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
    io.to(code).emit("players_update", game);
    callback({ success: true, message: "Rejoined successfully" });
  });

  socket.on("create_game", (callback) => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    games[code] = {
      players: [],
      deck: [],
      pots: [],
      state: { phase: "preflop", highestbet: 0, minraise: 1, lastRaiserId: "", community_card: [] },
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
    io.to(code).emit("players_update", game);
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

    const nameExists = game.players.some((player) => player.name.toLowerCase() === name.toLowerCase());

    if (nameExists) {
      return callback({ success: false, message: "Name already taken" });
    }

    const newPlayer = {
      id: socket.id,
      name,
      hand: [],
      balance: 1000,
      bet: 0,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
      isTurn: false,
      folded: false,
    };

    game.players.push(newPlayer);
    socket.join(code);

    console.log(`Player joined: ${name} (ID: ${socket.id})`);

    io.to(code).emit("players_update", game);
    callback({ success: true });
  });

  socket.on("start_game", (code) => {
    const game = games[code];
    if (game && game.players.length >= 2) {
      console.log("game start!");
      dealHands(game);
      // Clear previous roles
      game.players.forEach((p) => {
        p.isDealer = false;
        p.isSmallBlind = false;
        p.isBigBlind = false;
        p.isTurn = false;
        p.folded = false;
      });

      game.pots = [
        {
          amount: 0,
          contenders: game.players.map((p) => p.id),
        },
      ];

      const totalPlayers = game.players.length;

      // Assign Dealer
      const dealerIndex = 0;
      const dealer = game.players[dealerIndex];
      dealer.isDealer = true;

      if (totalPlayers === 2) {
        //headsup
        dealer.isSmallBlind = true;
        dealer.isTurn = true;

        const bigBlindIndex = (dealerIndex + 1) % totalPlayers;
        const bigBlind = game.players[bigBlindIndex];
        bigBlind.isBigBlind = true;
        bigBlind.isTurn = false;

        send_bet(code, game.players[dealerIndex], minimalbet / 2);
        send_bet(code, game.players[bigBlindIndex], minimalbet);
        game.state.lastRaiserId = game.players[bigBlindIndex].id;
      } else {
        const smallBlindIndex = (dealerIndex + 1) % totalPlayers;
        const bigBlindIndex = (dealerIndex + 2) % totalPlayers;
        const firstToActIndex = (dealerIndex + 3) % totalPlayers;

        game.players[smallBlindIndex].isSmallBlind = true;
        game.players[bigBlindIndex].isBigBlind = true;
        game.players[firstToActIndex].isTurn = true;

        send_bet(code, game.players[smallBlindIndex], minimalbet / 2);
        send_bet(code, game.players[bigBlindIndex], minimalbet);
        game.state.lastRaiserId = game.players[bigBlindIndex].id;
      }

      io.to(code).emit("players_update", game);
    }
  });

  socket.on("disconnect", () => {
    for (const code in games) {
      const game = games[code];
      const index = game.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        game.players.splice(index, 1);
        io.to(code).emit("players_update", game);
        break;
      }
      console.log(Object.entries(game.players));
    }
  }); // add handle turn after dc

  socket.on("player_callandcheck", (code) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players.find((p) => p.isTurn);

    // Clear current turn and broadcast action
    send_bet(code, currentPlayer, game.state.highestbet - currentPlayer.bet);
    checkStartNextRound(game, currentPlayer);

    io.to(code).emit("players_update", game);
  });

  socket.on("player_raise", (code, raiseAmount) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players.find((p) => p.isTurn);

    // Clear current turn and broadcast action
    send_bet(code, currentPlayer, game.state.highestbet - currentPlayer.bet + raiseAmount);
    game.state.minraise = raiseAmount;
    game.state.lastRaiserId = currentPlayer.id;
    checkStartNextRound(game, currentPlayer);

    io.to(code).emit("players_update", game);
  });

  socket.on("player_AllIn", (code) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players.find((p) => p.isTurn);
    send_bet(code, currentPlayer, currentPlayer.balance);
    currentPlayer.allIn = true;
    checkStartNextRound(game, currentPlayer);

    io.to(code).emit("players_update", game);
  });

  socket.on("player_fold", (code) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players.find((p) => p.isTurn);
    currentPlayer.folded = true;
    checkStartNextRound(game, currentPlayer);

    io.to(code).emit("players_update", game);
  });

  socket.on("debug", (code, callback) => {
    const game = games[code];
    if (!game) {
      console.log("Debug failed: game not found");
      return callback(`Game ${code} not found`);
    }
    callback(game);
  });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
