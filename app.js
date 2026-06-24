// ─── Firebase Connection Protocols ──────────────────────────────────────────
const firebaseConfig = window.CIPHERROOM_FIREBASE || {};
const firebaseBase   = (firebaseConfig.databaseURL || "https://cipherroom-5fd37-default-rtdb.firebaseio.com").replace(/\/$/, "");
const firebaseReady  = Boolean(firebaseBase);

// ─── Operational Constants ──────────────────────────────────────────────────
const ROUND_MS        = 3 * 60 * 1000;
const POLL_MS         = 2000;
const AUTO_RESTART_MS = 4000;
const digits          = "0123456789";

// ─── Core Mainframe Engine State ─────────────────────────────────────────────
const state = {
  playMode:        null,       // "multiplayer" | "group" | "nova"
  novaDifficulty:  "easy",     // "easy" | "medium" | "impossible"
  clueMode:        "easy",     // "easy" | "hard"
  codeLength:      3,
  repeats:         false,

  // 1v1 Protocol Parameters
  matchType:       "Real-Time",// "Real-Time" | "Turn-Based"
  online:          false,
  role:            null,       // "host" | "guest"
  roomCode:        null,
  poller:          null,
  timerInterval:   null,
  secretLocked:    false,
  playerSecret:    "",
  opponentSecret:  "",
  playerHistory:   [],
  opponentHistory: [],
  roundNumber:     0,

  // Collective Cluster Parameters
  groupMatchType:    "Real-Time",
  groupVisibility:   "all",    // "all" | "own"
  groupOnline:       false,
  groupRoomCode:     null,
  groupPoller:       null,
  groupTimerInterval:null,
  groupPlayerName:   null,
  groupSecret:       "",

  // Computational Mainframe Matrices
  novaCandidates:  [],
};

// ─── Unified Element Map Harness ─────────────────────────────────────────────
const q  = id => document.querySelector(id);
const els = {
  modePicker:          q("#modePicker"),
  pickCards:           q("#pickCards"),
  pickMultiplayer:     q("#pickMultiplayer"),
  pickGroup:           q("#pickGroup"),
  pickNova:            q("#pickNova"),
  novaDiffPicker:      q("#novaDiffPicker"),
  backToModes:         q("#backToModes"),

  brandHome:           q("#brandHome"),
  switchMode:          q("#switchMode"),
  themeToggle:         q("#themeToggle"),

  multiControls:       q("#multiControls"),
  multiGroupControls:  q("#multiGroupControls"),
  novaControls:        q("#novaControls"),
  controlEyebrow:      q("#controlEyebrow"),
  controlTitle:        q("#controlTitle"),

  createRoom:          q("#createRoom"),
  joinRoom:            q("#joinRoom"),
  roomInput:           q("#roomInput"),
  roomCode:            q("#roomCode"),
  connectionStatus:    q("#connectionStatus"),
  realTime:            q("#realTime"),
  turnBased:           q("#turnBased"),

  createGroupRoom:     q("#createGroupRoom"),
  joinGroupRoom:       q("#joinGroupRoom"),
  groupRoomInput:      q("#groupRoomInput"),
  groupRoomCode:       q("#groupRoomCode"),
  groupStatus:         q("#groupStatus"),
  groupRealTime:       q("#groupRealTime"),
  groupTurnBased:      q("#groupTurnBased"),
  groupEasyVis:        q("#groupEasyVis"),
  groupHardVis:        q("#groupHardVis"),

  diffEasy:            q("#diffEasy"),
  diffMedium:          q("#diffMedium"),
  diffImpossible:      q("#diffImpossible"),
  novaStatus:          q("#novaStatus"),

  easyMode:            q("#easyMode"),
  hardMode:            q("#hardMode"),
  repeatDigits:        q("#repeatDigits"),
  codeLength:          q("#codeLength"),

  modeBadge:           q("#modeBadge"),
  matchBadge:          q("#matchBadge"),
  novaDiffBadge:       q("#novaDiffBadge"),

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

  groupSecretPanel:    q("#groupSecretPanel"),
  groupSecretStatus:   q("#groupSecretStatus"),
  groupRoundTimer:     q("#groupRoundTimer"),
  groupTurnIndicator:  q("#groupTurnIndicator"),
  groupRoundResult:    q("#groupRoundResult"),
  groupBoard:          q("#groupBoard"),
  groupBoardWrap:      q("#groupBoardWrap"),
  resetGroupMatch:     q("#resetGroupMatch"),
};

// ─── Mathematical Utility Algorithms ─────────────────────────────────────────
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
    return { ok: false, message: "Repeated digits are disabled." };
  return { ok: true, value: clean };
}

