const state = {
  mode: "easy",
  matchType: "Real-Time",
  codeLength: 3,
  repeats: false,
  playerSecret: "907",
  opponentSecret: "907",
  playerHistory: [],
  novaHistory: [],
  wins: 0,
  streak: 0,
  guesses: 0
};

const digits = "0123456789";
const els = {
  themeToggle: document.querySelector("#themeToggle"),
  createRoom: document.querySelector("#createRoom"),
  roomInput: document.querySelector("#roomInput"),
  roomCode: document.querySelector("#roomCode"),
  easyMode: document.querySelector("#easyMode"),
  hardMode: document.querySelector("#hardMode"),
  realTime: document.querySelector("#realTime"),
  turnBased: document.querySelector("#turnBased"),
  repeatDigits: document.querySelector("#repeatDigits"),
  codeLength: document.querySelector("#codeLength"),
  winCondition: document.querySelector("#winCondition"),
  modeBadge: document.querySelector("#modeBadge"),
  matchBadge: document.querySelector("#matchBadge"),
  secretInput: document.querySelector("#secretInput"),
  lockSecret: document.querySelector("#lockSecret"),
  secretStatus: document.querySelector("#secretStatus"),
  guessForm: document.querySelector("#guessForm"),
  guessInput: document.querySelector("#guessInput"),
  historyList: document.querySelector("#historyList"),
  novaHistoryList: document.querySelector("#novaHistoryList"),
  novaModeLabel: document.querySelector("#novaModeLabel"),
  trackerPanel: document.querySelector("#trackerPanel"),
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

function randomGuess() {
  return makeSecret(state.codeLength, state.repeats);
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
  renderHistoryList(els.novaHistoryList, state.novaHistory, "Nova has not guessed");
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
    const status = known[digit] === "exists" ? "✓" : known[digit] === "absent" ? "×" : "?";
    cell.innerHTML = `<span>${digit}</span><span>${status}</span>`;
    els.digitGrid.append(cell);
  }
}

function renderStats() {
  const accuracy = state.guesses ? Math.round((state.wins / state.guesses) * 100) : 0;
  els.winsStat.textContent = state.wins;
  els.streakStat.textContent = state.streak;
  els.accuracyStat.textContent = `${accuracy}%`;
}

function renderAll() {
  renderHistories();
  renderTracker();
  renderStats();
}

function setMode(mode) {
  state.mode = mode;
  els.easyMode.classList.toggle("active", mode === "easy");
  els.hardMode.classList.toggle("active", mode === "hard");
  els.modeBadge.textContent = mode === "easy" ? "Easy" : "Hard";
  els.novaModeLabel.textContent = mode === "easy" ? "Easy clues" : "Hard clues";
  renderAll();
}

function setMatchType(type) {
  state.matchType = type;
  els.realTime.classList.toggle("active", type === "Real-Time");
  els.turnBased.classList.toggle("active", type === "Turn-Based");
  els.matchBadge.textContent = type;
}

function clearMatch(message) {
  state.playerHistory = [];
  state.novaHistory = [];
  state.guesses = 0;
  state.playerSecret = makeSecret(state.codeLength, state.repeats);
  state.opponentSecret = makeSecret(state.codeLength, state.repeats);
  els.secretInput.value = state.playerSecret;
  els.guessInput.value = state.codeLength === 3 ? "538" : makeSecret(state.codeLength, state.repeats);
  els.secretStatus.textContent = message;
  renderAll();
}

function syncLength() {
  state.codeLength = Number(els.codeLength.value);
  els.secretInput.maxLength = state.codeLength;
  els.guessInput.maxLength = state.codeLength;
  clearMatch(`${state.codeLength}-digit room ready. New opponent code generated.`);
}

function novaTurn() {
  const checked = validNumber(els.secretInput.value);

  if (!checked.ok) {
    els.secretStatus.textContent = `${checked.message} Nova is waiting for a valid secret.`;
    return false;
  }

  state.playerSecret = checked.value;
  const guess = randomGuess();
  const clues = scoreGuess(guess, state.playerSecret);
  state.novaHistory.push({ guess, clues });

  if (guess === state.playerSecret) {
    state.streak = 0;
    els.secretStatus.textContent = `Nova guessed your secret ${state.playerSecret}. Nova wins this room.`;
    return true;
  }

  return false;
}

els.themeToggle.addEventListener("click", () => {
  document.documentElement.classList.toggle("light");
});

els.createRoom.addEventListener("click", () => {
  const code = randomRoomCode();
  els.roomInput.value = code;
  els.roomCode.textContent = code;
  clearMatch("New room created. Nova has a fresh hidden code.");
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

els.lockSecret.addEventListener("click", () => {
  const checked = validNumber(els.secretInput.value);
  if (!checked.ok) {
    els.secretStatus.textContent = checked.message;
    return;
  }

  state.playerSecret = checked.value;
  els.secretStatus.textContent = `Secret ${checked.value} locked. Nova will guess against it.`;
});

els.guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const checked = validNumber(els.guessInput.value);

  if (!checked.ok) {
    els.secretStatus.textContent = checked.message;
    return;
  }

  const guess = checked.value;
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

els.resetMatch.addEventListener("click", () => {
  clearMatch("Match reset. Nova has a fresh hidden code.");
});

renderAll();
