const socket = io();

//autofill code from URL query
const urlParams = new URLSearchParams(window.location.search);
const gameCodeFromUrl = urlParams.get('code');
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

socket.on("turn_update", (activeId) => {
    const isMyTurn = socket.id === activeId;
    document.getElementById("actions").style.display = isMyTurn ? "block" : "none";
});


function sendAction(action) {
    const code = document.getElementById("code").value.toUpperCase();
    socket.emit("player_action", { code, action });
}