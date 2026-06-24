// ─── Firebase ─────────────────────────────────────────────────────────────────

const firebaseConfig = window.CIPHERROOM_FIREBASE || {};
const firebaseBase   = (firebaseConfig.databaseURL || "https://cipherroom-5fd37-default-rtdb.firebaseio.com").replace(/\/$/, "");
const firebaseReady  = Boolean(firebaseBase);

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND_MS        = 3 * 60 * 1000;
const POLL_MS         = 2000;
const AUTO_RESTART_MS = 4000;
const digits          = "0123456789";

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  // Mode: "multiplayer" | "group" | "nova"
  playMode:        null,
  novaDifficulty:  "easy",
  clueMode:        "easy",   // "easy" | "hard"
  codeLength:      3,
  repeats:         false,

  // 1v1
  matchType:       "Real-Time",
  online:          false,
  role:            null,
  roomCode:        null,
  poller:          null,
  timerInterval:   null,
  secretLocked:    false,
  playerSecret:    "",
  opponentSecret:  "",
  playerHistory:   [],
  opponentHistory: [],
  roundNumber:     0,

  // Group
  groupMatchType:    "Real-Time",
  groupVisibility:   "all",   // "all" | "own"
  groupOnline:       false,
  groupRoomCode:     null,
  groupPoller:       null,
  groupTimerInterval:null,
  groupPlayerName:   null,   // e.g. "player_1234"
  groupSecret:       "",     // the shared auto-generated code

  // Nova AI
  novaCandidates:  [],
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const q  = id => document.querySelector(id);
const els = {
  // Picker
  modePicker:          q("#modePicker"),
  pickCards:           q("#pickCards"),
  pickMultiplayer:     q("#pickMultiplayer"),
  pickGroup:           q("#pickGroup"),
  pickNova:            q("#pickNova"),
  novaDiffPicker:      q("#novaDiffPicker"),
  backToModes:         q("#backToModes"),

  // Nav
  brandHome:           q("#brandHome"),
  switchMode:          q("#switchMode"),
  themeToggle:         q("#themeToggle"),

  // Control panel sections
  multiControls:       q("#multiControls"),
  multiGroupControls:  q("#multiGroupControls"),
  novaControls:        q("#novaControls"),
  controlEyebrow:      q("#controlEyebrow"),
  controlTitle:        q("#controlTitle"),

  // 1v1 controls
  createRoom:          q("#createRoom"),
  joinRoom:            q("#joinRoom"),
  roomInput:           q("#roomInput"),
  roomCode:            q("#roomCode"),
  connectionStatus:    q("#connectionStatus"),
  realTime:            q("#realTime"),
  turnBased:           q("#turnBased"),

  // Group controls
  createGroupRoom:     q("#createGroupRoom"),
  joinGroupRoom:       q("#joinGroupRoom"),
  groupRoomInput:      q("#groupRoomInput"),
  groupRoomCode:       q("#groupRoomCode"),
  groupStatus:         q("#groupStatus"),
  groupRealTime:       q("#groupRealTime"),
  groupTurnBased:      q("#groupTurnBased"),
  groupEasyVis:        q("#groupEasyVis"),
  groupHardVis:        q("#groupHardVis"),

  // Nova
  diffEasy:            q("#diffEasy"),
  diffMedium:          q("#diffMedium"),
  diffImpossible:      q("#diffImpossible"),
  novaStatus:          q("#novaStatus"),

  // Shared settings
  easyMode:            q("#easyMode"),
  hardMode:            q("#hardMode"),
  repeatDigits:        q("#repeatDigits"),
  codeLength:          q("#codeLength"),

  // Badges
  modeBadge:           q("#modeBadge"),
  matchBadge:          q("#matchBadge"),
  novaDiffBadge:       q("#novaDiffBadge"),

  // Play area — 1v1/Nova
  opponentTitle:       q("#opponentTitle"),
  secretPanel:         q("#secretPanel"),
  secretInput:         q("#secretInput"),
  lockSecret:          q("#lockSecret"),
  secretStatus:        q("#secretStatus"),
  roundTimer:          q("#roundTimer"),
  overtimePanel:       q("#overtimePanel"),
  voteOvertime:        q("#voteOvertime"),
  voteDraw:            q("#voteDraw"),
  turnIndicator:       q("#turnIndicator"),
  roundResult:         q("#roundResult"),
  guessForm:           q("#guessForm"),
  guessInput:          q("#guessInput"),
  standardBoard:       q("#standardBoard"),
  historyList:         q("#historyList"),
  opponentHistoryTitle:q("#opponentHistoryTitle"),
  novaHistoryList:     q("#novaHistoryList"),
  novaModeLabel:       q("#novaModeLabel"),
  digitGrid:           q("#digitGrid"),
  resetMatch:          q("#resetMatch"),

  // Play area — group
  groupSecretPanel:    q("#groupSecretPanel"),
  groupSecretStatus:   q("#groupSecretStatus"),
  groupRoundTimer:     q("#groupRoundTimer"),
  groupTurnIndicator:  q("#groupTurnIndicator"),
  groupRoundResult:    q("#groupRoundResult"),
  groupBoard:          q("#groupBoard"),
  groupBoardWrap:      q("#groupBoardWrap"),
  resetGroupMatch:     q("#resetGroupMatch"),
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function randomRoomCode() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
}

function makeSecret(length, repeats) {
  let pool = digits.split(""), code = "";
  while (code.length < length) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    code += pick;
    if (!repeats) pool = pool.filter(d => d !== pick);
  }
  return code;
}

function allCodes(length, repeats) {
  const results = [];
  function build(cur) {
    if (cur.length === length) { results.push(cur); return; }
    for (const d of digits) {
      if (!repeats && cur.includes(d)) continue;
      build(cur + d);
    }
  }
  build("");
  return results;
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
  const result = Array(guess.length).fill("gray");
  const rem    = {};
  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) result[i] = "green";
    else rem[secret[i]] = (rem[secret[i]] || 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "green") continue;
    if (rem[guess[i]] > 0) { result[i] = "yellow"; rem[guess[i]]--; }
  }
  return result;
}

function scoreHard(guess, secret) {
  const counts = {};
  for (const d of secret) counts[d] = (counts[d] || 0) + 1;
  return guess.split("").map(d => { if (counts[d] > 0) { counts[d]--; return "yellow"; } return "gray"; });
}

