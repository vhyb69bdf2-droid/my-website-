const firebaseConfig = window.CIPHERROOM_FIREBASE || {};
const firebaseBase =
  (firebaseConfig.databaseURL || "")
    .replace(/\/$/, "");

const firebaseReady = Boolean(firebaseBase);

const ROUND_TIME = 180;

const state = {
  mode: "easy",
  matchType: "Real-Time",

  codeLength: 3,
  repeats: false,

  online: false,
  role: null,
  roomCode: "",

  playerSecret: "",
  opponentSecret: "",

  playerHistory: [],
  opponentHistory: [],

  timer: null
};

const els = {
  createRoom: document.querySelector("#createRoom"),
  joinRoom: document.querySelector("#joinRoom"),
  roomInput: document.querySelector("#roomInput"),
  roomCode: document.querySelector("#roomCode"),

  secretInput: document.querySelector("#secretInput"),
  lockSecret: document.querySelector("#lockSecret"),
  secretStatus: document.querySelector("#secretStatus"),

  guessForm: document.querySelector("#guessForm"),
  guessInput: document.querySelector("#guessInput"),

  historyList: document.querySelector("#historyList"),
  novaHistoryList: document.querySelector("#novaHistoryList"),

  realTime: document.querySelector("#realTime"),
  turnBased: document.querySelector("#turnBased")
};

function roomUrl(code) {
  return `${firebaseBase}/rooms/${code}.json`;
}

async function firebaseGet(code) {

  const res =
    await fetch(roomUrl(code));

  return res.json();
}

async function firebasePut(code, value) {

  return fetch(roomUrl(code), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(value)
  });
}

async function firebasePatch(path, value) {

  return fetch(
    `${firebaseBase}/${path}.json`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(value)
    }
  );
}

function randomRoomCode() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let result = "";

  for (let i = 0; i < 4; i++) {

    result +=
      chars[
        Math.floor(
          Math.random() * chars.length
        )
      ];
  }

  return result;
}

function validNumber(value) {

  return /^\d{3}$/.test(value);
}

function scoreGuess(guess, secret) {

  const result = [];

  for (let i = 0; i < guess.length; i++) {

    if (guess[i] === secret[i]) {

      result.push("green");

    } else if (
      secret.includes(guess[i])
    ) {

      result.push("yellow");

    } else {

      result.push("gray");
    }
  }

  return result;
}

function renderHistory(
  list,
  history
) {

  list.innerHTML = "";

  history.forEach((turn) => {

    const li =
      document.createElement("li");

    li.innerHTML =
      `${turn.guess} - ${turn.clues.join(" ")}`;

    list.prepend(li);
  });
}

function startTimer(seconds) {

  let timerEl =
    document.querySelector("#timer");

  if (!timerEl) {

    timerEl =
      document.createElement("div");

    timerEl.id = "timer";

    timerEl.style.fontSize = "22px";
    timerEl.style.fontWeight = "700";
    timerEl.style.marginTop = "10px";

    els.secretStatus.after(timerEl);
  }

  clearInterval(state.timer);

  let remaining = seconds;

  timerEl.textContent =
    `⏱ ${remaining}s`;

  state.timer = setInterval(() => {

    remaining--;

    timerEl.textContent =
      `⏱ ${remaining}s`;

    if (remaining <= 0) {

      clearInterval(state.timer);

      timerEl.textContent =
        "⏰ Time Up";
    }

  }, 1000);
}

async function syncRoom() {

  if (!state.online) return;

  const room =
    await firebaseGet(state.roomCode);

  if (!room) return;

  const opponentRole =
    state.role === "host"
      ? "guest"
      : "host";

  state.opponentSecret =
    room.players[opponentRole].secret;

  state.playerHistory =
    room.turns.filter(
      (t) => t.by === state.role
    );

  state.opponentHistory =
    room.turns.filter(
      (t) => t.by === opponentRole
    );

  renderHistory(
    els.historyList,
    state.playerHistory
  );

  renderHistory(
    els.novaHistoryList,
    state.opponentHistory
  );

  if (
    room.matchType === "Real-Time" &&
    room.startedAt
  ) {

    const elapsed =
      Math.floor(
        (Date.now() - room.startedAt)
        / 1000
      );

    const remaining =
      ROUND_TIME - elapsed;

    if (
      remaining > 0 &&
      !state.timer
    ) {

      startTimer(remaining);
    }
  }
}