// ─── Clue Calculation Logic ─────────────────────────────────────────────────
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

// ─── Automated AI Core Functions ───────────────────────────────────────────
function novaInitCandidates() {
  state.novaCandidates = allCodes(state.codeLength, state.repeats);
}

function novaFilterCandidates(guess, clues) {
  state.novaCandidates = state.novaCandidates.filter(c => cluesMatchEasy(guess, c, clues));
}

function novaPickEasy() {
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

// ─── Network Infrastructure Linkages ────────────────────────────────────────
const roomUrl  = code => `${firebaseBase}/rooms/${code}.json`;
const groupUrl = code => `${firebaseBase}/groupRooms/${code}.json`;

async function fbGet(code) { const r = await fetch(roomUrl(code)); if (!r.ok) throw new Error("Cloud read failed."); return r.json(); }
async function fbGetGroup(code) { const r = await fetch(groupUrl(code)); if (!r.ok) throw new Error("Cluster read failed."); return r.json(); }
async function fbPut(code, val) { const r = await fetch(roomUrl(code), { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(val) }); if (!r.ok) throw new Error("Cloud write failed."); return r.json(); }
async function fbPutGroup(code, val) { const r = await fetch(groupUrl(code), { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(val) }); if (!r.ok) throw new Error("Cluster write failed."); return r.json(); }
async function fbPatch(path, val) { const r = await fetch(`${firebaseBase}/${path}.json`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(val) }); if (!r.ok) throw new Error("Patch failed."); return r.json(); }

async function fbGetUntilBothLocked(code, myRole, maxRetries = 5, delayMs = 600) {
  for (let i = 0; i < maxRetries; i++) {
    const room = await fbGet(code);
    if (room?.players?.host?.locked && room?.players?.guest?.locked) return room;
    if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return await fbGet(code);
}

// ─── Synchronizers & State Configuration Mapping ─────────────────────────────
function roomSettings() { return { clueMode: state.clueMode, matchType: state.matchType, codeLength: state.codeLength, repeats: state.repeats }; }

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
  els.modeBadge.textContent = state.clueMode === "easy" ? "Easy Clues" : "Hard Clues";
  els.novaModeLabel.textContent = state.clueMode === "easy" ? "Easy Clues System" : "Hard Clues System";
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
  els.novaDiffBadge.textContent = state.novaDifficulty.toUpperCase();
  els.novaDiffBadge.style.display = "inline";
}

function applyLockUI(locked) {
  state.secretLocked         = locked;
  els.secretInput.disabled   = locked;
  els.lockSecret.textContent = locked ? "Locked" : "Lock Secret";
  els.lockSecret.disabled    = locked;
}

function showResult(el, type, msg) { el.textContent = msg; el.className = type; el.style.display = "block"; }
function hideResult(el)            { el.style.display = "none"; el.className = ""; }

function stopTimer(timerEl, intervalKey) {
  if (state[intervalKey]) { clearInterval(state[intervalKey]); state[intervalKey] = null; }
  if (timerEl) timerEl.textContent = "";
}

function startTimerEl(timerEl, intervalKey, roundStartedAt, onExpire) {
  stopTimer(timerEl, intervalKey);
  function tick() {
    const rem = ROUND_MS - (Date.now() - roundStartedAt);
    if (rem <= 0) { stopTimer(timerEl, intervalKey); timerEl.textContent = "⏰ Timeout"; onExpire(); return; }
    const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000).toString().padStart(2, "0");
    timerEl.textContent = `⏱ ${m}:${s}`;
  }
  tick(); state[intervalKey] = setInterval(tick, 500);
}

// ─── Rendering Layout Assemblies ─────────────────────────────────────────────
function historyRow(turn) {
  const ch = turn.clues.map(c => `<span class="clue ${c}">${clueSymbol(c)}</span>`).join("");
  return `<span class="guess-number">${turn.guess}</span><span class="clues">${ch}</span>`;
}

function renderHistoryList(listEl, turns, emptyText) {
  listEl.innerHTML = "";
  if (!turns.length) {
    listEl.innerHTML = `<li class="history-item"><span class="guess-number">---</span><span class="clues"><em>${emptyText}</em></span></li>`;
    return;
  }
  [...turns].reverse().forEach(turn => {
    const li = document.createElement("li"); li.className = "history-item"; li.innerHTML = historyRow(turn); listEl.append(li);
  });
}