function scoreGuess(guess, secret) {
  return state.clueMode === "easy" ? scoreEasy(guess, secret) : scoreHard(guess, secret);
}

function cluesMatchEasy(guess, secret, clues) {
  return scoreEasy(guess, secret).every((c, i) => c === clues[i]);
}

function clueSymbol(c) { return c === "green" ? "✓" : c === "yellow" ? "•" : "×"; }

// ─── Nova AI ─────────────────────────────────────────────────────────────────

function novaInitCandidates() {
  state.novaCandidates = allCodes(state.codeLength, state.repeats);
}

function novaFilterCandidates(guess, clues) {
  state.novaCandidates = state.novaCandidates.filter(c => cluesMatchEasy(guess, c, clues));
}

function novaPickEasy() {
  // Eliminate confirmed-absent digits; pick randomly among remaining
  const absent = new Set();
  state.opponentHistory.forEach(t => t.guess.split("").forEach((d, i) => { if (t.clues[i] === "gray") absent.add(d); }));
  const pool = digits.split("").filter(d => !absent.has(d));
  if (pool.length < state.codeLength) return makeSecret(state.codeLength, state.repeats);
  let code = "", tries = 0;
  while (code.length < state.codeLength && tries++ < 300) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!state.repeats && code.includes(pick)) continue;
    code += pick;
  }
  return code.length === state.codeLength ? code : makeSecret(state.codeLength, state.repeats);
}

function novaPickMedium() {
  if (!state.novaCandidates.length) return makeSecret(state.codeLength, state.repeats);
  return state.novaCandidates[Math.floor(Math.random() * state.novaCandidates.length)];
}

function novaPickImpossible() {
  const cands = state.novaCandidates;
  if (cands.length <= 2) return cands[0] || makeSecret(state.codeLength, state.repeats);
  const pool = cands.length > 30 ? cands.slice(0, 30) : cands;
  let best = cands[0], bestWorst = Infinity;
  for (const guess of pool) {
    const buckets = {};
    for (const c of cands) { const k = scoreEasy(guess, c).join(","); buckets[k] = (buckets[k] || 0) + 1; }
    const worst = Math.max(...Object.values(buckets));
    if (worst < bestWorst) { bestWorst = worst; best = guess; }
  }
  return best;
}

function novaPick() {
  switch (state.novaDifficulty) {
    case "medium":     return novaPickMedium();
    case "impossible": return novaPickImpossible();
    default:           return novaPickEasy();
  }
}

function novaTakeTurn() {
  const guess = novaPick();
  const clues = scoreEasy(guess, state.playerSecret);
  state.opponentHistory.push({ guess, clues });
  if (state.novaDifficulty !== "easy") novaFilterCandidates(guess, clues);
  return guess === state.playerSecret;
}

// ─── Firebase helpers ─────────────────────────────────────────────────────────

const roomUrl  = code => `${firebaseBase}/rooms/${code}.json`;
const groupUrl = code => `${firebaseBase}/groupRooms/${code}.json`;

async function fbGet(code)          { const r = await fetch(roomUrl(code));  if (!r.ok) throw new Error("Firebase read failed."); return r.json(); }
async function fbGetGroup(code)     { const r = await fetch(groupUrl(code)); if (!r.ok) throw new Error("Firebase read failed."); return r.json(); }

async function fbPut(code, val) {
  const r = await fetch(roomUrl(code), { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(val) });
  if (!r.ok) throw new Error("Firebase write failed."); return r.json();
}
async function fbPutGroup(code, val) {
  const r = await fetch(groupUrl(code), { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(val) });
  if (!r.ok) throw new Error("Firebase write failed."); return r.json();
}
async function fbPatch(path, val) {
  const r = await fetch(`${firebaseBase}/${path}.json`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(val) });
  if (!r.ok) throw new Error("Firebase patch failed."); return r.json();
}

// ─── Cross-device lock fix ────────────────────────────────────────────────────
// Firebase REST can return a stale snapshot immediately after a PATCH from
// another device. We retry fbGet up to 5 times with a short delay until both
// players show as locked, before deciding the state is definitive.

