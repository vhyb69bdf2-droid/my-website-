import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
getDatabase,
ref,
set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
apiKey: "AIzaSyA-wwrQoRTPGXc88C5DL9Nsn8cDSHHec-M",
authDomain: "cipherroom-1df90.firebaseapp.com",
databaseURL: "https://cipherroom-1df90-default-rtdb.firebaseio.com",
projectId: "cipherroom-1df90",
storageBucket: "cipherroom-1df90.firebasestorage.app",
messagingSenderId: "680842122870",
appId: "1:680842122870:web:52d26a3eb881ffd4f97157",
measurementId: "G-YSYJ26PSJC"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

set(ref(db, "test"), {
message: "CipherRoom Connected!"
});

const state = {
mode: "easy",
repeats: false,
codeLength: 3,
playerSecret: "907",
novaSecret: "583",
playerHistory: [],
novaHistory: []
};

const els = {
easyMode: document.getElementById("easyMode"),
hardMode: document.getElementById("hardMode"),
repeatDigits: document.getElementById("repeatDigits"),
codeLength: document.getElementById("codeLength"),
secretInput: document.getElementById("secretInput"),
lockSecret: document.getElementById("lockSecret"),
secretStatus: document.getElementById("secretStatus"),
guessForm: document.getElementById("guessForm"),
guessInput: document.getElementById("guessInput"),
history: document.getElementById("history"),
novaHistory: document.getElementById("novaHistory"),
tracker: document.getElementById("tracker"),
createRoom: document.getElementById("createRoom"),
joinRoom: document.getElementById("joinRoom"),
roomInput: document.getElementById("roomInput"),
roomCode: document.getElementById("roomCode"),
status: document.getElementById("status")
};

function randomRoomCode() {
const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let code = "";

for (let i = 0; i < 4; i++) {
code += chars[Math.floor(Math.random() * chars.length)];
}

return code;
}

function scoreEasy(guess, secret) {
const result = [];

for (let i = 0; i < guess.length; i++) {
if (guess[i] === secret[i]) {
result.push("green");
} else if (secret.includes(guess[i])) {
result.push("yellow");
} else {
result.push("gray");
}
}

return result;
}

function scoreHard(guess, secret) {
return guess.split("").map(d =>
secret.includes(d) ? "yellow" : "gray"
);
}

function scoreGuess(guess, secret) {
return state.mode === "easy"
? scoreEasy(guess, secret)
: scoreHard(guess, secret);
}

function renderHistory() {
els.history.innerHTML = "";

state.playerHistory.forEach(turn => {
const row = document.createElement("div");
row.className = "guess-row";

turn.guess.split("").forEach((digit, i) => {
const tile = document.createElement("div");
tile.className = `tile ${turn.clues[i]}`;
tile.textContent = digit;
row.appendChild(tile);
});

els.history.prepend(row);
});

els.novaHistory.innerHTML = "";

state.novaHistory.forEach(turn => {
const row = document.createElement("div");
row.className = "guess-row";

turn.guess.split("").forEach((digit, i) => {
const tile = document.createElement("div");
tile.className = `tile ${turn.clues[i]}`;
tile.textContent = digit;
row.appendChild(tile);
});

els.novaHistory.prepend(row);
});
}

function renderTracker() {
if (state.mode === "hard") {
els.tracker.innerHTML = "Tracker disabled in hard mode.";
return;
}

els.tracker.innerHTML = "";

for (let i = 0; i <= 9; i++) {
const box = document.createElement("div");
box.className = "tracker-box";
box.innerHTML = `<strong>${i}</strong>`;
els.tracker.appendChild(box);
}
}

function novaTurn() {
const guess = "123";
const clues = scoreGuess(guess, state.playerSecret);

state.novaHistory.push({
guess,
clues
});

renderHistory();
}

els.easyMode.addEventListener("click", () => {
state.mode = "easy";
els.easyMode.classList.add("active");
els.hardMode.classList.remove("active");
renderTracker();
});

els.hardMode.addEventListener("click", () => {
state.mode = "hard";
els.hardMode.classList.add("active");
els.easyMode.classList.remove("active");
renderTracker();
});

els.lockSecret.addEventListener("click", () => {
state.playerSecret = els.secretInput.value;
els.secretStatus.textContent = "Secret locked.";
});

els.guessForm.addEventListener("submit", e => {
e.preventDefault();

const guess = els.guessInput.value;

const clues = scoreGuess(guess, state.novaSecret);

state.playerHistory.push({
guess,
clues
});

if (guess === state.novaSecret) {
els.secretStatus.textContent = "You guessed Nova's number!";
} else {
novaTurn();
}

renderHistory();
renderTracker();
});

els.createRoom.addEventListener("click", () => {
const code = randomRoomCode();
els.roomCode.textContent = `Room: ${code}`;
els.status.textContent = "Room created.";
});

els.joinRoom.addEventListener("click", () => {
const code = els.roomInput.value.toUpperCase();
els.roomCode.textContent = `Room: ${code}`;
els.status.textContent = `Joined room ${code}`;
});

renderTracker();
