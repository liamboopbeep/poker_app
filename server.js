const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const { Hand } = require("pokersolver");

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

function resetGame(game) {
  const currentDealerIndex = game.players.findIndex((p) => p.isDealer);
  if (currentDealerIndex === -1){
    currentDealerIndex = 0;
  }
  const nextDealerIndex = (currentDealerIndex + 1) % game.players.length;

    game.players.forEach((player) => {
      player.hand = [];
      player.bet = 0;
      player.isDealer = false;
      player.isSmallBlind = false;
      player.isBigBlind = false;
      player.isTurn = false;
      player.folded = false;
      player.hasActed = false;
      player.allIn = false;
      player.whole_game_bet = 0;
    });

    game.pot = 0;
    game.state = {
      highestbet: 0,
      minraise: 1,
      lastRaiserId: "",
      community_card: [],
    };

    game.players[nextDealerIndex].isDealer = true;
    io.to(code).emit("players_update", game);
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
  const phases = ["preflop", "flop", "turn", "river"];
  const idx = phases.indexOf(current);
  return phases[idx + 1] || "river";
}

function handleShowdown(game, code) {
  if (game.PhysicalDeck) {
    io.to(code).emit("choose_winner", game.pot);
    return;
  }

  // Get active players
  const activePlayers = game.players.filter((p) => !p.folded && p.hand);

  // Step 1: Sort players by their total bet to prepare for side pot creation
  const sortedByBet = [...activePlayers].sort((a, b) => a.whole_game_bet - b.whole_game_bet);
  let remainingPlayers = [...sortedByBet];
  let sidePots = [];
  let prevBet = 0;

  while (remainingPlayers.length > 0) {
    const currBet = remainingPlayers[0].whole_game_bet;
    const potSize = (currBet - prevBet) * remainingPlayers.length;

    sidePots.push({
      amount: potSize,
      contenders: [...remainingPlayers],
    });

    prevBet = currBet;
    remainingPlayers = remainingPlayers.filter((p) => p.whole_game_bet > currBet);
  }

  // Step 2: Solve all hands once
  const solvedHands = activePlayers.map((player) => {
    const fullHand = [...player.hand, ...game.state.community_card];
    const solved = Hand.solve(fullHand);
    solved.playerId = player.id;
    return solved;
  });

  // Step 3: Determine winners for each pot
  for (const pot of sidePots) {
    const contenderIds = new Set(pot.contenders.map((p) => p.id));
    const eligibleHands = solvedHands.filter((hand) => contenderIds.has(hand.playerId));
    const winners = Hand.winners(eligibleHands);
    const splitAmount = Math.floor(pot.amount / winners.length);

    winners.forEach((winnerHand) => {
      const winner = game.players.find((p) => p.id === winnerHand.playerId);
      winner.balance += splitAmount;
      io.to(code).emit("winner_update", {
        name: winner.name,
        description: winnerHand.descr,
      });
    });
  }
}