async function fbGetUntilBothLocked(code, myRole, maxRetries = 5, delayMs = 600) {
  for (let i = 0; i < maxRetries; i++) {
    const room = await fbGet(code);
    const h = room?.players?.host?.locked;
    const g = room?.players?.guest?.locked;
    if (h && g) return room;          // both locked — fresh data confirmed
    if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return await fbGet(code);           // return whatever we have after retries
}

// ─── Settings ────────────────────────────────────────────────────────────────

function roomSettings() {
  return { clueMode: state.clueMode, matchType: state.matchType, codeLength: state.codeLength, repeats: state.repeats };
}

function applySettings(s) {
  if (!s) return;
  state.clueMode   = s.clueMode  || "easy";
  state.matchType  = s.matchType || "Real-Time";
  state.codeLength = Number(s.codeLength || 3);
  state.repeats    = Boolean(s.repeats);
  els.codeLength.value      = String(state.codeLength);
  els.repeatDigits.checked  = state.repeats;
  els.secretInput.maxLength = state.codeLength;
  els.guessInput.maxLength  = state.codeLength;
  syncClueButtons();
  syncMatchButtons();
}

function syncClueButtons() {
  els.easyMode.classList.toggle("active", state.clueMode === "easy");
  els.hardMode.classList.toggle("active", state.clueMode === "hard");
  els.modeBadge.textContent     = state.clueMode === "easy" ? "Easy" : "Hard";
  els.novaModeLabel.textContent = state.clueMode === "easy" ? "Easy clues" : "Hard clues";
}

function syncMatchButtons() {
  els.realTime.classList.toggle("active",  state.matchType === "Real-Time");
  els.turnBased.classList.toggle("active", state.matchType === "Turn-Based");
  els.matchBadge.textContent = state.matchType;
}

function syncGroupMatchButtons() {
  els.groupRealTime.classList.toggle("active",  state.groupMatchType === "Real-Time");
  els.groupTurnBased.classList.toggle("active", state.groupMatchType === "Turn-Based");
}

function syncGroupVisButtons() {
  els.groupEasyVis.classList.toggle("active", state.groupVisibility === "all");
  els.groupHardVis.classList.toggle("active", state.groupVisibility === "own");
}

function syncDiffButtons() {
  els.diffEasy.classList.toggle("active",       state.novaDifficulty === "easy");
  els.diffMedium.classList.toggle("active",     state.novaDifficulty === "medium");
  els.diffImpossible.classList.toggle("active", state.novaDifficulty === "impossible");
  const b = els.novaDiffBadge;
  b.textContent = state.novaDifficulty.charAt(0).toUpperCase() + state.novaDifficulty.slice(1);
  b.className   = state.novaDifficulty;
}

// ─── Lock button UI ───────────────────────────────────────────────────────────

function applyLockUI(locked) {
  state.secretLocked         = locked;
  els.secretInput.disabled   = locked;
  els.lockSecret.textContent = locked ? "Secret Locked" : "Lock Secret";
  els.lockSecret.disabled    = locked;
  els.lockSecret.classList.toggle("locked-btn", locked);
}

// ─── Result banner ────────────────────────────────────────────────────────────

function showResult(el, type, msg) { el.textContent = msg; el.className = type; el.style.display = "block"; }
function hideResult(el)            { el.style.display = "none"; el.className = ""; }

// ─── Timer ────────────────────────────────────────────────────────────────────

function stopTimer(timerEl, intervalKey) {
  if (state[intervalKey]) { clearInterval(state[intervalKey]); state[intervalKey] = null; }
  if (timerEl) timerEl.textContent = "";
}

function startTimerEl(timerEl, intervalKey, roundStartedAt, onExpire) {
  stopTimer(timerEl, intervalKey);
  function tick() {
    const rem = ROUND_MS - (Date.now() - roundStartedAt);
    if (rem <= 0) {
      stopTimer(timerEl, intervalKey);
      timerEl.textContent = "⏰ Time's up!";
      onExpire();
      return;
    }
    const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000).toString().padStart(2, "0");
    timerEl.textContent = `⏱ ${m}:${s} remaining`;
    timerEl.style.color = rem < 30000 ? "var(--red)" : "var(--cyan)";
  }
  tick();
  state[intervalKey] = setInterval(tick, 500);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function historyRow(turn) {
  const ch = turn.clues.map(c => `<span class="clue ${c}" title="${c}">${clueSymbol(c)}</span>`).join("");
  return `<span class="guess-number">${turn.guess}</span><span class="clues">${ch}</span>`;
}

function renderHistoryList(listEl, turns, emptyText) {
  listEl.innerHTML = "";
  if (!turns.length) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `<span class="guess-number">---</span><span class="clues"><em style="color:var(--muted);font-style:normal;font-size:.85rem">${emptyText}</em></span>`;
    listEl.append(li);
    return;
  }
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
    state.playMode === "multiplayer" ? "Friend has not guessed yet" : "Nova has not guessed yet");
}

function trackerState() {
  const known = Object.fromEntries(digits.split("").map(d => [d, "unknown"]));
  state.playerHistory.forEach(t => t.guess.split("").forEach((d, i) => {
    const c = t.clues[i];
    if (c === "green" || c === "yellow") known[d] = "exists";
    else if (known[d] !== "exists") known[d] = "absent";
  }));
  return known;
}

function renderTracker() {
  if (state.clueMode === "hard" || state.playMode === "group") {
    els.digitGrid.className   = "tracker-hidden";
    els.digitGrid.textContent = "No tracker in this mode.";
    return;
  }
  els.digitGrid.className = "digit-grid";
  els.digitGrid.innerHTML = "";
  const known = trackerState();
  for (const d of digits) {
    const cell = document.createElement("div");
    cell.className = "digit-cell";
    cell.innerHTML = `<span>${d}</span><span>${known[d] === "exists" ? "✓" : known[d] === "absent" ? "×" : "?"}</span>`;
    els.digitGrid.append(cell);
  }
}

function renderTurnIndicator(currentTurn) {
  const ti = els.turnIndicator;
  if (!state.online || state.matchType !== "Turn-Based") { ti.style.display = "none"; return; }
  ti.style.display = "block";
  if (!currentTurn) { ti.textContent = "Waiting for both players to lock…"; ti.className = ""; }
  else if (currentTurn === state.role) { ti.textContent = "🟢 Your turn!"; ti.className = "your-turn"; }
  else { ti.textContent = "⏳ Opponent's turn…"; ti.className = ""; }
}

function renderLabels() {
  if (state.playMode === "nova") {
    const d = state.novaDifficulty;
    els.opponentTitle.textContent        = `vs Nova · ${d.charAt(0).toUpperCase() + d.slice(1)}`;
    els.opponentHistoryTitle.textContent = "Nova's Guesses";
  } else if (state.playMode === "multiplayer") {
    els.opponentTitle.textContent        = state.online ? "Friend room connected" : "Waiting for opponent";
    els.opponentHistoryTitle.textContent = "Friend's Guesses";
  }
}

function renderAll(currentTurn) {
  renderLabels();
  renderHistories();
  renderTracker();
  renderTurnIndicator(currentTurn);
}

// ─── Group board rendering ────────────────────────────────────────────────────

function renderGroupBoard(room) {
  if (!room) return;
  const players    = room.players || {};
  const allTurns   = Array.isArray(room.turns) ? room.turns : [];
  const round      = room.roundNumber || 0;
  const roundTurns = allTurns.filter(t => (t.round || 0) === round);
  const visibility = room.settings?.groupVisibility || "all";

  els.groupBoardWrap.innerHTML = "";

  const names = Object.keys(players);
  names.forEach(name => {
    const isMe    = name === state.groupPlayerName;
    const myTurns = roundTurns.filter(t => t.by === name);
    const show    = visibility === "all" || isMe;

    const col = document.createElement("div");
    col.className = "group-col";
    col.innerHTML = `<h4>${isMe ? "You" : name.replace("player_", "Player ")}${isMe ? " (you)" : ""}</h4>`;

    const ol = document.createElement("ol");
    ol.className = "history-list";

    if (!show) {
      const li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML = `<span class="guess-number">---</span><span class="clues"><em style="color:var(--muted);font-style:normal;font-size:.85rem">Hidden</em></span>`;
      ol.append(li);
    } else if (!myTurns.length) {
      const li = document.createElement("li");
      li.className = "history-item";
      li.innerHTML = `<span class="guess-number">---</span><span class="clues"><em style="color:var(--muted);font-style:normal;font-size:.85rem">No guesses yet</em></span>`;
      ol.append(li);
    } else {
      [...myTurns].reverse().forEach(turn => {
        const li = document.createElement("li");
        li.className = "history-item";
        li.innerHTML = historyRow(turn);
        ol.append(li);
      });
    }

    col.append(ol);
    els.groupBoardWrap.append(col);
  });

  // Turn indicator for group turn-based
  const gti = els.groupTurnIndicator;
  if (room.settings?.groupMatchType === "Turn-Based" && room.currentTurn) {
    gti.style.display = "block";
    if (room.currentTurn === state.groupPlayerName) {
      gti.textContent = "🟢 Your turn!";
      gti.className   = "your-turn";
    } else {
      gti.textContent = `⏳ ${room.currentTurn.replace("player_", "Player ")}'s turn…`;
      gti.className   = "";
    }
  } else {
    gti.style.display = "none";
  }
}

