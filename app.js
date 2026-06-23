const firebaseConfig = window.CIPHERROOM_FIREBASE || {};
const firebaseBase = (firebaseConfig.databaseURL || "").replace(/\/$/, "");
const firebaseReady = Boolean(firebaseBase);

const state = {
  mode: "easy",
  matchType: "Real-Time",
  codeLength: 3,
  repeats: false,
  playerSecret: "907",
  opponentSecret: "907",
  playerHistory: [],
  opponentHistory: [],
  wins: 0,
  streak: 0,
  guesses: 0,
  online: false,
  role: null,
  roomCode: "ABCD",
  poller: null
};

const digits = "0123456789";
const els = {
  themeToggle: document.querySelector("#themeToggle"),
  createRoom: document.querySelector("#createRoom"),
  joinRoom: document.querySelector("#joinRoom"),
  roomInput: document.querySelector("#roomInput"),
  roomCode: document.querySelector("#roomCode"),
  connectionStatus: document.querySelector("#connectionStatus"),
  easyMode: document.querySelector("#easyMode"),
  hardMode: document.querySelector("#hardMode"),
  realTime: document.querySelector("#realTime"),
  turnBased: document.querySelector("#turnBased"),
  repeatDigits: document.querySelector("#repeatDigits"),
  codeLength: document.querySelector("#codeLength"),
  winCondition: document.querySelector("#winCondition"),
  modeBadge: document.querySelector("#modeBadge"),
  matchBadge: document.querySelector("#matchBadge"),
  opponentTitle: document.querySelector("#opponentTitle"),
  opponentHistoryTitle: document.querySelector("#opponentHistoryTitle"),
  secretInput: document.querySelector("#secretInput"),
  lockSecret: document.querySelector("#lockSecret"),
  secretStatus: document.querySelector("#secretStatus"),
  guessForm: document.querySelector("#guessForm"),
  guessInput: document.querySelector("#guessInput"),
  historyList: document.querySelector("#historyList"),
  novaHistoryList: document.querySelector("#novaHistoryList"),
  novaModeLabel: document.querySelector("#novaModeLabel"),
  digitGrid: document.querySelector("#digitGrid"),
  resetMatch: document.querySelector("#resetMatch"),
  winsStat: document.querySelector("#winsStat"),
  streakStat: document.querySelector("#streakStat"),
  accuracyStat: document.querySelector("#accuracyStat")
};

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function makeSecret(length, repeats) {
  let pool = digits.split("");
  let code = "";

  while (code.length < length) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    code += pick;
    if (!repeats) {
      pool = pool.filter((digit) => digit !== pick);
    }
  }

  return code;
}

function validNumber(value) {
  const clean = value.trim();
  if (!new RegExp(`^\\d{${state.codeLength}}$`).test(clean)) {
    return { ok: false, message: `Use exactly ${state.codeLength} digits.` };
  }

  if (!state.repeats && new Set(clean).size !== clean.length) {
    return { ok: false, message: "Repeated digits are off for this room." };
  }

  return { ok: true, value: clean };
}

