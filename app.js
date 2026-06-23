const firebaseConfig = window.CIPHERROOM_FIREBASE || {};
const firebaseBase = (firebaseConfig.databaseURL || "").replace(/\/$/, "");
const firebaseReady = Boolean(firebaseBase);

const ROUND_DURATION_MS = 3 * 60 * 1000;

const state = {
  mode: "easy",
  matchType: "Real-Time",
  codeLength: 3,
  repeats: false,

  playerSecret: "",
  opponentSecret: "",

  playerHistory: [],
  opponentHistory: [],

  wins: 0,
  streak: 0,
  guesses: 0,

  online: false,
  role: null,
  roomCode: "",

  poller: null,
  timerInterval: null
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

  digitGrid: document.querySelector("#digitGrid"),

  resetMatch: document.querySelector("#resetMatch"),

  winsStat: document.querySelector("#winsStat"),
  streakStat: document.querySelector("#streakStat"),
  accuracyStat: document.querySelector("#accuracyStat")
};

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from(
    { length: 4 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

function makeSecret(length, repeats) {

  let pool = digits.split("");
  let code = "";

  while (code.length < length) {

    const pick =
      pool[Math.floor(Math.random() * pool.length)];

    code += pick;

    if (!repeats) {
      pool = pool.filter((d) => d !== pick);
    }
  }

  return code;
}

function validNumber(value) {

  const clean = value.trim();

  if (
    !new RegExp(`^\\d{${state.codeLength}}$`).test(clean)
  ) {

    return {
      ok: false,
      message: `Use exactly ${state.codeLength} digits.`
    };
  }

  if (
    !state.repeats &&
    new Set(clean).size !== clean.length
  ) {

    return {
      ok: false,
      message: "Repeated digits are disabled."
    };
  }

  return {
    ok: true,
    value: clean
  };
}

function scoreEasy(guess, secret) {

  const result = Array(guess.length).fill("gray");

  const remaining = {};

  for (let i = 0; i < secret.length; i++) {

    if (guess[i] === secret[i]) {

      result[i] = "green";

    } else {

      remaining[secret[i]] =
        (remaining[secret[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < guess.length; i++) {

    if (result[i] === "green") continue;

    if (remaining[guess[i]] > 0) {

      result[i] = "yellow";

      remaining[guess[i]]--;
    }
  }

  return result;
}

function scoreHard(guess, secret) {

  const counts = {};

  for (const d of secret) {
    counts[d] = (counts[d] || 0) + 1;
  }

  return guess.split("").map((digit) => {

    if (counts[digit] > 0) {

      counts[digit]--;

      return "yellow";
    }

    return "gray";
  });
}

function scoreGuess(guess, secret) {

  return state.mode === "easy"
    ? scoreEasy(guess, secret)
    : scoreHard(guess, secret);
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

  if (!response.ok) {
    throw new Error("Firebase error.");
  }

  return response.json();
}

async function firebasePut(code, value) {

  const response = await fetch(roomUrl(code), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(value)
  });

  return response.json();
}

async function firebasePatch(path, value) {

  const response = await fetch(
    `${firebaseBase}/${path}.json`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(value)
    }
  );

  return response.json();
}

function status(message) {
  els.connectionStatus.textContent = message;
}

function syncModeButtons() {

  els.easyMode.classList.toggle(
    "active",
    state.mode === "easy"
  );

  els.hardMode.classList.toggle(
    "active",
    state.mode === "hard"
  );

  els.modeBadge.textContent =
    state.mode;
}

function syncMatchButtons() {

  els.realTime.classList.toggle(
    "active",
    state.matchType === "Real-Time"
  );

  els.turnBased.classList.toggle(
    "active",
    state.matchType === "Turn-Based"
  );

  els.matchBadge.textContent =
    state.matchType;
}

function renderHistoryList(
  listEl,
  turns,
  emptyText
) {

  listEl.innerHTML = "";

  if (!turns.length) {

    const row = document.createElement("li");

    row.className = "history-item";

    row.innerHTML =
      `<span>${emptyText}</span>`;

    listEl.append(row);

    return;
  }

  turns.forEach((turn) => {

    const row = document.createElement("li");

    row.className = "history-item";

    row.innerHTML = `
      <span class="guess-number">
        ${turn.guess}
      </span>

      <span class="clues">
        ${turn.clues
          .map((c) =>
            `<span class="clue ${c}">
              ${clueSymbol(c)}
            </span>`
          )
          .join("")}
      </span>
    `;

    listEl.prepend(row);
  });
}

function renderAll() {

  renderHistoryList(
    els.historyList,
    state.playerHistory,
    "No guesses yet"
  );

  renderHistoryList(
    els.novaHistoryList,
    state.opponentHistory,
    "Opponent has not guessed"
  );

  els.winsStat.textContent = state.wins;
  els.streakStat.textContent = state.streak;

  const accuracy =
    state.guesses
      ? Math.round(
          (state.wins / state.guesses) * 100
        )
      : 0;

  els.accuracyStat.textContent =
    `${accuracy}%`;
}

function stopPolling() {

  if (state.poller) {

    clearInterval(state.poller);

    state.poller = null;
  }
}

function stopTimer() {

  if (state.timerInterval) {

    clearInterval(state.timerInterval);

    state.timerInterval = null;
  }
}

function startTimer(startedAt) {

  stopTimer();

  let timer =
    document.querySelector("#roundTimer");

  if (!timer) {

    timer = document.createElement("div");

    timer.id = "roundTimer";

    timer.style.fontSize = "18px";
    timer.style.fontWeight = "700";
    timer.style.marginTop = "10px";

    els.secretStatus.after(timer);
  }

  function tick() {

    const remaining =
      ROUND_DURATION_MS -
      (Date.now() - startedAt);

    if (remaining <= 0) {

      timer.textContent =
        "⏰ Time is up";

      stopTimer();

      firebasePatch(
        `rooms/${state.roomCode}`,
        {
          timedOut: true
        }
      );

      return;
    }

    const mins =
      Math.floor(remaining / 60000);

    const secs =
      Math.floor(
        (remaining % 60000) / 1000
      );

    timer.textContent =
      `⏱ ${mins}:${secs
        .toString()
        .padStart(2, "0")}`;
  }

  tick();

  state.timerInterval =
    setInterval(tick, 1000);
}

async function syncFromRoom() {

  if (!state.online) return;

  const room =
    await firebaseGet(state.roomCode);

  if (!room) return;

  const opponentRole =
    state.role === "host"
      ? "guest"
      : "host";

  state.opponentSecret =
    room.players?.[opponentRole]?.secret || "";

  const turns =
    Array.isArray(room.turns)
      ? room.turns
      : [];

  state.playerHistory =
    turns.filter(
      (t) => t.by === state.role
    );

  state.opponentHistory =
    turns.filter(
      (t) => t.by === opponentRole
    );

  if (
    state.matchType === "Real-Time" &&
    room.roundStartedAt &&
    !state.timerInterval
  ) {

    startTimer(room.roundStartedAt);
  }

  renderAll();
}

function startPolling() {

  stopPolling();

  syncFromRoom();

  state.poller =
    setInterval(syncFromRoom, 2000);
}

async function createOnlineRoom() {

  const code = randomRoomCode();

  state.online = true;
  state.role = "host";
  state.roomCode = code;

  els.roomCode.textContent = code;
  els.roomInput.value = code;

  await firebasePut(code, {

    settings: {
      mode: state.mode,
      matchType: state.matchType,
      codeLength: state.codeLength,
      repeats: state.repeats
    },

    currentTurn: null,

    timedOut: false,

    roundStartedAt: null,

    players: {

      host: {
        secret: "",
        locked: false
      },

      guest: {
        secret: "",
        locked: false
      }
    },

    turns: []
  });

  status(`Room ${code} created.`);

  startPolling();
}

async function joinOnlineRoom() {

  const code =
    els.roomInput.value
      .trim()
      .toUpperCase();

  const room =
    await firebaseGet(code);

  if (!room) {

    status("Room not found.");

    return;
  }

  state.online = true;
  state.role = "guest";
  state.roomCode = code;

  els.roomCode.textContent = code;

  status(`Joined room ${code}`);

  startPolling();
}

async function lockSecret() {

  const checked =
    validNumber(
      els.secretInput.value
    );

  if (!checked.ok) {

    els.secretStatus.textContent =
      checked.message;

    return;
  }

  state.playerSecret =
    checked.value;

  await firebasePatch(
    `rooms/${state.roomCode}/players/${state.role}`,
    {
      secret: checked.value,
      locked: true
    }
  );

  els.secretInput.disabled = true;

  els.lockSecret.disabled = true;

  els.lockSecret.textContent =
    "Secret Locked ✓";

  els.secretStatus.textContent =
    "Secret locked.";

  const room =
    await firebaseGet(state.roomCode);

  if (
    room.players.host.locked &&
    room.players.guest.locked
  ) {

    els.secretStatus.textContent =
      state.matchType === "Turn-Based"
        ? "Turn-Based match started."
        : "Real-Time match started.";
  }
}

async function submitOnlineGuess(guess) {

  const room =
    await firebaseGet(state.roomCode);

  const opponentRole =
    state.role === "host"
      ? "guest"
      : "host";

  if (
    !room.players.host.locked ||
    !room.players.guest.locked
  ) {

    els.secretStatus.textContent =
      "Both players must lock secrets.";

    return;
  }

  if (
    state.matchType === "Turn-Based"
  ) {

    if (!room.currentTurn) {

      const randomTurn =
        Math.random() > 0.5
          ? "host"
          : "guest";

      await firebasePatch(
        `rooms/${state.roomCode}`,
        {
          currentTurn: randomTurn
        }
      );

      room.currentTurn =
        randomTurn;
    }

    if (
      room.currentTurn !== state.role
    ) {

      els.secretStatus.textContent =
        "Wait for your turn.";

      return;
    }
  }

  if (
    state.matchType === "Real-Time" &&
    room.timedOut
  ) {

    els.secretStatus.textContent =
      "Round ended.";

    return;
  }

  const opponentSecret =
    room.players?.[opponentRole]?.secret;

  const clues =
    scoreGuess(
      guess,
      opponentSecret
    );

  const correct =
    guess === opponentSecret;

  const turns =
    Array.isArray(room.turns)
      ? room.turns
      : [];

  turns.push({
    by: state.role,
    guess,
    clues,
    correct,
    createdAt: Date.now()
  });

  const patch = {
    turns
  };

  if (
    state.matchType === "Turn-Based"
  ) {

    patch.currentTurn =
      opponentRole;
  }

  if (
    state.matchType === "Real-Time" &&
    !room.roundStartedAt
  ) {

    patch.roundStartedAt =
      Date.now();
  }

  await firebasePatch(
    `rooms/${state.roomCode}`,
    patch
  );

  state.guesses++;

  if (correct) {

    state.wins++;
    state.streak++;

    stopTimer();

    els.secretStatus.textContent =
      "You solved the code!";

  } else {

    els.secretStatus.textContent =
      state.matchType === "Turn-Based"
        ? "Guess sent. Opponent's turn."
        : "Guess sent.";
  }

  await syncFromRoom();

  renderAll();
}

els.createRoom.addEventListener(
  "click",
  createOnlineRoom
);

els.joinRoom.addEventListener(
  "click",
  joinOnlineRoom
);

els.lockSecret.addEventListener(
  "click",
  lockSecret
);

els.guessForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    const checked =
      validNumber(
        els.guessInput.value
      );

    if (!checked.ok) {

      els.secretStatus.textContent =
        checked.message;

      return;
    }

    if (state.online) {

      await submitOnlineGuess(
        checked.value
      );

      return;
    }
  }
);

els.easyMode.addEventListener(
  "click",
  () => {

    state.mode = "easy";

    syncModeButtons();
  }
);

els.hardMode.addEventListener(
  "click",
  () => {

    state.mode = "hard";

    syncModeButtons();
  }
);

els.realTime.addEventListener(
  "click",
  () => {

    state.matchType = "Real-Time";

    syncMatchButtons();
  }
);

els.turnBased.addEventListener(
  "click",
  () => {

    state.matchType = "Turn-Based";

    syncMatchButtons();
  }
);

status(
  firebaseReady
    ? "Firebase ready."
    : "Firebase missing."
);

renderAll();