// ─── Mode picker UI ───────────────────────────────────────────────────────────

function showModePicker() {
  els.modePicker.style.display     = "flex";
  els.novaDiffPicker.style.display = "none";
  els.pickCards.style.display      = "grid";
}

function hideModePicker() { els.modePicker.style.display = "none"; }

function setControlPanel(mode) {
  els.multiControls.style.display      = mode === "multiplayer" ? "block" : "none";
  els.multiGroupControls.style.display = mode === "group"        ? "block" : "none";
  els.novaControls.style.display       = mode === "nova"         ? "block" : "none";
}

function enterMultiplayerMode() {
  state.playMode = "multiplayer";
  hideModePicker();
  setControlPanel("multiplayer");
  els.controlEyebrow.textContent = "Multiplayer";
  els.controlTitle.textContent   = "Match Setup";
  els.matchBadge.style.display   = "inline";
  els.novaDiffBadge.style.display = "none";
  els.secretPanel.style.display  = "grid";
  els.groupSecretPanel.style.display = "none";
  els.standardBoard.style.display = "grid";
  els.groupBoard.style.display    = "none";
  els.guessInput.maxLength        = state.codeLength;
  syncMatchButtons();
  resetLocalState("Create or join a room, lock your secret, and start guessing.");
}

function enterGroupMode() {
  state.playMode = "group";
  hideModePicker();
  setControlPanel("group");
  els.controlEyebrow.textContent  = "Group Play";
  els.controlTitle.textContent    = "Group Setup";
  els.matchBadge.style.display    = "none";
  els.novaDiffBadge.style.display = "none";
  els.secretPanel.style.display   = "none";
  els.groupSecretPanel.style.display = "block";
  els.standardBoard.style.display = "none";
  els.groupBoard.style.display    = "block";
  els.guessInput.maxLength        = state.codeLength;
  syncGroupMatchButtons();
  syncGroupVisButtons();
  els.groupSecretStatus.textContent = "Create or join a group room to start.";
}

function enterNovaMode(difficulty) {
  state.playMode      = "nova";
  state.novaDifficulty = difficulty || state.novaDifficulty;
  hideModePicker();
  setControlPanel("nova");
  els.controlEyebrow.textContent  = "vs Nova";
  els.controlTitle.textContent    = "Nova Match";
  els.matchBadge.style.display    = "none";
  els.novaDiffBadge.style.display = "inline";
  els.secretPanel.style.display   = "grid";
  els.groupSecretPanel.style.display = "none";
  els.standardBoard.style.display = "grid";
  els.groupBoard.style.display    = "none";
  syncDiffButtons();
  startNovaRound("Enter and lock your secret to begin.");
}

// ─── Nova round ───────────────────────────────────────────────────────────────

function startNovaRound(msg) {
  state.playerHistory   = [];
  state.opponentHistory = [];
  state.opponentSecret  = makeSecret(state.codeLength, state.repeats);
  novaInitCandidates();
  applyLockUI(false);
  els.secretInput.value        = "";
  els.guessInput.value         = "";
  els.secretStatus.textContent = msg;
  hideResult(els.roundResult);
  renderAll();
}

function resetLocalState(msg) {
  state.playerHistory   = [];
  state.opponentHistory = [];
  state.opponentSecret  = "";
  applyLockUI(false);
  els.secretInput.value        = "";
  els.guessInput.value         = "";
  els.secretStatus.textContent = msg;
  hideResult(els.roundResult);
  renderAll();
}

// ─── 1v1 polling ─────────────────────────────────────────────────────────────

function stopPolling() { if (state.poller) { clearInterval(state.poller); state.poller = null; } }

