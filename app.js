// ─── Firebase ─────────────────────────────────────────────────────────────────

const firebaseConfig = window.CIPHERROOM_FIREBASE || {};
const firebaseBase = (firebaseConfig.databaseURL || "https://cipherroom-5fd37-default-rtdb.firebaseio.com").replace(/\/$/, "");
const firebaseReady = Boolean(firebaseBase);

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND_MS = 3 * 60 * 1000; // 3 minutes
const POLL_MS  = 2000;
const digits   = "0123456789";

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  mode:            "easy",
  matchType:       "Real-Time",
  codeLength:      3,
  repeats:         false,
  playerSecret:    "",
  playerHistory:   [],
  opponentHistory: [],
  wins:            0,
  streak:          0,
  guesses:         0,
  online:          false,
  role:            null,
  roomCode:        "ABCD",
  poller:          null,
  timerInterval:   null,
  secretLocked:    false,   // local lock state (disables input / flips button)
  roundNumber:     0,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const els = {
  themeToggle:          document.querySelector("#themeToggle"),
  createRoom:           document.querySelector("#createRoom"),
  joinRoom:             document.querySelector("#joinRoom"),
  roomInput:            document.querySelector("#roomInput"),
  roomCode:             document.querySelector("#roomCode"),
  connectionStatus:     document.querySelector("#connectionStatus"),
  easyMode:             document.querySelector("#easyMode"),
  hardMode:             document.querySelector("#hardMode"),
  realTime:             document.querySelector("#realTime"),
  turnBased:            document.querySelector("#turnBased"),
  repeatDigits:         document.querySelector("#repeatDigits"),
  codeLength:           document.querySelector("#codeLength"),
  winCondition:         document.querySelector("#winCondition"),
  modeBadge:            document.querySelector("#modeBadge"),
  matchBadge:           document.querySelector("#matchBadge"),
  opponentTitle:        document.querySelector("#opponentTitle"),
  opponentHistoryTitle: document.querySelector("#opponentHistoryTitle"),
  secretInput:          document.querySelector("#secretInput"),
  lockSecret:           document.querySelector("#lockSecret"),
  secretStatus:         document.querySelector("#secretStatus"),
  guessForm:            document.querySelector("#guessForm"),
  guessInput:           document.querySelector("#guessInput"),
  historyList:          document.querySelector("#historyList"),
  novaHistoryList:      document.querySelector("#novaHistoryList"),
  novaModeLabel:        document.querySelector("#novaModeLabel"),
  digitGrid:            document.querySelector("#digitGrid"),
  resetMatch:           document.querySelector("#resetMatch"),
  winsStat:             document.querySelector("#winsStat"),
  streakStat:           document.querySelector("#streakStat"),
  accuracyStat:         document.querySelector("#accuracyStat"),
};

// ─── Inject overtime / timer UI (not in original HTML) ───────────────────────

const timerEl = document.createElement("p");
timerEl.id = "roundTimer";
timerEl.role = "status";
timerEl.style.cssText = "font-size:1rem;font-weight:700;margin:4px 0 0;letter-spacing:.04em;min-height:1.4em;";
els.secretStatus.parentNode.insertBefore(timerEl, els.secretStatus.nextSibling);

const overtimeEl = document.createElement("div");
overtimeEl.id = "overtimePanel";
overtimeEl.style.cssText = "display:none;margin-top:8px;";
overtimeEl.innerHTML = `
  <p style="margin:0 0 6px;font-weight:600;">Time's up! Vote to continue:</p>
  <button id="voteOvertime" type="button" class="primary-action small" style="margin-right:6px;">Overtime</button>
  <button id="voteDraw"     type="button" class="secondary-action small">End as Draw</button>
`;
timerEl.parentNode.insertBefore(overtimeEl, timerEl.nextSibling);

const voteOvertimeBtn = overtimeEl.querySelector("#voteOvertime");
const voteDrawBtn     = overtimeEl.querySelector("#voteDraw");

// ─── Utilities ────────────────────────────────────────────────────────────────