setInterval(syncRoom, 1500);

els.realTime.addEventListener(
  "click",
  () => {

    state.matchType =
      "Real-Time";
  }
);

els.turnBased.addEventListener(
  "click",
  () => {

    state.matchType =
      "Turn-Based";
  }
);

els.createRoom.addEventListener(
  "click",
  async () => {

    const code =
      randomRoomCode();

    state.online = true;
    state.role = "host";
    state.roomCode = code;

    els.roomCode.textContent =
      code;

    await firebasePut(code, {

      matchType:
        state.matchType,

      currentTurn:
        Math.random() > 0.5
          ? "host"
          : "guest",

      startedAt: null,

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

    els.secretStatus.textContent =
      `Room ${code} created`;
  }
);

els.joinRoom.addEventListener(
  "click",
  async () => {

    const code =
      els.roomInput.value
        .trim()
        .toUpperCase();

    const room =
      await firebaseGet(code);

    if (!room) {

      els.secretStatus.textContent =
        "Room not found";

      return;
    }

    state.online = true;
    state.role = "guest";
    state.roomCode = code;

    els.roomCode.textContent =
      code;

    els.secretStatus.textContent =
      `Joined ${code}`;
  }
);

els.lockSecret.addEventListener(
  "click",
  async () => {

    const value =
      els.secretInput.value.trim();

    if (!validNumber(value)) {

      els.secretStatus.textContent =
        "Enter 3 digits";

      return;
    }

    state.playerSecret = value;

    await firebasePatch(
      `rooms/${state.roomCode}/players/${state.role}`,
      {
        secret: value,
        locked: true
      }
    );

    els.lockSecret.textContent =
      "Secret Locked ✓";

    els.lockSecret.disabled =
      true;

    els.secretInput.disabled =
      true;

    const room =
      await firebaseGet(state.roomCode);

    if (
      room.players.host.locked &&
      room.players.guest.locked
    ) {

      els.secretStatus.textContent =
        "Both secrets locked";

      if (
        room.matchType ===
        "Real-Time"
      ) {

        await firebasePatch(
          `rooms/${state.roomCode}`,
          {
            startedAt: Date.now()
          }
        );

        startTimer(ROUND_TIME);
      }

    } else {

      els.secretStatus.textContent =
        "Waiting for opponent";
    }
  }
);

els.guessForm.addEventListener(
  "submit",
  async (e) => {

    e.preventDefault();

    const guess =
      els.guessInput.value.trim();

    if (!validNumber(guess)) {

      els.secretStatus.textContent =
        "Invalid guess";

      return;
    }

    const room =
      await firebaseGet(state.roomCode);

    if (
      !room.players.host.locked ||
      !room.players.guest.locked
    ) {

      els.secretStatus.textContent =
        "Both secrets must lock";

      return;
    }

    if (
      room.matchType ===
      "Turn-Based"
    ) {

      if (
        room.currentTurn !==
        state.role
      ) {

        els.secretStatus.textContent =
          "Wait for your turn";

        return;
      }
    }

    const opponentRole =
      state.role === "host"
        ? "guest"
        : "host";

    const opponentSecret =
      room.players[
        opponentRole
      ].secret;

    const clues =
      scoreGuess(
        guess,
        opponentSecret
      );

    room.turns.push({
      by: state.role,
      guess,
      clues
    });

    const patch = {
      turns: room.turns
    };

    if (
      room.matchType ===
      "Turn-Based"
    ) {

      patch.currentTurn =
        opponentRole;
    }

    await firebasePatch(
      `rooms/${state.roomCode}`,
      patch
    );

    if (
      guess === opponentSecret
    ) {

      els.secretStatus.textContent =
        "You Win";

    } else {

      els.secretStatus.textContent =
        room.matchType ===
        "Turn-Based"
          ? "Opponent turn"
          : "Guess sent";
    }

    syncRoom();
  }
);