async function syncFromRoom() {
  if (!state.online || !state.roomCode) return;
  try {
    // Use retry-aware fetch so cross-device stale reads resolve
    const room = state.checkingLock
      ? await fbGetUntilBothLocked(state.roomCode, state.role)
      : await fbGet(state.roomCode);
    state.checkingLock = false;

    if (!room) { els.connectionStatus.textContent = "Room no longer exists."; return; }

    applySettings(room.settings);

    const opponentRole = state.role === "host" ? "guest" : "host";
    const players      = room.players || {};
    const me           = players[state.role]   || {};
    const opponent     = players[opponentRole] || {};

    if (me.locked && !state.secretLocked) applyLockUI(true);

    const round      = room.roundNumber || 0;
    state.roundNumber = round;
    const allTurns   = Array.isArray(room.turns) ? room.turns : [];
    const roundTurns = allTurns.filter(t => (t.round || 0) === round);

    state.playerHistory   = roundTurns.filter(t => t.by === state.role);
    state.opponentHistory = roundTurns.filter(t => t.by === opponentRole);
    state.opponentSecret  = opponent.locked ? opponent.secret : "";

    // Timer
    if (state.matchType === "Real-Time" && room.roundStartedAt && !state.timerInterval && !room.timedOut) {
      startTimerEl(els.roundTimer, "timerInterval", room.roundStartedAt, () => {
        els.overtimePanel.style.display = "block";
        if (state.role === "host") fbPatch(`rooms/${state.roomCode}`, { timedOut: true, overtimeVotes: {} }).catch(() => {});
      });
    }
    if (room.timedOut && state.timerInterval) {
      stopTimer(els.roundTimer, "timerInterval");
      els.roundTimer.textContent      = "⏰ Time's up!";
      els.overtimePanel.style.display = "block";
    }

    // Overtime resolution
    if (room.timedOut && room.overtimeVotes) {
      const votes = Object.values(room.overtimeVotes);
      if (votes.filter(v => v === "overtime").length === 2) {
        if (state.role === "host") {
          await fbPatch(`rooms/${state.roomCode}`, { timedOut: false, roundStartedAt: Date.now(), overtimeVotes: {} });
        }
        els.overtimePanel.style.display = "none";
        els.roundTimer.textContent      = "";
      } else if (votes.length === 2 && votes.some(v => v === "draw")) {
        stopTimer(els.roundTimer, "timerInterval");
        showResult(els.roundResult, "draw", "Round ended in a draw.");
        els.overtimePanel.style.display = "none";
      }
    }

    // Status
    const hLocked = players.host?.locked, gLocked = players.guest?.locked;
    if (hLocked && gLocked) els.connectionStatus.textContent = `Room ${state.roomCode} — both secrets locked. Match is live!`;
    else if (opponent.joinedAt) els.connectionStatus.textContent = `Room ${state.roomCode} — waiting for both players to lock.`;
    else els.connectionStatus.textContent = `Room ${state.roomCode} ready. Waiting for friend to join.`;

    // Auto-restart on win
    const winner = roundTurns.find(t => t.correct);
    if (winner && !room.restartScheduled) {
      const iWon = winner.by === state.role;
      stopTimer(els.roundTimer, "timerInterval");
      showResult(els.roundResult, iWon ? "win" : "lose",
        iWon ? `🎉 You cracked it! New round in ${AUTO_RESTART_MS / 1000}s…`
              : `😬 Friend cracked it! New round in ${AUTO_RESTART_MS / 1000}s…`);
      if (state.role === "host") {
        await fbPatch(`rooms/${state.roomCode}`, { restartScheduled: true });
        setTimeout(startNewOnlineRound, AUTO_RESTART_MS);
      }
    }

    renderAll(room.currentTurn);
  } catch (err) { els.connectionStatus.textContent = err.message; }
}

function startPolling() { stopPolling(); syncFromRoom(); state.poller = setInterval(syncFromRoom, POLL_MS); }

// ─── 1v1 create / join ────────────────────────────────────────────────────────

async function createOnlineRoom() {
  const code = randomRoomCode();
  state.online = true; state.role = "host"; state.roomCode = code;
  els.roomInput.value = code; els.roomCode.textContent = code;

  await fbPut(code, {
    createdAt: Date.now(), settings: roomSettings(),
    roundNumber: 0, roundStartedAt: null, currentTurn: null,
    timedOut: false, overtimeVotes: {}, restartScheduled: false,
    players: {
      host:  { secret: "", locked: false, joinedAt: Date.now() },
      guest: { secret: "", locked: false, joinedAt: null },
    },
    turns: [],
  });

  state.playerHistory = []; state.opponentHistory = [];
  applyLockUI(false); els.secretInput.value = "";
  hideResult(els.roundResult);
  els.connectionStatus.textContent = `Room ${code} created. Share this code, then lock your secret.`;
  startPolling(); renderAll();
}

async function joinOnlineRoom() {
  const code = els.roomInput.value.trim().toUpperCase();
  if (!code || code.length !== 4) { els.connectionStatus.textContent = "Enter a 4-character room code."; return; }
  const room = await fbGet(code);
  if (!room) { els.connectionStatus.textContent = `Room ${code} not found.`; return; }

  state.online = true; state.role = "guest"; state.roomCode = code;
  applySettings(room.settings); els.roomCode.textContent = code;

  if (!room?.players?.guest?.locked) {
    await fbPatch(`rooms/${code}/players/guest`, { secret: "", locked: false, joinedAt: Date.now() });
  }

  applyLockUI(false); els.secretInput.value = "";
  hideResult(els.roundResult);
  els.connectionStatus.textContent = `Joined room ${code}. Enter and lock your secret.`;
  startPolling(); renderAll();
}

// ─── 1v1 lock secret ─────────────────────────────────────────────────────────

async function lockPlayerSecret() {
  const checked = validNumber(els.secretInput.value);
  if (!checked.ok) { els.secretStatus.textContent = checked.message; return; }
  if (state.secretLocked) { els.secretStatus.textContent = "Already locked."; return; }

  state.playerSecret = checked.value;

  if (state.online) {
    try {
      const room       = await fbGet(state.roomCode);
      const round      = room.roundNumber || 0;
      const roundTurns = (Array.isArray(room.turns) ? room.turns : []).filter(t => (t.round || 0) === round);
      if (roundTurns.length > 0) { els.secretStatus.textContent = "Cannot change secret after round started."; return; }
      if (room?.players?.[state.role]?.locked) { applyLockUI(true); els.secretStatus.textContent = "Already locked."; return; }

      await fbPatch(`rooms/${state.roomCode}/players/${state.role}`, { secret: checked.value, locked: true, updatedAt: Date.now() });
      applyLockUI(true);

      // Use retry-aware check so cross-device stale reads don't falsely block guessing
      state.checkingLock = true;
      const updated  = await fbGetUntilBothLocked(state.roomCode, state.role);
      state.checkingLock = false;
      const bothLocked = updated?.players?.host?.locked && updated?.players?.guest?.locked;
      els.secretStatus.textContent = bothLocked
        ? "Both secrets locked — match is live! Start guessing."
        : "Secret locked. Waiting for opponent to lock theirs.";
    } catch (err) { els.connectionStatus.textContent = err.message; }
  } else {
    applyLockUI(true);
    els.secretStatus.textContent = "Secret locked — guess Nova's code!";
  }
}

// ─── 1v1 online guess ────────────────────────────────────────────────────────