function renderHistories() {
  renderHistoryList(els.historyList, state.playerHistory, "No records logged.");
  renderHistoryList(els.novaHistoryList, state.opponentHistory, state.playMode === "multiplayer" ? "Waiting for peer guess stream..." : "AI standing by...");
}

function renderTracker() {
  if (state.clueMode === "hard" || state.playMode === "group") { els.digitGrid.className = "tracker-hidden"; els.digitGrid.textContent = ""; return; }
  els.digitGrid.className = "digit-grid"; els.digitGrid.innerHTML = "";
  const known = Object.fromEntries(digits.split("").map(d => [d, "unknown"]));
  state.playerHistory.forEach(t => t.guess.split("").forEach((d, i) => { if (t.clues[i] === "green" || t.clues[i] === "yellow") known[d] = "exists"; else if (known[d] !== "exists") known[d] = "absent"; }));
  for (const d of digits) {
    const cell = document.createElement("div"); cell.className = "digit-cell";
    cell.innerHTML = `<span>${d}</span><span>${known[d]==="exists"?"✓":known[d]==="absent"?"×" : "?"}</span>`;
    els.digitGrid.append(cell);
  }
}

function renderTurnIndicator(currentTurn) {
  if (!state.online || state.matchType !== "Turn-Based") { els.turnIndicator.style.display = "none"; return; }
  els.turnIndicator.style.display = "block";
  if (!currentTurn) els.turnIndicator.textContent = "Awaiting cross-locks...";
  else els.turnIndicator.textContent = currentTurn === state.role ? "🟢 YOUR STREAM LIVE" : "⏳ PEER COMPUTING...";
}

function renderAll(currentTurn) {
  els.opponentTitle.textContent = state.playMode === "nova" ? `vs NOVA (${state.novaDifficulty.toUpperCase()})` : (state.online ? "DUEL LINK CONNECTED" : "AWAITING INTERFACE");
  renderHistories(); renderTracker(); renderTurnIndicator(currentTurn);
}

function renderGroupBoard(room) {
  if (!room) return;
  els.groupBoardWrap.innerHTML = "";
  const turns = Array.isArray(room.turns) ? room.turns : [];
  const vis = room.settings?.groupVisibility || "all";
  Object.keys(room.players || {}).forEach(name => {
    const isMe = name === state.groupPlayerName;
    const col = document.createElement("div"); col.className = "group-col";
    col.innerHTML = `<h4>${isMe ? "Terminal Core (You)" : "Cluster Unit " + name.replace("player_", "")}</h4>`;
    const ol = document.createElement("ol"); ol.className = "history-list";
    if (vis !== "all" && !isMe) { ol.innerHTML = `<li class="history-item"><span>---</span><span>[ENCRYPTED]</span></li>`; }
    else {
      const filtered = turns.filter(t => t.by === name && t.round === room.roundNumber);
      if (!filtered.length) ol.innerHTML = `<li><em>No streams.</em></li>`;
      else [...filtered].reverse().forEach(t => { const li = document.createElement("li"); li.className = "history-item"; li.innerHTML = historyRow(t); ol.append(li); });
    }
    col.append(ol); els.groupBoardWrap.append(col);
  });
}

// ─── Navigation Flow State Controls ──────────────────────────────────────────
function showLanding() {
  stopPolling(); stopGroupPolling();
  els.modePicker.style.display = "block"; q("#landingPage").style.display = "block"; els.gamePage.style.display = "none";
}

function hideLanding() { q("#landingPage").style.display = "none"; els.gamePage.style.display = "grid"; }

function initArena(mode) {
  state.playMode = mode; hideLanding();
  els.multiControls.style.display = mode === "multiplayer" ? "block" : "none";
  els.multiGroupControls.style.display = mode === "group" ? "block" : "none";
  els.novaControls.style.display = mode === "nova" ? "block" : "none";
  els.standardBoard.style.display = mode === "group" ? "none" : "grid";
  els.groupBoard.style.display = mode === "group" ? "grid" : "none";
}

// ─── Gameplay Orchestration Loops ────────────────────────────────────────────
function startNovaRound(msg) {
  state.playerHistory = []; state.opponentHistory = []; applyLockUI(false);
  state.opponentSecret = makeSecret(state.codeLength, state.repeats);
  novaInitCandidates(); els.secretInput.value = ""; els.guessInput.value = "";
  els.secretStatus.textContent = msg; hideResult(els.roundResult); renderAll();
}