function randomRoomCode() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
}

function makeSecret(length, repeats) {
  let pool = digits.split("");
  let code = "";
  while (code.length < length) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    code += pick;
    if (!repeats) pool = pool.filter(d => d !== pick);
  }
  return code;
}

function validNumber(value) {
  const clean = value.trim();
  if (!new RegExp(`^\\d{${state.codeLength}}$`).test(clean))
    return { ok: false, message: `Use exactly ${state.codeLength} digits.` };
  if (!state.repeats && new Set(clean).size !== clean.length)
    return { ok: false, message: "Repeated digits are off for this room." };
  return { ok: true, value: clean };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreEasy(guess, secret) {
  const result    = Array(guess.length).fill("gray");
  const remaining = {};
  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) result[i] = "green";
    else remaining[secret[i]] = (remaining[secret[i]] || 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "green") continue;
    if (remaining[guess[i]] > 0) { result[i] = "yellow"; remaining[guess[i]]--; }
  }
  return result;
}

function scoreHard(guess, secret) {
  const counts = {};
  for (const d of secret) counts[d] = (counts[d] || 0) + 1;
  return guess.split("").map(d => {
    if (counts[d] > 0) { counts[d]--; return "yellow"; }
    return "gray";
  });
}

function scoreGuess(guess, secret) {
  return state.mode === "easy" ? scoreEasy(guess, secret) : scoreHard(guess, secret);
}

function clueSymbol(type) {
  return type === "green" ? "✓" : type === "yellow" ? "•" : "×";
}

// ─── Firebase helpers ─────────────────────────────────────────────────────────

const roomUrl = code => `${firebaseBase}/rooms/${code}.json`;

async function fbGet(code) {
  const r = await fetch(roomUrl(code));
  if (!r.ok) throw new Error("Could not reach Firebase.");
  return r.json();
}