async function submitOnlineGuess(guess) {
  // Always use retry-aware fetch so cross-device stale locks don't wrongly block
  const room = await fbGetUntilBothLocked(state.roomCode, state.role);

  const opponentRole = state.role === "host" ? "guest" : "host";
  const hLocked = room?.players?.host?.locked, gLocked = room?.players?.guest?.locked;

  if (!hLocked || !gLocked) {
    els.secretStatus.textContent = "Both players must lock secrets before guessing. (Waiting for sync…)";
    // Schedule a retry in 1.5s to handle slow cross-device propagation
    setTimeout(() => { if (!state.secretLocked) return; submitOnlineGuess(guess); }, 1500);
    return;
  }

  if (state.matchType === "Real-Time" && room.timedOut) {
    els.secretStatus.textContent = "Time is up. Vote for overtime or draw.";
    return;
  }

  if (state.matchType === "Turn-Based") {
    const round      = room.roundNumber || 0;
    const roundTurns = (Array.isArray(room.turns) ? room.turns : []).filter(t => (t.round || 0) === round);
    const myCount    = roundTurns.filter(t => t.by === state.role).length;
    const oppCount   = roundTurns.filter(t => t.by === opponentRole).length;
    if (myCount > oppCount) { els.secretStatus.textContent = "Wait for your opponent to guess first."; return; }
  }

  const opponentSecret = room?.players?.[opponentRole]?.secret;
  if (!opponentSecret) { els.secretStatus.textContent = "Friend hasn't locked a secret yet."; return; }

  const round    = room.roundNumber || 0;
  const clues    = scoreGuess(guess, opponentSecret);
  const correct  = guess === opponentSecret;
  const allTurns = Array.isArray(room.turns) ? room.turns : [];
  allTurns.push({ round, by: state.role, guess, clues, correct, createdAt: Date.now() });

  const patch = { turns: allTurns, currentTurn: opponentRole };
  if (state.matchType === "Real-Time" && !room.roundStartedAt) patch.roundStartedAt = Date.now();

  await fbPatch(`rooms/${state.roomCode}`, patch);

  if (correct) {
    els.secretStatus.textContent = "You cracked it! Next round coming…";
    stopTimer(els.roundTimer, "timerInterval");
  } else {
    els.secretStatus.textContent = state.matchType === "Turn-Based" ? "Guess sent — opponent's turn." : "Guess sent!";
  }

  await syncFromRoom();
  renderAll();
}

// ─── 1v1 new online round ─────────────────────────────────────────────────────

async function startNewOnlineRound() {
  const room      = await fbGet(state.roomCode);
  const nextRound = (room.roundNumber || 0) + 1;
  await fbPatch(`rooms/${state.roomCode}`, {
    roundNumber: nextRound, roundStartedAt: null, currentTurn: null,
    timedOut: false, overtimeVotes: {}, restartScheduled: false,
  });
  await fbPatch(`rooms/${state.roomCode}/players/host`,  { secret: "", locked: false });
  await fbPatch(`rooms/${state.roomCode}/players/guest`, { secret: "", locked: false });
  applyLockUI(false); els.secretInput.value = ""; state.playerHistory = []; state.opponentHistory = [];
  hideResult(els.roundResult);
  els.connectionStatus.textContent = `Round ${nextRound} — enter and lock a new secret.`;
  await syncFromRoom();
}

// ─── Group polling ────────────────────────────────────────────────────────────

function stopGroupPolling() { if (state.groupPoller) { clearInterval(state.groupPoller); state.groupPoller = null; } }

async function syncGroupRoom() {
  if (!state.groupOnline || !state.groupRoomCode) return;
  try {
    const room = await fbGetGroup(state.groupRoomCode);
    if (!room) { els.groupStatus.textContent = "Room no longer exists."; return; }

    state.groupSecret = room.secret || "";
    const round       = room.roundNumber || 0;
    const allTurns    = Array.isArray(room.turns) ? room.turns : [];
    const roundTurns  = allTurns.filter(t => (t.round || 0) === round);
    const players     = room.players || {};
    const playerCount = Object.keys(players).length;

    els.groupStatus.textContent = `Room ${state.groupRoomCode} · ${playerCount} player${playerCount !== 1 ? "s" : ""}`;

    // Timer
    const gMatchType = room.settings?.groupMatchType || "Real-Time";
    if (gMatchType === "Real-Time" && room.roundStartedAt && !state.groupTimerInterval && !room.timedOut) {
      startTimerEl(els.groupRoundTimer, "groupTimerInterval", room.roundStartedAt, () => {
        els.overtimePanel.style.display = "block";
        if (state.groupPlayerName === Object.keys(players)[0]) {
          fbPatch(`groupRooms/${state.groupRoomCode}`, { timedOut: true, overtimeVotes: {} }).catch(() => {});
        }
      });
    }

    // Winner detection — auto-restart
    const winner = roundTurns.find(t => t.correct);
    if (winner && !room.restartScheduled) {
      const iWon = winner.by === state.groupPlayerName;
      stopTimer(els.groupRoundTimer, "groupTimerInterval");
      showResult(els.groupRoundResult, iWon ? "win" : "lose",
        iWon ? `🎉 You cracked the code! New round in ${AUTO_RESTART_MS / 1000}s…`
              : `${winner.by.replace("player_", "Player ")} cracked it! New round in ${AUTO_RESTART_MS / 1000}s…`);
      const isFirstPlayer = state.groupPlayerName === Object.keys(players).sort()[0];
      if (isFirstPlayer) {
        await fbPatch(`groupRooms/${state.groupRoomCode}`, { restartScheduled: true });
        setTimeout(startNewGroupRound, AUTO_RESTART_MS);
      }
    }

    renderGroupBoard(room);
  } catch (err) { els.groupStatus.textContent = err.message; }
}

function startGroupPolling() { stopGroupPolling(); syncGroupRoom(); state.groupPoller = setInterval(syncGroupRoom, POLL_MS); }

// ─── Group create / join ──────────────────────────────────────────────────────

async function createGroupRoom() {
  const code = randomRoomCode();
  const name = "player_" + Math.floor(Math.random() * 9000 + 1000);
  state.groupOnline      = true;
  state.groupRoomCode    = code;
  state.groupPlayerName  = name;
  els.groupRoomInput.value    = code;
  els.groupRoomCode.textContent = code;

  const secret = makeSecret(state.codeLength, state.repeats);
  state.groupSecret = secret;

  await fbPutGroup(code, {
    createdAt: Date.now(),
    secret,
    roundNumber: 0, roundStartedAt: null, currentTurn: null,
    timedOut: false, overtimeVotes: {}, restartScheduled: false,
    settings: { groupMatchType: state.groupMatchType, groupVisibility: state.groupVisibility, codeLength: state.codeLength, repeats: state.repeats },
    players: { [name]: { joinedAt: Date.now() } },
    turns: [],
  });

  els.groupSecretStatus.textContent = `Room ${code} created. Code is hidden. Share the code — then start guessing!`;
  startGroupPolling();
}