function scoreEasy(guess, secret) {
  const result = Array(guess.length).fill("gray");
  const remaining = {};

  for (let i = 0; i < secret.length; i += 1) {
    if (guess[i] === secret[i]) {
      result[i] = "green";
    } else {
      remaining[secret[i]] = (remaining[secret[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (result[i] === "green") continue;
    if (remaining[guess[i]] > 0) {
      result[i] = "yellow";
      remaining[guess[i]] -= 1;
    }
  }

  return result;
}

function scoreHard(guess, secret) {
  const counts = {};
  for (const digit of secret) {
    counts[digit] = (counts[digit] || 0) + 1;
  }

  return guess.split("").map((digit) => {
    if (counts[digit] > 0) {
      counts[digit] -= 1;
      return "yellow";
    }
    return "gray";
  });
}

function scoreGuess(guess, secret) {
  return state.mode === "easy" ? scoreEasy(guess, secret) : scoreHard(guess, secret);
}

function clueSymbol(type) {
  if (type === "green") return "✓";
  if (type === "yellow") return "•";
  return "×";
}

function roomUrl(code) {
  return `${firebaseBase}/rooms/${code}.json`;
}

async function firebaseGet(code) {
  const response = await fetch(roomUrl(code));
  if (!response.ok) throw new Error("Could not reach Firebase.");
  return response.json();
}

async function firebasePut(code, value) {
  const response = await fetch(roomUrl(code), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error("Could not save room.");
  return response.json();
}

async function firebasePatch(path, value) {
  const response = await fetch(`${firebaseBase}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error("Could not update room.");
  return response.json();
}

function roomSettings() {
  return {
    mode: state.mode,
    matchType: state.matchType,
    codeLength: state.codeLength,
    repeats: state.repeats,
    winCondition: els.winCondition.value
  };
}

function applySettings(settings) {
  if (!settings) return;
  state.mode = settings.mode || "easy";
  state.matchType = settings.matchType || "Real-Time";
  state.codeLength = Number(settings.codeLength || 3);
  state.repeats = Boolean(settings.repeats);
  els.codeLength.value = String(state.codeLength);
  els.repeatDigits.checked = state.repeats;
  els.winCondition.value = settings.winCondition || "First correct guess";
  els.secretInput.maxLength = state.codeLength;
  els.guessInput.maxLength = state.codeLength;
  syncModeButtons();
  syncMatchButtons();
}

function syncModeButtons() {
  els.easyMode.classList.toggle("active", state.mode === "easy");
  els.hardMode.classList.toggle("active", state.mode === "hard");
  els.modeBadge.textContent = state.mode === "easy" ? "Easy" : "Hard";
  els.novaModeLabel.textContent = state.mode === "easy" ? "Easy clues" : "Hard clues";
}

function syncMatchButtons() {
  els.realTime.classList.toggle("active", state.matchType === "Real-Time");
  els.turnBased.classList.toggle("active", state.matchType === "Turn-Based");
  els.matchBadge.textContent = state.matchType;
}

function status(message) {
  els.connectionStatus.textContent = message;
}

function historyRow(turn) {
  const clueHtml = turn.clues
    .map((clue) => `<span class="clue ${clue}" title="${clue}">${clueSymbol(clue)}</span>`)
    .join("");

  return `<span class="guess-number">${turn.guess}</span><span class="clues">${clueHtml}</span>`;
}

function renderHistoryList(listEl, turns, emptyText) {
  listEl.innerHTML = "";

  if (!turns.length) {
    const empty = document.createElement("li");
    empty.className = "history-item";
    empty.innerHTML = `<span class="guess-number">---</span><span class="clues"><span class="section-title">${emptyText}</span></span>`;
    listEl.append(empty);
    return;
  }

  turns.forEach((turn) => {
    const row = document.createElement("li");
    row.className = "history-item";
    row.innerHTML = historyRow(turn);
    listEl.prepend(row);
  });
}

function renderHistories() {
  renderHistoryList(els.historyList, state.playerHistory, "No guesses yet");
  renderHistoryList(
    els.novaHistoryList,
    state.opponentHistory,
    state.online ? "Friend has not guessed" : "Nova has not guessed"
  );
}

function trackerState() {
  const known = Object.fromEntries(digits.split("").map((digit) => [digit, "unknown"]));

  state.playerHistory.forEach((turn) => {
    turn.guess.split("").forEach((digit, index) => {
      const clue = turn.clues[index];
      if (clue === "green" || clue === "yellow") {
        known[digit] = "exists";
      } else if (known[digit] !== "exists") {
        known[digit] = "absent";
      }
    });
  });

  return known;
}

function renderTracker() {
  if (state.mode === "hard") {
    els.digitGrid.className = "tracker-hidden";
    els.digitGrid.textContent = "Tracker unavailable in hard mode.";
    return;
  }

  els.digitGrid.className = "digit-grid";
  els.digitGrid.innerHTML = "";
  const known = trackerState();

  for (const digit of digits) {
    const cell = document.createElement("div");
    cell.className = "digit-cell";
    const statusText = known[digit] === "exists" ? "✓" : known[digit] === "absent" ? "×" : "?";
    cell.innerHTML = `<span>${digit}</span><span>${statusText}</span>`;
    els.digitGrid.append(cell);
  }
}

function renderStats() {
  const accuracy = state.guesses ? Math.round((state.wins / state.guesses) * 100) : 0;
  els.winsStat.textContent = state.wins;
  els.streakStat.textContent = state.streak;
  els.accuracyStat.textContent = `${accuracy}%`;
}

function renderLabels() {
  els.opponentTitle.textContent = state.online ? "Friend room is connected" : "Choose a mode, then race Nova";
  els.opponentHistoryTitle.textContent = state.online ? "Friend's Guesses" : "Nova's Guesses";
}

function renderAll() {
  renderLabels();
  renderHistories();
  renderTracker();
  renderStats();
}

function clearLocalMatch(message) {
  state.playerHistory = [];
  state.opponentHistory = [];
  state.guesses = 0;
  state.playerSecret = makeSecret(state.codeLength, state.repeats);
  state.opponentSecret = makeSecret(state.codeLength, state.repeats);
  els.secretInput.value = state.playerSecret;
  els.guessInput.value = state.codeLength === 3 ? "538" : makeSecret(state.codeLength, state.repeats);
  els.secretStatus.textContent = message;
  renderAll();
}

function stopPolling() {
  if (state.poller) {
    clearInterval(state.poller);
    state.poller = null;
  }
}

async function syncFromRoom() {
  if (!state.online || !state.roomCode) return;

  try {
    const room = await firebaseGet(state.roomCode);
    if (!room) {
      status("Room no longer exists.");
      return;
    }

    applySettings(room.settings);
    const opponentRole = state.role === "host" ? "guest" : "host";
    const players = room.players || {};
    const opponent = players[opponentRole];
    const turns = Array.isArray(room.turns) ? room.turns : [];
   state.opponentSecret =
  opponent?.locked ? opponent.secret : "";
    state.playerHistory = turns.filter((turn) => turn.by === state.role);
    state.opponentHistory = turns.filter((turn) => turn.by === opponentRole);

    if (opponent?.secret) {
      status(`Connected to room ${state.roomCode}. Friend is ready.`);
    } else {
      status(`Room ${state.roomCode} ready. Waiting for your friend to join.`);
    }

    renderAll();
  } catch (error) {
    status(error.message);
  }
}

function startPolling() {
  stopPolling();
  syncFromRoom();
  state.poller = setInterval(syncFromRoom, 2000);
}

async function updateOwnSecret() {
  if (!state.online) return;

  const room = await firebaseGet(state.roomCode);
  const currentPlayer = room?.players?.[state.role];
  const turns = Array.isArray(room?.turns)

  ? room.turns

  : [];

if (turns.length > 0) {

  els.secretStatus.textContent =

    "Cannot lock or change secret after the match started.";

  return;

}

  if (currentPlayer?.locked) {
    els.secretStatus.textContent =
      "Secret already locked for this round.";
    return;
  }

  await firebasePatch(
    `rooms/${state.roomCode}/players/${state.role}`,
    {
      secret: state.playerSecret,
      locked: true,
      updatedAt: Date.now()
    }
  );

  els.secretInput.disabled = true;
}

async function updateSettingsIfHost() {
  if (state.online && state.role === "host") {
    await firebasePatch(`rooms/${state.roomCode}`, { settings: roomSettings() });
  }
}

async function createOnlineRoom() {
  const checked = validNumber(els.secretInput.value);
  if (!checked.ok) {
    els.secretStatus.textContent = checked.message;
    return;
  }

  const code = randomRoomCode();
  state.online = true;
  state.role = "host";
  state.roomCode = code;
  state.playerSecret = checked.value;
  els.roomInput.value = code;
  els.roomCode.textContent = code;

  await firebasePut(code, {
    createdAt: Date.now(),
    settings: roomSettings(),
  players: {

  host: {

    secret: "",

    locked: false,

    joinedAt: Date.now()

  }

},
    turns: []
  });

  state.playerHistory = [];
  state.opponentHistory = [];
  els.secretStatus.textContent = `Room ${code} created. Send that code to your friend.`;
  startPolling();
  renderAll();
}

async function joinOnlineRoom() {
  const code = els.roomInput.value.trim().toUpperCase();
  const checked = validNumber(els.secretInput.value);

  if (!code || code.length !== 4) {
    status("Enter a 4-character room code first.");
    return;
  }

  if (!checked.ok) {
    els.secretStatus.textContent = checked.message;
    return;
  }

  const room = await firebaseGet(code);
  if (!room) {
    status(`Room ${code} was not found.`);
    return;
  }

  state.online = true;
  state.role = "guest";
  state.roomCode = code;
  state.playerSecret = checked.value;
  applySettings(room.settings);
  els.roomCode.textContent = code;
await firebasePatch(`rooms/${code}/players/guest`, {

  secret: "",

  locked: false,

  joinedAt: Date.now()

});

  els.secretStatus.textContent = `Joined room ${code}. Start guessing your friend.`;
  startPolling();
  renderAll();
}

function setMode(mode) {
  state.mode = mode;
  syncModeButtons();
  renderAll();
  updateSettingsIfHost();
}

function setMatchType(type) {
  state.matchType = type;
  syncMatchButtons();
  updateSettingsIfHost();
}

function syncLength() {
  state.codeLength = Number(els.codeLength.value);
  els.secretInput.maxLength = state.codeLength;
  els.guessInput.maxLength = state.codeLength;
  clearLocalMatch(`${state.codeLength}-digit room ready. New opponent code generated.`);
  updateSettingsIfHost();
}

function novaTurn() {
  const checked = validNumber(els.secretInput.value);

  if (!checked.ok) {
    els.secretStatus.textContent = `${checked.message} Nova is waiting for a valid secret.`;
    return false;
  }

  state.playerSecret = checked.value;
  const guess = makeSecret(state.codeLength, state.repeats);
  const clues = scoreGuess(guess, state.playerSecret);
  state.opponentHistory.push({ guess, clues });

  if (guess === state.playerSecret) {
    state.streak = 0;
    els.secretStatus.textContent = `Nova guessed your secret ${state.playerSecret}. Nova wins this room.`;
    return true;
  }

  return false;
}

async function submitOnlineGuess(guess) {
  await syncFromRoom();
  const room = await firebaseGet(state.roomCode);

const hostLocked = room?.players?.host?.locked;
const guestLocked = room?.players?.guest?.locked;

if (!hostLocked || !guestLocked) {
  els.secretStatus.textContent =
    "Both players must lock secrets before guessing.";
  return;
}

  if (!state.opponentSecret) {
    els.secretStatus.textContent = "Your friend has not joined or locked a secret yet.";
    return;
  }

  const clues = scoreGuess(guess, state.opponentSecret);
  const correct = guess === state.opponentSecret;
  const turns = Array.isArray(room?.turns) ? room.turns : [];

  turns.push({
    by: state.role,
    guess,
    clues,
    correct,
    createdAt: Date.now()
  });

  await firebasePatch(`rooms/${state.roomCode}`, { turns });
  state.guesses += 1;

  if (correct) {
    state.wins += 1;
    state.streak += 1;
    els.secretStatus.textContent = `You solved your friend's code. You win room ${state.roomCode}.`;
  } else {
    els.secretStatus.textContent = "Guess sent. Waiting for your friend's next move.";
  }

  await syncFromRoom();
  renderAll();
}

els.themeToggle.addEventListener("click", () => {
  document.documentElement.classList.toggle("light");
});

els.createRoom.addEventListener("click", async () => {
  try {
    if (!firebaseReady) {
      const code = randomRoomCode();
      state.online = false;
      state.role = null;
      state.roomCode = code;
      els.roomInput.value = code;
      els.roomCode.textContent = code;
      status("Room code created for demo only. Add Firebase config for friend multiplayer.");
      clearLocalMatch("Local demo room created. Nova has a fresh hidden code.");
      return;
    }

    await createOnlineRoom();
  } catch (error) {
    status(error.message);
  }
});

els.joinRoom.addEventListener("click", async () => {
  try {
    if (!firebaseReady) {
      status("Join needs Firebase config. GitHub Pages alone cannot sync two devices.");
      return;
    }

    await joinOnlineRoom();
  } catch (error) {
    status(error.message);
  }
});

els.roomInput.addEventListener("input", () => {
  els.roomInput.value = els.roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  els.roomCode.textContent = els.roomInput.value || "----";
});

els.easyMode.addEventListener("click", () => setMode("easy"));
els.hardMode.addEventListener("click", () => setMode("hard"));
els.realTime.addEventListener("click", () => setMatchType("Real-Time"));
els.turnBased.addEventListener("click", () => setMatchType("Turn-Based"));

els.repeatDigits.addEventListener("change", () => {
  state.repeats = els.repeatDigits.checked;
  syncLength();
});

els.codeLength.addEventListener("change", syncLength);

els.lockSecret.addEventListener("click", async () => {
  const checked = validNumber(els.secretInput.value);

  if (!checked.ok) {
    els.secretStatus.textContent = checked.message;
    return;
  }

  if (state.online) {
    const room = await firebaseGet(state.roomCode);
    const currentPlayer = room?.players?.[state.role];

    if (currentPlayer?.locked) {
      els.secretStatus.textContent =
        "Secret already locked for this round.";
      return;
    }
  }

  state.playerSecret = checked.value;

  try {
    await updateOwnSecret();

    els.secretInput.disabled = true;
    els.lockSecret.disabled = true;

    if (state.online) {
      const room = await firebaseGet(state.roomCode);

      const hostLocked = room?.players?.host?.locked;
      const guestLocked = room?.players?.guest?.locked;

      if (hostLocked && guestLocked) {
        els.secretStatus.textContent =
          "Both secrets locked. Match started.";
      } else {
        els.secretStatus.textContent =
          "Secret locked. Waiting for other player.";
      }
    } else {
      els.secretStatus.textContent =
        `Secret ${checked.value} locked.`;
    }
  } catch (error) {
    status(error.message);
  }
});

els.guessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const checked = validNumber(els.guessInput.value);

  if (!checked.ok) {
    els.secretStatus.textContent = checked.message;
    return;
  }

  const guess = checked.value;

  if (state.online) {
    await submitOnlineGuess(guess);
    return;
  }
  if (!els.secretInput.disabled) {

  els.secretStatus.textContent =

    "Lock your secret before guessing.";

  return;

}

  const clues = scoreGuess(guess, state.opponentSecret);
  state.playerHistory.push({ guess, clues });
  state.guesses += 1;

  if (guess === state.opponentSecret) {
    state.wins += 1;
    state.streak += 1;
    els.secretStatus.textContent = `You solved Nova's code ${state.opponentSecret}. You win this room.`;
  } else {
    const novaWon = novaTurn();
    if (!novaWon && els.winCondition.value === "Timed match") {
      els.secretStatus.textContent = "Guess logged. Nova answered. Timer pressure stays on.";
    } else if (!novaWon && els.winCondition.value === "Point system") {
      els.secretStatus.textContent = "Guess logged. Nova answered. Partial clues can feed the point system.";
    } else if (!novaWon) {
      els.secretStatus.textContent = "Guess logged. Nova answered with a visible guess.";
    }
  }

  renderAll();
});

els.resetMatch.addEventListener("click", async () => {
  if (state.online && state.role === "host") {
    await firebasePatch(`rooms/${state.roomCode}`, { turns: [] });
    await syncFromRoom();
    els.secretStatus.textContent = `Room ${state.roomCode} history reset.`;
    return;
  }

  clearLocalMatch(state.online ? "Only the host can reset the online room." : "Match reset. Nova has a fresh hidden code.");
});

status(firebaseReady ? "Firebase configured. Create or join a room to play with a friend." : "Local demo mode. Add Firebase config for real friend multiplayer.");
renderAll();