function checkStartNextRound(game, currentPlayer, code) {
  currentPlayer.isTurn = false;
  const activePlayers = game.players.filter((p) => !p.folded && !p.allIn);
  const lastRaiser = game.players.find((p) => p.id === game.state.lastRaiserId);
  const allActed = activePlayers.every((p) => p.hasActed);
  const allCalled = activePlayers.every((p) => p.bet === game.state.highestbet);

  let lastToCallPlayer = null;

  if (activePlayers.length < 1) {
    io.to(code).emit("players_update", game);
    return handleShowdown(game, code);
  }

  if (lastRaiser) {
    const raiserIndex = game.players.indexOf(lastRaiser);
    const totalPlayers = game.players.length;

    for (let i = 1; i < totalPlayers; i++) {
      const idx = (raiserIndex + i) % totalPlayers;
      const player = game.players[idx];
      if (!player.folded && !player.allIn) {
        lastToCallPlayer = player;
      }
      if (idx === raiserIndex) break; // completed full loop
    }
  }

  const isLastToCall = !lastToCallPlayer || currentPlayer.id === lastToCallPlayer.id;

  if (allCalled && isLastToCall && allActed) {
    game.players.forEach((player) => {
      player.bet = 0;
      player.isTurn = false;
      player.hasActed = false;
    });

    game.state.highestbet = 0;

    if (!game.PhysicalDeck) {
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
          return handleShowdown(game, code);
      }
    } else if (game.state.phase == "river") {
      return handleShowdown(game, code);
    }
    game.state.phase = getNextPhase(game.state.phase);
    // Determine the first active player to the left of the dealer
    const dealerIndex = game.players.findIndex((p) => p.isDealer);
    const total = game.players.length;

    for (let i = 1; i <= total; i++) {
      const nextIndex = (dealerIndex + i) % total;
      if (!game.players[nextIndex].folded && !game.players[nextIndex].allIn) {
        game.players[nextIndex].isTurn = true;
        game.state.lastRaiserId = game.players[nextIndex].id;
        break;
      }
    }
  } else {
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
  player.whole_game_bet += bet;

  game.pot += bet;

  if (player.bet > game.state.highestbet) {
    game.state.highestbet = player.bet;
  }

  io.to(code).emit("players_update", game);
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

  socket.on("create_game", (bVirtual, callback) => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    games[code] = {
      players: [],
      deck: [],
      pot: 0,
      PhysicalDeck: bVirtual,
      state: { phase: "preflop", highestbet: 0, minraise: 1, lastRaiserId: "", community_card: [] },
    };
    console.log(`Game ${code} created with physical deck: ${bVirtual}`);
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
      whole_game_bet: 0,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
      isTurn: false,
      folded: false,
      hasActed: false,
    };

    game.players.push(newPlayer);
    socket.join(code);

    console.log(`Player joined: ${name} (ID: ${socket.id})`);

    io.to(code).emit("players_update", game);
    callback({ success: true });
  });

  socket.on("start_game", (code) => {
    const game = games[code];
    resetGame(game);
    if (game && game.players.length >= 2) {
      console.log("game start!");
      if (!game.PhysicalDeck) {
        dealHands(game);
      }
      const existingDealerIndex = game.players.findIndex((p) => p.isDealer);
      const dealerIndex = existingDealerIndex !== -1 ? existingDealerIndex : 0;
      const dealer = game.players[dealerIndex];

      // Clear previous roles
      game.state.phase = "preflop";
      game.players.forEach((p) => {
        p.isDealer = false;
        p.isSmallBlind = false;
        p.isBigBlind = false;
        p.isTurn = false;
        p.folded = false;
      });

      const totalPlayers = game.players.length;

      // Assign Dealer
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
      } else {
        const smallBlindIndex = (dealerIndex + 1) % totalPlayers;
        const bigBlindIndex = (dealerIndex + 2) % totalPlayers;
        const firstToActIndex = (dealerIndex + 3) % totalPlayers;

        game.players[smallBlindIndex].isSmallBlind = true;
        game.players[bigBlindIndex].isBigBlind = true;
        game.players[firstToActIndex].isTurn = true;

        send_bet(code, game.players[smallBlindIndex], minimalbet / 2);
        send_bet(code, game.players[bigBlindIndex], minimalbet);
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
    currentPlayer.hasActed = true;
    // Clear current turn and broadcast action
    send_bet(code, currentPlayer, game.state.highestbet - currentPlayer.bet);
    checkStartNextRound(game, currentPlayer, code);

    io.to(code).emit("players_update", game);
  });

  socket.on("player_raise", (code, raiseAmount) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players.find((p) => p.isTurn);
    currentPlayer.hasActed = true;
    // Clear current turn and broadcast action
    send_bet(code, currentPlayer, game.state.highestbet - currentPlayer.bet + raiseAmount);
    game.state.minraise = raiseAmount;
    game.state.lastRaiserId = currentPlayer.id;
    checkStartNextRound(game, currentPlayer, code);

    io.to(code).emit("players_update", game);
  });

  socket.on("player_AllIn", (code) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players.find((p) => p.isTurn);
    if (!currentPlayer) return;
    currentPlayer.hasActed = true;
    currentPlayer.allIn = true;
    send_bet(code, currentPlayer, currentPlayer.balance);
    checkStartNextRound(game, currentPlayer, code);
    io.to(code).emit("players_update", game);
  });

  socket.on("player_fold", (code) => {
    const game = games[code];
    if (!game) return;

    const currentPlayer = game.players.find((p) => p.isTurn);
    currentPlayer.folded = true;
    currentPlayer.hasActed = true;
    checkStartNextRound(game, currentPlayer, code);

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


  socket.on("winner_confirmed", ({ code, winners, amount }) => {
    const game = games[code];
    console.log(code);
    console.log(amount);
    console.log(winners);
    if (!game) return;
    game.pot -= amount;
    const splitAmount = Math.floor(amount / winners.length);

    for (const index of winners) {
      const player = game.players[index];
      if (player) {
        player.balance += splitAmount;
      }
    }

    if (game.pot > 0) {
      io.to(code).emit("choose_winner", game.pot); // Ask for next manual winner
    }

    io.to(code).emit("players_update", game);
  });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