async function joinGroupRoom() {
  const code = els.groupRoomInput.value.trim().toUpperCase();
  if (!code || code.length !== 4) { els.groupStatus.textContent = "Enter a 4-character room code."; return; }

  const room = await fbGetGroup(code);
  if (!room) { els.groupStatus.textContent = `Room ${code} not found.`; return; }

  const name = "player_" + Math.floor(Math.random() * 9000 + 1000);
  state.groupOnline     = true;
  state.groupRoomCode   = code;
  state.groupPlayerName = name;
  state.groupSecret     = room.secret || "";
  els.groupRoomCode.textContent = code;

  // Cap at 5 players
  const currentCount = Object.keys(room.players || {}).length;
  if (currentCount >= 5) { els.groupStatus.textContent = "Room is full (max 5 players)."; return; }

  await fbPatch(`groupRooms/${code}/players/${name}`, { joinedAt: Date.now() });

  els.groupSecretStatus.textContent = `Joined room ${code}. The code is hidden — start guessing!`;
  startGroupPolling();
}

// ─── Group guess ─────────────────────────────────────────────────────────────

async function submitGroupGuess(guess) {
  const room  = await fbGetGroup(state.groupRoomCode);
  const gMatchType = room?.settings?.groupMatchType || "Real-Time";

  // Turn-based group: check it's this player's turn
  if (gMatchType === "Turn-Based" && room.currentTurn && room.currentTurn !== state.groupPlayerName) {
    els.groupSecretStatus.textContent = "Wait for your turn.";
    return;
  }

  const secret   = room.secret || state.groupSecret;
  const clues    = scoreEasy(guess, secret);   // group always uses easy scoring for clues
  const correct  = guess === secret;
  const round    = room.roundNumber || 0;
  const allTurns = Array.isArray(room.turns) ? room.turns : [];

  // Turn-based: check player hasn't gone more than others
  if (gMatchType === "Turn-Based") {
    const roundTurns = allTurns.filter(t => (t.round || 0) === round);
    const players    = Object.keys(room.players || {});
    const myCount    = roundTurns.filter(t => t.by === state.groupPlayerName).length;
    const minCount   = Math.min(...players.map(p => roundTurns.filter(t => t.by === p).length));
    if (myCount > minCount) { els.groupSecretStatus.textContent = "Wait for others to catch up."; return; }
  }

  // Determine next turn (round-robin)
  const players  = Object.keys(room.players || {}).sort();
  const myIdx    = players.indexOf(state.groupPlayerName);
  const nextTurn = players[(myIdx + 1) % players.length];

  allTurns.push({ round, by: state.groupPlayerName, guess, clues, correct, createdAt: Date.now() });
  const patch = { turns: allTurns, currentTurn: nextTurn };
  if (gMatchType === "Real-Time" && !room.roundStartedAt) patch.roundStartedAt = Date.now();

  await fbPatch(`groupRooms/${state.groupRoomCode}`, patch);

  if (correct) {
    els.groupSecretStatus.textContent = `You cracked the code! Next round coming…`;
  } else {
    els.groupSecretStatus.textContent = "Guess submitted!";
  }

  await syncGroupRoom();
}

// ─── New group round ──────────────────────────────────────────────────────────

async function startNewGroupRound() {
  const room      = await fbGetGroup(state.groupRoomCode);
  const nextRound = (room.roundNumber || 0) + 1;
  const newSecret = makeSecret(state.codeLength, state.repeats);

  await fbPatch(`groupRooms/${state.groupRoomCode}`, {
    secret: newSecret, roundNumber: nextRound, roundStartedAt: null,
    currentTurn: null, timedOut: false, overtimeVotes: {}, restartScheduled: false,
  });

  state.groupSecret = newSecret;
  hideResult(els.groupRoundResult);
  els.groupSecretStatus.textContent = `Round ${nextRound} — new code hidden. Start guessing!`;
  await syncGroupRoom();
}

// ─── Reset handler ────────────────────────────────────────────────────────────

async function handleReset() {
  stopTimer(els.roundTimer, "timerInterval");
  els.overtimePanel.style.display = "none";
  hideResult(els.roundResult);

  if (state.playMode === "nova") { startNovaRound("New round! Lock your secret."); return; }

  if (state.playMode === "multiplayer" && state.online) {
    if (state.role !== "host") { els.secretStatus.textContent = "Only the host can reset."; return; }
    await startNewOnlineRound();
    return;
  }

  resetLocalState("New round. Lock your secret to start.");
}