async function fbPut(code, value) {
  const r = await fetch(roomUrl(code), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error("Could not save room.");
  return r.json();
}

async function fbPatch(path, value) {
  const r = await fetch(`${firebaseBase}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error("Could not update room.");
  return r.json();
}

// ─── Settings sync ────────────────────────────────────────────────────────────

function roomSettings() {
  return {
    mode:         state.mode,
    matchType:    state.matchType,
    codeLength:   state.codeLength,
    repeats:      state.repeats,
    winCondition: els.winCondition.value,
  };
}

function applySettings(s) {
  if (!s) return;
  state.mode      = s.mode      || "easy";
  state.matchType = s.matchType || "Real-Time";
  state.codeLength = Number(s.codeLength || 3);
  state.repeats   = Boolean(s.repeats);
  els.codeLength.value       = String(state.codeLength);
  els.repeatDigits.checked   = state.repeats;
  els.winCondition.value     = s.winCondition || "First correct guess";
  els.secretInput.maxLength  = state.codeLength;
  els.guessInput.maxLength   = state.codeLength;
  syncModeButtons();
  syncMatchButtons();
}

function syncModeButtons() {
  els.easyMode.classList.toggle("active", state.mode === "easy");
  els.hardMode.classList.toggle("active", state.mode === "hard");
  els.modeBadge.textContent   = state.mode === "easy" ? "Easy" : "Hard";
  els.novaModeLabel.textContent = state.mode === "easy" ? "Easy clues" : "Hard clues";
}

function syncMatchButtons() {
  els.realTime.classList.toggle("active",  state.matchType === "Real-Time");
  els.turnBased.classList.toggle("active", state.matchType === "Turn-Based");
  els.matchBadge.textContent = state.matchType;
}

function statusMsg(msg) { els.connectionStatus.textContent = msg; }

// ─── Lock-button UI ───────────────────────────────────────────────────────────

function applyLockUI(locked) {
  state.secretLocked          = locked;
  els.secretInput.disabled    = locked;
  els.lockSecret.textContent  = locked ? "Secret Locked" : "Lock Secret";
  els.lockSecret.disabled     = locked;
  els.lockSecret.classList.toggle("locked-btn", locked);
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function stopTimer() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  timerEl.textContent = "";
  timerEl.style.color = "";
}

function startTimer(roundStartedAt) {
  stopTimer();
  overtimeEl.style.display = "none";

  function tick() {
    const remaining = ROUND_MS - (Date.now() - roundStartedAt);
    if (remaining <= 0) {
      stopTimer();
      timerEl.textContent = "⏰ Time's up!";
      overtimeEl.style.display = "block";
      // Host writes timedOut flag so both clients know
      if (state.role === "host") {
        fbPatch(`rooms/${state.roomCode}`, { timedOut: true, overtimeVotes: {} }).catch(() => {});
      }
      return;
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
    timerEl.textContent = `⏱ ${m}:${s} remaining`;
    timerEl.style.color = remaining < 30000 ? "var(--clue-wrong, #e44)" : "";
  }

  tick();
  state.timerInterval = setInterval(tick, 500);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function historyRow(turn) {
  const clueHtml = turn.clues
    .map(c => `<span class="clue ${c}" title="${c}">${clueSymbol(c)}</span>`)
    .join("");
  return `<span class="guess-number">${turn.guess}</span><span class="clues">${clueHtml}</span>`;
}

function renderHistoryList(listEl, turns, emptyText) {
  listEl.innerHTML = "";
  if (!turns.length) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `<span class="guess-number">---</span><span class="clues"><span class="section-title">${emptyText}</span></span>`;
    listEl.append(li);
    return;
  }
  // prepend so newest is on top
  [...turns].reverse().forEach(turn => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = historyRow(turn);
    listEl.append(li);
  });
}

function renderHistories() {
  renderHistoryList(els.historyList,     state.playerHistory,   "No guesses yet");
  renderHistoryList(els.novaHistoryList, state.opponentHistory,
    state.online ? "Friend has not guessed yet" : "Nova has not guessed");
}

function trackerState() {
  const known = Object.fromEntries(digits.split("").map(d => [d, "unknown"]));
  state.playerHistory.forEach(turn => {
    turn.guess.split("").forEach((digit, i) => {
      const clue = turn.clues[i];
      if (clue === "green" || clue === "yellow") known[digit] = "exists";
      else if (known[digit] !== "exists") known[digit] = "absent";
    });
  });
  return known;
}

function renderTracker() {
  if (state.mode === "hard") {
    els.digitGrid.className   = "tracker-hidden";
    els.digitGrid.textContent = "Tracker unavailable in hard mode.";
    return;
  }
  els.digitGrid.className = "digit-grid";
  els.digitGrid.innerHTML = "";
  const known = trackerState();
  for (const digit of digits) {
    const cell = document.createElement("div");
    cell.className = "digit-cell";
    const sym = known[digit] === "exists" ? "✓" : known[digit] === "absent" ? "×" : "?";
    cell.innerHTML = `<span>${digit}</span><span>${sym}</span>`;
    els.digitGrid.append(cell);
  }
}

function renderStats() {
  const acc = state.guesses ? Math.round((state.wins / state.guesses) * 100) : 0;
  els.winsStat.textContent    = state.wins;
  els.streakStat.textContent  = state.streak;
  els.accuracyStat.textContent = `${acc}%`;
}

function renderLabels() {
  els.opponentTitle.textContent        = state.online ? "Friend room is connected" : "Choose a mode, then race Nova";
  els.opponentHistoryTitle.textContent = state.online ? "Friend's Guesses" : "Nova's Guesses";
}

function renderAll() {
  renderLabels();
  renderHistories();
  renderTracker();
  renderStats();
}

// ─── Local (vs Nova) ─────────────────────────────────────────────────────────

function clearLocalMatch(message) {
  state.playerHistory   = [];
  state.opponentHistory = [];
  state.guesses         = 0;
  const newSecret       = makeSecret(state.codeLength, state.repeats);
  state.opponentSecret  = newSecret;       // Nova's secret (hidden)
  // Unlock so player can set their own secret for the new round
  applyLockUI(false);
  els.secretInput.value = "";
  els.guessInput.value  = state.codeLength === 3 ? "538" : makeSecret(state.codeLength, state.repeats);
  els.secretStatus.textContent = message;
  renderAll();
}

function novaTurn(playerSecret) {
  const guess = makeSecret(state.codeLength, state.repeats);
  const clues = scoreGuess(guess, playerSecret);
  state.opponentHistory.push({ guess, clues });
  if (guess === playerSecret) {
    state.streak = 0;
    els.secretStatus.textContent = `Nova guessed your secret ${playerSecret}! Nova wins this room.`;
    return true;
  }
  return false;
}

// ─── Polling / sync ───────────────────────────────────────────────────────────

function stopPolling() {
  if (state.poller) { clearInterval(state.poller); state.poller = null; }
}

async function syncFromRoom() {
  if (!state.online || !state.roomCode) return;

  try {
    const room = await fbGet(state.roomCode);
    if (!room) { statusMsg("Room no longer exists."); return; }

    applySettings(room.settings);

    const opponentRole = state.role === "host" ? "guest" : "host";
    const players      = room.players || {};
    const me           = players[state.role]   || {};
    const opponent     = players[opponentRole] || {};

    // Reflect lock state from Firebase (covers rejoins, refreshes)
    if (me.locked && !state.secretLocked) applyLockUI(true);

    // Only show turns from the current round — clears history between rounds
    const currentRound = room.roundNumber || 0;
    state.roundNumber  = currentRound;
    const allTurns     = Array.isArray(room.turns) ? room.turns : [];
    const roundTurns   = allTurns.filter(t => (t.round || 0) === currentRound);

    state.playerHistory   = roundTurns.filter(t => t.by === state.role);
    state.opponentHistory = roundTurns.filter(t => t.by === opponentRole);

    // Opponent's secret (only visible once they've locked)
    state.opponentSecret = opponent.locked ? opponent.secret : "";

    // Timer — start when both are locked and roundStartedAt exists
    if (state.matchType === "Real-Time" && room.roundStartedAt && !state.timerInterval && !room.timedOut) {
      startTimer(room.roundStartedAt);
    }
    if (room.timedOut && state.timerInterval) {
      stopTimer();
      timerEl.textContent      = "⏰ Time's up!";
      overtimeEl.style.display = "block";
    }

    // Overtime votes: if both voted overtime, host extends the round
    if (room.timedOut && room.overtimeVotes) {
      const votes = Object.values(room.overtimeVotes);
      if (votes.filter(v => v === "overtime").length === 2) {
        // Both voted overtime — extend
        if (state.role === "host") {
          await fbPatch(`rooms/${state.roomCode}`, {
            timedOut:       false,
            roundStartedAt: Date.now(),
            overtimeVotes:  {},
          });
        }
        overtimeEl.style.display = "none";
      } else if (votes.filter(v => v === "draw").length >= 1 && votes.length === 2) {
        // One or both voted draw
        timerEl.textContent      = "Round ended in a draw.";
        overtimeEl.style.display = "none";
      }
    }

    // Status bar
    const hostLocked  = players.host?.locked;
    const guestLocked = players.guest?.locked;
    if (hostLocked && guestLocked) {
      statusMsg(`Room ${state.roomCode} — both secrets locked. Match is live!`);
    } else if (opponent.secret) {
      statusMsg(`Room ${state.roomCode} — waiting for both players to lock secrets.`);
    } else {
      statusMsg(`Room ${state.roomCode} ready. Waiting for your friend to join.`);
    }

    renderAll();
  } catch (err) {
    statusMsg(err.message);
  }
}

function startPolling() {
  stopPolling();
  syncFromRoom();
  state.poller = setInterval(syncFromRoom, POLL_MS);
}

// ─── Room create / join ───────────────────────────────────────────────────────

async function createOnlineRoom() {
  const code = randomRoomCode();
  state.online   = true;
  state.role     = "host";
  state.roomCode = code;
  els.roomInput.value    = code;
  els.roomCode.textContent = code;

  await fbPut(code, {
    createdAt:      Date.now(),
    settings:       roomSettings(),
    roundNumber:    0,
    roundStartedAt: null,
    currentTurn:    null,   // null = not started; set on first guess
    timedOut:       false,
    overtimeVotes:  {},
    players: {
      host:  { secret: "", locked: false, joinedAt: Date.now() },
      guest: { secret: "", locked: false, joinedAt: null },
    },
    turns: [],
  });

  state.playerHistory   = [];
  state.opponentHistory = [];
  applyLockUI(false);
  els.secretInput.value = "";
  els.secretStatus.textContent = `Room ${code} created. Share this code with your friend, then lock your secret.`;
  startPolling();
  renderAll();
}

async function joinOnlineRoom() {
  const code    = els.roomInput.value.trim().toUpperCase();
  if (!code || code.length !== 4) { statusMsg("Enter a 4-character room code first."); return; }

  const room = await fbGet(code);
  if (!room) { statusMsg(`Room ${code} was not found.`); return; }

  state.online   = true;
  state.role     = "guest";
  state.roomCode = code;
  applySettings(room.settings);
  els.roomCode.textContent = code;

  // Only reset guest if they haven't already locked
  const existingGuest = room?.players?.guest;
  if (!existingGuest?.locked) {
    await fbPatch(`rooms/${code}/players/guest`, {
      secret:   "",
      locked:   false,
      joinedAt: Date.now(),
    });
  }

  applyLockUI(false);
  els.secretInput.value = "";
  els.secretStatus.textContent = `Joined room ${code}. Enter your secret number and lock it.`;
  startPolling();
  renderAll();
}

// ─── Lock secret ──────────────────────────────────────────────────────────────

async function lockPlayerSecret() {
  const checked = validNumber(els.secretInput.value);
  if (!checked.ok) { els.secretStatus.textContent = checked.message; return; }

  if (state.secretLocked) {
    els.secretStatus.textContent = "Secret already locked.";
    return;
  }

  state.playerSecret = checked.value;

  if (state.online) {
    try {
      const room = await fbGet(state.roomCode);

      // Cannot lock once guesses have started this round
      const currentRound = room.roundNumber || 0;
      const allTurns     = Array.isArray(room.turns) ? room.turns : [];
      const roundTurns   = allTurns.filter(t => (t.round || 0) === currentRound);
      if (roundTurns.length > 0) {
        els.secretStatus.textContent = "Cannot change secret once the round has started.";
        return;
      }

      if (room?.players?.[state.role]?.locked) {
        els.secretStatus.textContent = "Secret already locked for this round.";
        applyLockUI(true);
        return;
      }

      await fbPatch(`rooms/${state.roomCode}/players/${state.role}`, {
        secret:    checked.value,
        locked:    true,
        updatedAt: Date.now(),
      });

      applyLockUI(true);

      // Check if both are now locked
      const updated     = await fbGet(state.roomCode);
      const hostLocked  = updated?.players?.host?.locked;
      const guestLocked = updated?.players?.guest?.locked;

      if (hostLocked && guestLocked) {
        els.secretStatus.textContent = "Both secrets locked — match is live! Start guessing.";
      } else {
        els.secretStatus.textContent = "Secret locked. Waiting for your opponent to lock theirs.";
      }
    } catch (err) {
      statusMsg(err.message);
    }
  } else {
    // Local / Nova mode
    applyLockUI(true);
    state.opponentSecret = makeSecret(state.codeLength, state.repeats);
    els.secretStatus.textContent = `Secret locked. Nova's code is hidden. Start guessing!`;
  }
}

// ─── Online guessing ──────────────────────────────────────────────────────────

async function submitOnlineGuess(guess) {
  // Single authoritative fetch — no double-fetch races
  const room         = await fbGet(state.roomCode);
  const opponentRole = state.role === "host" ? "guest" : "host";
  const hostLocked   = room?.players?.host?.locked;
  const guestLocked  = room?.players?.guest?.locked;

  if (!hostLocked || !guestLocked) {
    els.secretStatus.textContent = "Both players must lock secrets before guessing.";
    return;
  }

  if (state.matchType === "Real-Time" && room.timedOut) {
    els.secretStatus.textContent = "Time is up. Vote for overtime or end as a draw.";
    return;
  }

  // Turn-based enforcement — strict alternation
  if (state.matchType === "Turn-Based") {
    const currentRound = room.roundNumber || 0;
    const allTurns     = Array.isArray(room.turns) ? room.turns : [];
    const roundTurns   = allTurns.filter(t => (t.round || 0) === currentRound);

    // Count how many times each player has guessed this round
    const myCount  = roundTurns.filter(t => t.by === state.role).length;
    const oppCount = roundTurns.filter(t => t.by === opponentRole).length;

    // I can only guess if my count equals opponent's count (their turn unlocks mine)
    // Exception: very first guess of the round — whoever goes first is fine
    if (myCount > oppCount) {
      els.secretStatus.textContent = "Wait for your opponent to guess before you can go again.";
      return;
    }
  }

  const opponentSecret = room?.players?.[opponentRole]?.secret;
  if (!opponentSecret) {
    els.secretStatus.textContent = "Your friend has not locked a secret yet.";
    return;
  }

  const currentRound = room.roundNumber || 0;
  const clues        = scoreGuess(guess, opponentSecret);
  const correct      = guess === opponentSecret;
  const allTurns     = Array.isArray(room.turns) ? room.turns : [];

  allTurns.push({
    round:     currentRound,
    by:        state.role,
    guess,
    clues,
    correct,
    createdAt: Date.now(),
  });

  const patch = {
    turns:       allTurns,
    currentTurn: opponentRole,
  };

  // Stamp roundStartedAt on the very first guess (kicks off the real-time timer)
  if (state.matchType === "Real-Time" && !room.roundStartedAt) {
    patch.roundStartedAt = Date.now();
  }

  await fbPatch(`rooms/${state.roomCode}`, patch);
  state.guesses++;

  if (correct) {
    state.wins++;
    state.streak++;
    stopTimer();
    overtimeEl.style.display = "none";
    els.secretStatus.textContent = `You cracked your friend's code! You win room ${state.roomCode}.`;
  } else {
    els.secretStatus.textContent = state.matchType === "Turn-Based"
      ? "Guess sent — your opponent's turn."
      : "Guess sent — keep going!";
  }

  await syncFromRoom();
  renderAll();
}

// ─── Reset / new round ────────────────────────────────────────────────────────

async function resetMatch() {
  stopTimer();
  overtimeEl.style.display = "none";

  if (state.online) {
    if (state.role !== "host") {
      els.secretStatus.textContent = "Only the host can start a new round.";
      return;
    }

    const room        = await fbGet(state.roomCode);
    const nextRound   = (room.roundNumber || 0) + 1;

    await fbPatch(`rooms/${state.roomCode}`, {
      roundNumber:    nextRound,
      roundStartedAt: null,
      currentTurn:    null,
      timedOut:       false,
      overtimeVotes:  {},
    });
    await fbPatch(`rooms/${state.roomCode}/players/host`,  { secret: "", locked: false });
    await fbPatch(`rooms/${state.roomCode}/players/guest`, { secret: "", locked: false });

    applyLockUI(false);
    els.secretInput.value = "";
    state.playerHistory   = [];
    state.opponentHistory = [];
    els.secretStatus.textContent = `Round ${nextRound} started. Both players: enter and lock a new secret.`;
    await syncFromRoom();
    return;
  }

  clearLocalMatch("New round started. Enter and lock your secret to begin.");
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function updateSettingsIfHost() {
  if (state.online && state.role === "host") {
    await fbPatch(`rooms/${state.roomCode}`, { settings: roomSettings() });
  }
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
  state.codeLength              = Number(els.codeLength.value);
  els.secretInput.maxLength     = state.codeLength;
  els.guessInput.maxLength      = state.codeLength;
  clearLocalMatch(`${state.codeLength}-digit round ready. Enter and lock a new secret.`);
  updateSettingsIfHost();
}

// ─── Event listeners ──────────────────────────────────────────────────────────

els.themeToggle.addEventListener("click", () => {
  document.documentElement.classList.toggle("light");
});

els.createRoom.addEventListener("click", async () => {
  try {
    if (!firebaseReady) {
      const code = randomRoomCode();
      state.online = false; state.role = null; state.roomCode = code;
      els.roomInput.value = code; els.roomCode.textContent = code;
      statusMsg("Room code created for demo only. Add Firebase config for friend multiplayer.");
      clearLocalMatch("Local demo room created. Lock your secret to race Nova.");
      return;
    }
    await createOnlineRoom();
  } catch (err) { statusMsg(err.message); }
});

els.joinRoom.addEventListener("click", async () => {
  try {
    if (!firebaseReady) {
      statusMsg("Join needs Firebase config. GitHub Pages alone cannot sync two devices.");
      return;
    }
    await joinOnlineRoom();
  } catch (err) { statusMsg(err.message); }
});

els.roomInput.addEventListener("input", () => {
  els.roomInput.value      = els.roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  els.roomCode.textContent = els.roomInput.value || "----";
});

els.easyMode.addEventListener("click",  () => setMode("easy"));
els.hardMode.addEventListener("click",  () => setMode("hard"));
els.realTime.addEventListener("click",  () => setMatchType("Real-Time"));
els.turnBased.addEventListener("click", () => setMatchType("Turn-Based"));

els.repeatDigits.addEventListener("change", () => {
  state.repeats = els.repeatDigits.checked;
  syncLength();
});

els.codeLength.addEventListener("change", syncLength);

els.lockSecret.addEventListener("click", lockPlayerSecret);

els.guessForm.addEventListener("submit", async event => {
  event.preventDefault();
  const checked = validNumber(els.guessInput.value);
  if (!checked.ok) { els.secretStatus.textContent = checked.message; return; }

  const guess = checked.value;

  if (state.online) {
    await submitOnlineGuess(guess);
    return;
  }

  // ── Local / Nova mode ──
  if (!state.secretLocked) {
    els.secretStatus.textContent = "Lock your secret before guessing.";
    return;
  }

  const clues   = scoreGuess(guess, state.opponentSecret);
  state.playerHistory.push({ guess, clues });
  state.guesses++;

  if (guess === state.opponentSecret) {
    state.wins++;
    state.streak++;
    els.secretStatus.textContent = `You solved Nova's code ${state.opponentSecret}! You win.`;
  } else {
    const novaWon = novaTurn(state.playerSecret);
    if (!novaWon) {
      const wc = els.winCondition.value;
      els.secretStatus.textContent = wc === "Timed match"
        ? "Guess logged. Nova answered. Timer pressure stays on."
        : wc === "Point system"
          ? "Guess logged. Nova answered. Partial clues feed the point system."
          : "Guess logged. Nova guessed — check their history.";
    }
  }

  renderAll();
});

els.resetMatch.addEventListener("click", resetMatch);

// Overtime vote buttons
voteOvertimeBtn.addEventListener("click", async () => {
  if (!state.online) return;
  await fbPatch(`rooms/${state.roomCode}/overtimeVotes`, { [state.role]: "overtime" });
  voteOvertimeBtn.disabled = true;
  voteOvertimeBtn.textContent = "Voted — Overtime";
  await syncFromRoom();
});

voteDrawBtn.addEventListener("click", async () => {
  if (!state.online) return;
  await fbPatch(`rooms/${state.roomCode}/overtimeVotes`, { [state.role]: "draw" });
  voteDrawBtn.disabled = true;
  voteDrawBtn.textContent = "Voted — Draw";
  timerEl.textContent      = "You voted to end as a draw.";
  overtimeEl.style.display = "none";
  await syncFromRoom();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

statusMsg(firebaseReady
  ? "Firebase ready. Create or join a room to play with a friend."
  : "Local demo mode. Add Firebase config for real friend multiplayer."
);
clearLocalMatch("Enter your secret number and lock it to start.");