async function handleLockSecret() {
  const checked = validNumber(els.secretInput.value);
  if (!checked.ok) { els.secretStatus.textContent = checked.message; return; }
  state.playerSecret = checked.value;
  if (state.online) {
    try {
      await fbPatch(`rooms/${state.roomCode}/players/${state.role}`, { secret: checked.value, locked: true });
      applyLockUI(true); const sync = await fbGetUntilBothLocked(state.roomCode, state.role);
      if (sync?.players?.host?.locked && sync?.players?.guest?.locked) {
        await fbPatch(`rooms/${state.roomCode}`, { roundStartedAt: Date.now(), currentTurn: "host" });
      }
    } catch(e) { els.connectionStatus.textContent = e.message; }
  } else {
    applyLockUI(true); els.secretStatus.textContent = "Matrix parameters encrypted. Core live.";
  }
}

async function handleGuessSubmission() {
  if (!state.online && state.playMode === "nova" && !state.secretLocked) { els.secretStatus.textContent = "Encrypt core vector first."; return; }
  const checked = validNumber(els.guessInput.value);
  if (!checked.ok) { els.roundResult.textContent = checked.value; return; }
  const guess = checked.value; els.guessInput.value = "";

  if (state.playMode === "nova") {
    const clues = scoreGuess(guess, state.opponentSecret); state.playerHistory.push({ guess, clues });
    if (guess === state.opponentSecret) {
      showResult(els.roundResult, "win", `🎉 Matrix decoded successfully! Key: ${state.opponentSecret}`);
      setTimeout(() => startNovaRound("System cycle refreshed."), AUTO_RESTART_MS); return;
    }
    novaTakeTurn(); renderAll();
    if (state.opponentHistory.some(h => h.guess === state.playerSecret)) {
      showResult(els.roundResult, "lose", `😬 Mainframe intercepted code vector: ${state.playerSecret}`);
      setTimeout(() => startNovaRound("System parameters reset."), AUTO_RESTART_MS);
    }
  } else if (state.online) {
    const room = await fbGet(state.roomCode);
    const peer = state.role === "host" ? "guest" : "host";
    const secretTarget = room?.players?.[peer]?.secret;
    const clues = scoreGuess(guess, secretTarget);
    const turns = Array.isArray(room.turns) ? room.turns : [];
    turns.push({ round: room.roundNumber, by: state.role, guess, clues });
    const patch = { turns };
    if (state.matchType === "Turn-Based") patch.currentTurn = peer;
    if (guess === secretTarget) { patch.winner = state.role; patch.restartScheduled = true; }
    await fbPatch(`rooms/${state.roomCode}`, patch);
  }
}

// ─── Network Syncer Polling Frameworks ───────────────────────────────────────
function stopPolling() { if (state.poller) { clearInterval(state.poller); state.poller = null; } }
function stopGroupPolling() { if (state.groupPoller) { clearInterval(state.groupPoller); state.groupPoller = null; } }

function startPolling() {
  stopPolling();
  state.poller = setInterval(async () => {
    try {
      const room = await fbGet(state.roomCode); if (!room) return;
      applySettings(room.settings);
      const peer = state.role === "host" ? "guest" : "host";
      applyLockUI(room?.players?.[state.role]?.locked || false);
      const turns = Array.isArray(room.turns) ? room.turns : [];
      state.playerHistory = turns.filter(t => t.by === state.role && t.round === room.roundNumber);
      state.opponentHistory = turns.filter(t => t.by === peer && t.round === room.roundNumber);
      renderAll(room.currentTurn);
      if (room.winner) {
        showResult(els.roundResult, room.winner === state.role ? "win" : "lose", room.winner === state.role ? "Vector solved! Victory logged." : "Peer intercepted vector. Failure logged.");
        stopTimer(els.roundTimer, "timerInterval");
        if (room.restartScheduled) { setTimeout(() => cycleOnlineRound(), AUTO_RESTART_MS); }
      }
    } catch(e) { els.connectionStatus.textContent = e.message; }
  }, POLL_MS);
}

async function cycleOnlineRound() {
  await fbPatch(`rooms/${state.roomCode}`, { roundNumber: (state.roundNumber+1), winner: null, turns: [], restartScheduled: false });
  await fbPatch(`rooms/${state.roomCode}/players/host`, { secret: "", locked: false });
  await fbPatch(`rooms/${state.roomCode}/players/guest`, { secret: "", locked: false });
  hideResult(els.roundResult);
}

// ─── Group Interactive Subsystems ───────────────────────────────────────────
async function establishGroupRoom() {
  const code = randomRoomCode(); state.groupRoomCode = code; state.groupPlayerName = "player_" + Math.floor(Math.random()*9000+1000);
  els.groupRoomCode.textContent = code; state.groupSecret = makeSecret(state.codeLength, state.repeats);
  await fbPutGroup(code, { secret: state.groupSecret, roundNumber: 1, players: { [state.groupPlayerName]: true }, settings: { groupVisibility: state.groupVisibility, groupMatchType: state.groupMatchType } });
  startGroupLoop();
}