async function handleGroupReset() {
  hideResult(els.groupRoundResult);
  if (!state.groupOnline) return;
  const room    = await fbGetGroup(state.groupRoomCode);
  const players = Object.keys(room?.players || {}).sort();
  if (state.groupPlayerName !== players[0]) { els.groupSecretStatus.textContent = "Only the room creator can reset."; return; }
  await startNewGroupRound();
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function updateSettingsIfHost() {
  if (state.online && state.role === "host") {
    await fbPatch(`rooms/${state.roomCode}`, { settings: roomSettings() }).catch(() => {});
  }
}

function setClueMode(mode) {
  state.clueMode = mode; syncClueButtons(); renderAll(); updateSettingsIfHost();
}

function setMatchType(type) {
  state.matchType = type; syncMatchButtons(); updateSettingsIfHost();
}

function setNovaDifficulty(diff) {
  state.novaDifficulty = diff; syncDiffButtons();
  startNovaRound(`Difficulty: ${diff}. Lock your secret.`);
}

function syncLength() {
  state.codeLength = Number(els.codeLength.value);
  els.secretInput.maxLength = state.codeLength;
  els.guessInput.maxLength  = state.codeLength;
  if (state.playMode === "nova")          startNovaRound(`${state.codeLength}-digit round. Lock your secret.`);
  else if (state.playMode === "group")    els.groupSecretStatus.textContent = `Code length set to ${state.codeLength}.`;
  else                                    resetLocalState(`${state.codeLength}-digit codes. Lock your secret.`);
  updateSettingsIfHost();
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Mode picker
els.pickMultiplayer.addEventListener("click", () => enterMultiplayerMode());
els.pickGroup.addEventListener("click",       () => enterGroupMode());
els.pickNova.addEventListener("click", () => {
  els.pickCards.style.display      = "none";
  els.novaDiffPicker.style.display = "block";
});
els.backToModes.addEventListener("click", () => {
  els.novaDiffPicker.style.display = "none";
  els.pickCards.style.display      = "grid";
});
document.querySelectorAll(".diff-card").forEach(card => {
  card.addEventListener("click", () => enterNovaMode(card.dataset.diff));
});

// Switch / brand
els.switchMode.addEventListener("click", () => { stopPolling(); stopGroupPolling(); stopTimer(els.roundTimer, "timerInterval"); state.online = false; state.role = null; state.groupOnline = false; showModePicker(); });
els.brandHome.addEventListener("click",  e => { e.preventDefault(); stopPolling(); stopGroupPolling(); stopTimer(els.roundTimer, "timerInterval"); state.online = false; state.role = null; state.groupOnline = false; showModePicker(); });

// Theme
els.themeToggle.addEventListener("click", () => document.documentElement.classList.toggle("light"));

// 1v1
els.createRoom.addEventListener("click", async () => {
  try { if (!firebaseReady) { els.connectionStatus.textContent = "Add Firebase config for multiplayer."; return; } await createOnlineRoom(); }
  catch (err) { els.connectionStatus.textContent = err.message; }
});
els.joinRoom.addEventListener("click", async () => {
  try { if (!firebaseReady) { els.connectionStatus.textContent = "Add Firebase config for multiplayer."; return; } await joinOnlineRoom(); }
  catch (err) { els.connectionStatus.textContent = err.message; }
});
els.roomInput.addEventListener("input", () => {
  els.roomInput.value = els.roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  els.roomCode.textContent = els.roomInput.value || "----";
});
els.realTime.addEventListener("click",  () => setMatchType("Real-Time"));
els.turnBased.addEventListener("click", () => setMatchType("Turn-Based"));

// Group
els.createGroupRoom.addEventListener("click", async () => {
  try { if (!firebaseReady) { els.groupStatus.textContent = "Add Firebase config."; return; } await createGroupRoom(); }
  catch (err) { els.groupStatus.textContent = err.message; }
});
els.joinGroupRoom.addEventListener("click", async () => {
  try { if (!firebaseReady) { els.groupStatus.textContent = "Add Firebase config."; return; } await joinGroupRoom(); }
  catch (err) { els.groupStatus.textContent = err.message; }
});
els.groupRoomInput.addEventListener("input", () => {
  els.groupRoomInput.value = els.groupRoomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  els.groupRoomCode.textContent = els.groupRoomInput.value || "----";
});
els.groupRealTime.addEventListener("click",  () => { state.groupMatchType = "Real-Time";  syncGroupMatchButtons(); });
els.groupTurnBased.addEventListener("click", () => { state.groupMatchType = "Turn-Based"; syncGroupMatchButtons(); });
els.groupEasyVis.addEventListener("click",   () => { state.groupVisibility = "all"; syncGroupVisButtons(); });
els.groupHardVis.addEventListener("click",   () => { state.groupVisibility = "own"; syncGroupVisButtons(); });

// Nova difficulty
els.diffEasy.addEventListener("click",       () => setNovaDifficulty("easy"));
els.diffMedium.addEventListener("click",     () => setNovaDifficulty("medium"));
els.diffImpossible.addEventListener("click", () => setNovaDifficulty("impossible"));

// Clue mode + settings
els.easyMode.addEventListener("click",     () => setClueMode("easy"));
els.hardMode.addEventListener("click",     () => setClueMode("hard"));
els.repeatDigits.addEventListener("change",() => { state.repeats = els.repeatDigits.checked; syncLength(); });
els.codeLength.addEventListener("change",  syncLength);

// Lock secret
els.lockSecret.addEventListener("click", lockPlayerSecret);

// Guess form
els.guessForm.addEventListener("submit", async e => {
  e.preventDefault();
  const checked = validNumber(els.guessInput.value);
  if (!checked.ok) { els.secretStatus.textContent = checked.message; return; }
  const guess = checked.value;

  if (state.playMode === "group") { await submitGroupGuess(guess); return; }

  if (state.playMode === "multiplayer") {
    if (state.online) { await submitOnlineGuess(guess); return; }
    els.secretStatus.textContent = "Create or join a room first.";
    return;
  }

  // Nova
  if (!state.secretLocked) { els.secretStatus.textContent = "Lock your secret first."; return; }
  const clues   = scoreGuess(guess, state.opponentSecret);
  const correct = guess === state.opponentSecret;
  state.playerHistory.push({ guess, clues });

  if (correct) {
    showResult(els.roundResult, "win", `🎉 You cracked Nova's code (${state.opponentSecret})! New round in ${AUTO_RESTART_MS / 1000}s…`);
    renderAll();
    setTimeout(() => startNovaRound("New round! Lock your secret."), AUTO_RESTART_MS);
    return;
  }

  const novaWon = novaTakeTurn();
  renderAll();

  if (novaWon) {
    showResult(els.roundResult, "lose", `😬 Nova guessed your secret (${state.playerSecret})! New round in ${AUTO_RESTART_MS / 1000}s…`);
    setTimeout(() => startNovaRound("New round! Lock your secret."), AUTO_RESTART_MS);
  } else {
    els.secretStatus.textContent = "Guess logged — Nova took its turn.";
  }
});

// Reset
els.resetMatch.addEventListener("click",      handleReset);
els.resetGroupMatch.addEventListener("click", handleGroupReset);

// Overtime votes
els.voteOvertime.addEventListener("click", async () => {
  if (!state.online) return;
  await fbPatch(`rooms/${state.roomCode}/overtimeVotes`, { [state.role]: "overtime" });
  els.voteOvertime.disabled = true; els.voteOvertime.textContent = "Voted — Overtime";
  await syncFromRoom();
});
els.voteDraw.addEventListener("click", async () => {
  if (!state.online) return;
  await fbPatch(`rooms/${state.roomCode}/overtimeVotes`, { [state.role]: "draw" });
  els.voteDraw.disabled = true; els.voteDraw.textContent = "Voted — Draw";
  els.overtimePanel.style.display = "none";
  await syncFromRoom();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

syncClueButtons();
syncMatchButtons();
syncGroupMatchButtons();
syncGroupVisButtons();
showModePicker();
renderAll();