async function joinGroupRoom() {
  const code = els.groupRoomInput.value.trim().toUpperCase(); if (code.length !== 4) return;
  state.groupRoomCode = code; state.groupPlayerName = "player_" + Math.floor(Math.random()*9000+1000);
  els.groupRoomCode.textContent = code;
  await fbPatch(`groupRooms/${code}/players`, { [state.groupPlayerName]: true });
  startGroupLoop();
}

function startGroupLoop() {
  stopGroupPolling();
  state.groupPoller = setInterval(async () => {
    const room = await fbGetGroup(state.groupRoomCode); if (!room) return;
    state.groupSecret = room.secret; renderGroupBoard(room);
  }, POLL_MS);
}

async function handleGroupGuess() {
  const checked = validNumber(q("#groupGuessInput").value); if (!checked.ok) return;
  const guess = checked.value; q("#groupGuessInput").value = "";
  const room = await fbGetGroup(state.groupRoomCode);
  const clues = scoreGuess(guess, room.secret);
  const turns = Array.isArray(room.turns) ? room.turns : [];
  turns.push({ round: room.roundNumber, by: state.groupPlayerName, guess, clues });
  const patch = { turns };
  if (guess === room.secret) { showResult(els.groupRoundResult, "win", "Cluster Target Liquidated!"); patch.roundNumber = room.roundNumber + 1; patch.secret = makeSecret(state.codeLength, state.repeats); patch.turns = []; }
  await fbPatch(`groupRooms/${state.groupRoomCode}`, patch);
}

// ─── Unified Control Action Bindings ──────────────────────────────────────────
els.pickMultiplayer.addEventListener("click", () => { initArena("multiplayer"); });
els.pickGroup.addEventListener("click", () => { initArena("group"); });
els.pickNova.addEventListener("click", () => { initArena("nova"); syncDiffButtons(); startNovaRound("AI operational."); });
els.switchMode.addEventListener("click", showLanding);
els.brandHome.addEventListener("click", showLanding);

els.lockSecret.addEventListener("click", handleLockSecret);
els.guessSubmitBtn.addEventListener("click", handleGuessSubmission);
q("#groupGuessSubmitBtn").addEventListener("click", handleGroupGuess);

els.createRoom.addEventListener("click", async () => {
  const code = randomRoomCode(); state.roomCode = code; state.role = "host"; state.online = true; els.roomCode.textContent = code;
  await fbPut(code, { settings: roomSettings(), players: { host: { locked: false, secret: "" } }, roundNumber: 1 });
  startPolling();
});

els.joinRoom.addEventListener("click", async () => {
  const code = els.roomInput.value.trim().toUpperCase(); if (code.length !== 4) return;
  state.roomCode = code; state.role = "guest"; state.online = true; els.roomCode.textContent = code;
  await fbPatch(`rooms/${code}/players`, { guest: { locked: false, secret: "" } });
  startPolling();
});

els.createGroupRoom.addEventListener("click", establishGroupRoom);
els.joinGroupRoom.addEventListener("click", joinGroupRoom);

els.diffEasy.addEventListener("click", () => { state.novaDifficulty = "easy"; syncDiffButtons(); startNovaRound("AI downscaled."); });
els.diffMedium.addEventListener("click", () => { state.novaDifficulty = "medium"; syncDiffButtons(); startNovaRound("AI localized."); });
els.diffImpossible.addEventListener("click", () => { state.novaDifficulty = "impossible"; syncDiffButtons(); startNovaRound("AI maximized."); });

els.easyMode.addEventListener("click", () => { state.clueMode = "easy"; syncClueButtons(); renderTracker(); });
els.hardMode.addEventListener("click", () => { state.clueMode = "hard"; syncClueButtons(); renderTracker(); });
els.codeLength.addEventListener("change", (e) => { state.codeLength = Number(e.target.value); applySettings(roomSettings()); if(state.playMode==="nova") startNovaRound("Matrix dimension adjusted."); });
els.repeatDigits.addEventListener("change", (e) => { state.repeats = e.target.checked; if(state.playMode==="nova") startNovaRound("State laws modulated."); });

els.resetMatch.addEventListener("click", () => state.playMode === "nova" ? startNovaRound("Mainframe re-purged.") : cycleOnlineRound());
els.resetGroupMatch.addEventListener("click", () => establishGroupRoom());
