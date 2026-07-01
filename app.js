/* ═══════════════════════════════════════════════════════════
   CipherRoom — app.js
   ═══════════════════════════════════════════════════════════ */

"use strict";

/* ─── Firebase ──────────────────────────────────────────── */
const FB_CFG = window.CIPHERROOM_FIREBASE || {};
let db = null;
let auth = null;
let authUid = null;
let authError = "";
let firebaseLoadStarted = false;
(function initFirebase() {
  if (!FB_CFG.databaseURL) return;
  firebaseLoadStarted = true;
  const script = document.createElement("script");
  script.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js";
  script.onload = () => {
    const s2 = document.createElement("script");
    s2.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js";
    s2.onload = () => {
      const s3 = document.createElement("script");
      s3.src = "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js";
      s3.onload = () => {
        firebase.initializeApp(FB_CFG);
        db = firebase.database();
        if (FB_CFG.apiKey && FB_CFG.projectId) {
          auth = firebase.auth();
          auth.onAuthStateChanged(user => { authUid = user ? user.uid : null; });
          auth.signInAnonymously().catch(err => {
            authError = err && err.message ? err.message : String(err);
            console.warn("Anonymous auth failed:", authError);
          });
        }
      };
      document.head.appendChild(s3);
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(script);
})();

function fbRef(path) { return db ? db.ref(path) : null; }

function withDatabase(label, cb) {
  if (db && (!auth || authUid)) { cb(); return; }
  if (!FB_CFG.databaseURL || !firebaseLoadStarted) {
    alert(`${label} needs Firebase Realtime Database to be configured.`);
    return;
  }
  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    if (db && (!auth || authUid)) {
      clearInterval(wait);
      cb();
    } else if (tries >= 50) {
      clearInterval(wait);
      alert(authError ? `Firebase Auth failed: ${authError}` : `${label} is still connecting to Firebase${auth ? " Auth" : ""}. Try again in a moment.`);
    }
  }, 100);
}

function firebaseErrorMessage(action, err) {
  const message = err && err.message ? err.message : String(err || "Unknown Firebase error");
  return `${action} failed: ${message}`;
}

/* ─── Utilities ─────────────────────────────────────────── */
function randomCode(len, allowRepeats = false) {
  if (allowRepeats) {
    let code = "";
    for (let i = 0; i < len; i++) code += Math.floor(Math.random() * 10);
    return code;
  }
  const d = [0,1,2,3,4,5,6,7,8,9];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d.slice(0, len).join("");
}

function randomRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function isValidCode(str, len, allowRepeats = false) {
  if (!str || str.length !== len) return false;
  if (!/^\d+$/.test(str)) return false;
  return allowRepeats || new Set(str).size === len;
}

function scoreGuess(secret, guess, clueMode = "position") {
  if (clueMode === "present") {
    const counts = {};
    let present = 0;
    for (const d of secret) counts[d] = (counts[d] || 0) + 1;
    for (const d of guess) {
      if (counts[d] > 0) {
        present++;
        counts[d]--;
      }
    }
    return { greens: 0, yellows: present };
  }
  let greens = 0, yellows = 0;
  const counts = {};
  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) greens++;
    else counts[secret[i]] = (counts[secret[i]] || 0) + 1;
  }
  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) continue;
    if (counts[guess[i]] > 0) {
      yellows++;
      counts[guess[i]]--;
    }
  }
  return { greens, yellows };
}

function buildHistoryItem(guess, greens, yellows, label) {
  const li = document.createElement("li");
  li.className = "history-item";
  const cluesHtml = guess.split("").map((d, i) => {
    let cls = "gray";
    // we need to recompute per digit for display
    return `<div class="clue ${cls}">${d}</div>`;
  }).join("");
  // recompute proper colors
  li.innerHTML = `<div class="guess-number">${label || guess}</div><div class="clues" id="_pending"></div>`;
  return li;
}

function renderHistoryItem(secret, guess, guessLabel, clueMode = "position") {
  const li = document.createElement("li");
  li.className = "history-item";
  const clues = [];
  const secretArr = secret.split("");
  const guessArr = guess.split("");
  const used = new Array(secret.length).fill(false);
  const result = new Array(guess.length).fill("gray");
  if (clueMode === "present") {
    const counts = {};
    secretArr.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
    for (let i = 0; i < guessArr.length; i++) {
      if (counts[guessArr[i]] > 0) {
        result[i] = "yellow";
        counts[guessArr[i]]--;
      }
    }
    const html = guessArr.map((d, i) => `<div class="clue ${result[i]}">${d}</div>`).join("");
    li.innerHTML = `<div class="guess-number">${guessLabel}</div><div class="clues">${html}</div>`;
    return li;
  }
  // greens first
  for (let i = 0; i < guessArr.length; i++) {
    if (guessArr[i] === secretArr[i]) { result[i] = "green"; used[i] = true; }
  }
  // yellows
  for (let i = 0; i < guessArr.length; i++) {
    if (result[i] === "green") continue;
    for (let j = 0; j < secretArr.length; j++) {
      if (!used[j] && guessArr[i] === secretArr[j]) { result[i] = "yellow"; used[j] = true; break; }
    }
  }
  const html = guessArr.map((d, i) => `<div class="clue ${result[i]}">${d}</div>`).join("");
  li.innerHTML = `<div class="guess-number">${guessLabel}</div><div class="clues">${html}</div>`;
  return li;
}

// Version that renders without knowing secret (for opponent's guesses shown with counts only)
function renderHistoryItemPublic(guess, greens, yellows, guessLabel, clueMode = "position") {
  const li = document.createElement("li");
  li.className = "history-item";
  const cluesHtml = guess.split("").map(d => `<div class="clue gray">${d}</div>`).join("");
  const feedback = clueMode === "present"
    ? `<span class="feedback-pill yellow">${yellows} present</span>`
    : `<span class="feedback-pill green">${greens} right spot</span><span class="feedback-pill yellow">${yellows} present</span>`;
  li.innerHTML = `<div class="guess-number">${guessLabel}</div>
    <div class="public-feedback">
      <div class="clues">${cluesHtml}</div>
      <div class="feedback-row">${feedback}</div>
    </div>`;
  return li;
}

function showMessage(elId, msg, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.borderColor = color || "var(--line)";
}

function hideMessage(elId) {
  const el = document.getElementById(elId);
  if (el) el.style.display = "none";
}

function settingsSummary(data) {
  const hint = (data.clueMode || "position") === "present" ? "Hard hints" : "Normal hints";
  const repeats = data.allowRepeats ? "repeats allowed" : "no repeats";
  const mode = data.mode === "realtime" ? "real-time" : "turn-based";
  const players = data.playerCount ? `${data.playerCount} players` : "2 players";
  const groupType = data.groupType === "battle" ? "Code Battle" : (data.playerCount ? "Shared Code Race" : null);
  const parts = [`${data.digits || 4} digits`, repeats, hint, mode, players];
  if (groupType) parts.push(groupType);
  if (!data.playerCount) parts.splice(4, 0, data.trackerEnabled === false ? "tracker off" : "tracker on");
  return parts.join(" · ");
}

function digitRuleText(allowRepeats) {
  return allowRepeats ? "Digits may repeat." : "No repeated digits.";
}

/* ─── Page routing ──────────────────────────────────────── */
const PAGES = ["pageHome","pageModePicker","pageNovaSetup","pageMultiSetup","pageGroupSetup","pageLobby","pageNovaGame","pageMultiGame","pageGroupGame"];

window.showPage = function(id) {
  PAGES.forEach(p => { const el = document.getElementById(p); if (el) el.style.display = "none"; });
  const target = document.getElementById(id);
  if (target) target.style.display = target.classList.contains("setup-page") ? "grid" : "block";
  window.scrollTo(0, 0);
};

window.showModePicker = function() { showPage("pageModePicker"); };

window.startMode = function(mode) {
  if (mode === "nova") showPage("pageNovaSetup");
  else if (mode === "multiplayer") showPage("pageMultiSetup");
  else if (mode === "group") showPage("pageGroupSetup");
};

/* ─── Theme toggle ──────────────────────────────────────── */
(function() {
  const saved = localStorage.getItem("crTheme");
  if (saved === "light") document.documentElement.classList.add("light");
  document.getElementById("themeToggle").addEventListener("click", () => {
    const isLight = document.documentElement.classList.toggle("light");
    localStorage.setItem("crTheme", isLight ? "light" : "dark");
  });
})();

/* ─── Nav / home buttons ────────────────────────────────── */
document.getElementById("brandHome").addEventListener("click", () => showPage("pageHome"));
document.getElementById("navPlay").addEventListener("click", (e) => { e.preventDefault(); showModePicker(); });
document.getElementById("heroPlay").addEventListener("click", () => showModePicker());
document.getElementById("heroHowto").addEventListener("click", () => {
  document.getElementById("howtoOverlay").style.display = "flex";
});
document.querySelectorAll("[data-start-mode]").forEach(el => {
  el.addEventListener("click", () => window.startMode(el.dataset.startMode));
});
document.querySelectorAll("button:not([type])").forEach(btn => { btn.type = "button"; });

/* ─── Segmented controls helper ────────────────────────── */
function initSegmented(containerId, cb) {
  const seg = document.getElementById(containerId);
  if (!seg) return;
  seg.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (cb) cb(btn.dataset.val);
    });
  });
}
function segValue(containerId) {
  const seg = document.getElementById(containerId);
  if (!seg) return null;
  const active = seg.querySelector("button.active");
  return active ? active.dataset.val : null;
}

initSegmented("novaDiffSeg");
initSegmented("novaModeSeg");
initSegmented("novaRepeatSeg");
initSegmented("novaClueSeg");
initSegmented("novaTrackerSeg");
initSegmented("multiJoinSeg", v => {
  document.getElementById("multiJoinCodeWrap").style.display = v === "join" ? "block" : "none";
  ["multiDigits","multiRepeatWrap","multiClueWrap","multiTrackerWrap","multiModeSeg"].forEach(id => {
    const el = document.getElementById(id);
    const wrap = id === "multiDigits" ? el.closest("label") : el.closest("fieldset");
    if (wrap) wrap.style.display = v === "create" ? "block" : "none";
  });
});
initSegmented("multiModeSeg");
initSegmented("multiRepeatSeg");
initSegmented("multiClueSeg");
initSegmented("multiTrackerSeg");
initSegmented("groupJoinSeg", v => {
  document.getElementById("groupJoinCodeWrap").style.display = v === "join" ? "block" : "none";
  ["groupTypeWrap","groupSizeWrap","groupDigitsWrap","groupRepeatWrap","groupModeWrap","groupVisWrap","groupClueWrap"].forEach(id => {
    document.getElementById(id).style.display = v === "create" ? "block" : "none";
  });
  updateGroupSetupVisibility();
});
initSegmented("groupModeSeg");
initSegmented("groupVisSeg");
initSegmented("groupRepeatSeg");
initSegmented("groupClueSeg");
initSegmented("groupTypeSeg", updateGroupSetupVisibility);

function updateGroupSetupVisibility() {
  const joinType = segValue("groupJoinSeg") || "create";
  const groupType = segValue("groupTypeSeg") || "race";
  const visWrap = document.getElementById("groupVisWrap");
  if (visWrap) visWrap.style.display = joinType === "create" && groupType !== "battle" ? "block" : "none";
}

/* ══════════════════════════════════════════════════════════
   ROUND END OVERLAY
══════════════════════════════════════════════════════════ */
function showRoundEnd(title, msg, buttons) {
  document.getElementById("roundEndTitle").textContent = title;
  document.getElementById("roundEndMsg").textContent = msg;
  const wrap = document.getElementById("roundEndButtons");
  wrap.innerHTML = "";
  buttons.forEach(b => {
    const btn = document.createElement("button");
    btn.className = b.primary ? "primary-action" : "secondary-action";
    btn.textContent = b.label;
    btn.addEventListener("click", () => {
      document.getElementById("roundEndOverlay").style.display = "none";
      b.action();
    });
    wrap.appendChild(btn);
  });
  document.getElementById("roundEndOverlay").style.display = "flex";
}

/* ══════════════════════════════════════════════════════════
   DIGIT TRACKER
══════════════════════════════════════════════════════════ */
function buildDigitTracker(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  for (let i = 0; i <= 9; i++) {
    const cell = document.createElement("div");
    cell.className = "digit-cell";
    cell.id = `${containerId}_d${i}`;
    cell.dataset.digit = String(i);
    cell.innerHTML = `<span>${i}</span><span id="${containerId}_s${i}" style="color:var(--muted)"></span>`;
    el.appendChild(cell);
  }
}

function connectDigitPad(containerId, inputId, allowRepeatsFn) {
  const grid = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  if (!grid || !input) return;
  grid.querySelectorAll(".digit-cell").forEach(cell => {
    cell.title = "Tap to add this digit";
    cell.addEventListener("click", () => {
      if (input.disabled) return;
      const digit = cell.dataset.digit;
      const max = parseInt(input.maxLength, 10) || 5;
      const allowRepeats = allowRepeatsFn ? allowRepeatsFn() : false;
      if (input.value.length >= max) return;
      if (!allowRepeats && input.value.includes(digit)) return;
      input.value += digit;
      input.focus();
    });
  });
}

function updateTracker(containerId, digit, status) {
  // status: 'green','yellow','gray'
  const el = document.getElementById(`${containerId}_s${digit}`);
  if (!el) return;
  const colors = { green: "var(--green)", yellow: "var(--yellow)", gray: "var(--red)" };
  const symbols = { green: "✓", yellow: "~", gray: "✗" };
  el.textContent = symbols[status] || "";
  el.style.color = colors[status] || "var(--muted)";
}

function applyGuessToTracker(containerId, secret, guess, clueMode = "position") {
  const secretArr = secret.split("");
  const guessArr = guess.split("");
  const used = new Array(secret.length).fill(false);
  const result = {};
  if (clueMode === "present") {
    const present = new Set(secretArr);
    guessArr.forEach(d => updateTracker(containerId, d, present.has(d) ? "yellow" : "gray"));
    return;
  }
  guessArr.forEach((d, i) => {
    if (d === secretArr[i]) { result[d] = "green"; used[i] = true; }
  });
  guessArr.forEach((d, i) => {
    if (result[d] === "green") return;
    let found = false;
    for (let j = 0; j < secretArr.length; j++) {
      if (!used[j] && d === secretArr[j]) { found = true; used[j] = true; break; }
    }
    result[d] = found ? "yellow" : "gray";
  });
  Object.entries(result).forEach(([d, s]) => updateTracker(containerId, d, s));
}

/* ══════════════════════════════════════════════════════════
   NOVA AI
══════════════════════════════════════════════════════════ */
const Nova = (() => {
  let candidates = [];
  let difficulty = "medium";
  let clueMode = "position";

  function allCodes(len, allowRepeats = false) {
    const res = [];
    function gen(cur) {
      if (cur.length === len) { res.push(cur); return; }
      for (let d = 0; d <= 9; d++) {
        if (allowRepeats || !cur.includes(String(d))) gen(cur + d);
      }
    }
    gen("");
    return res;
  }

  function filterCandidates(guess, greens, yellows) {
    candidates = candidates.filter(c => {
      const s = scoreGuess(c, guess, clueMode);
      return s.greens === greens && s.yellows === yellows;
    });
  }

  function pickGuess() {
    if (difficulty === "easy") {
      // random from candidates but filter some noise
      return candidates[Math.floor(Math.random() * Math.min(candidates.length, 8))];
    }
    if (difficulty === "medium") {
      // pick a random from top half of candidates
      const top = candidates.slice(0, Math.ceil(candidates.length / 2));
      return top[Math.floor(Math.random() * top.length)];
    }
    // impossible: minimax-lite — pick guess that maximally reduces candidates
    if (candidates.length <= 2) return candidates[0];
    let bestGuess = candidates[0];
    let bestWorst = Infinity;
    // sample to keep performance reasonable
    const step = Math.max(1, Math.ceil(candidates.length / 300));
    const sample = candidates.length > 300 ? candidates.filter((_, i) => i % step === 0) : candidates;
    sample.forEach(g => {
      const buckets = {};
      candidates.forEach(c => {
        const s = scoreGuess(c, g, clueMode);
        const k = `${s.greens},${s.yellows}`;
        buckets[k] = (buckets[k] || 0) + 1;
      });
      const worst = Math.max(...Object.values(buckets));
      if (worst < bestWorst) { bestWorst = worst; bestGuess = g; }
    });
    return bestGuess;
  }

  return {
    init(len, diff, allowRepeats = false, mode = "position") {
      difficulty = diff;
      clueMode = mode;
      candidates = allCodes(len, allowRepeats);
    },
    makeGuess() { return pickGuess(); },
    update(guess, greens, yellows) { filterCandidates(guess, greens, yellows); },
    remaining() { return candidates.length; }
  };
})();

/* ══════════════════════════════════════════════════════════
   NOVA GAME STATE
══════════════════════════════════════════════════════════ */
const NovaGame = (() => {
  let state = {};
  let timerInterval = null;

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function reset() {
    stopTimer();
    state = {
      playerName: "Player",
      digits: 4,
      allowRepeats: false,
      clueMode: "position",
      trackerEnabled: true,
      difficulty: "medium",
      mode: "turns",
      playerSecret: null,
      novaSecret: null,
      locked: false,
      round: 1,
      playerScore: 0,
      novaScore: 0,
      playerGuesses: [],
      novaGuesses: [],
      novaThinking: false,
      gameOver: false,
      timerSecs: 180
    };
  }

  function start(name, digits, diff, mode, allowRepeats, clueMode, trackerEnabled) {
    reset();
    state.playerName = "You";
    state.digits = parseInt(digits);
    state.allowRepeats = !!allowRepeats;
    state.clueMode = clueMode || "position";
    state.trackerEnabled = trackerEnabled !== false;
    state.difficulty = diff;
    state.mode = mode || "turns";
    state.novaSecret = randomCode(state.digits, state.allowRepeats);
    Nova.init(state.digits, diff, state.allowRepeats, state.clueMode);

    document.getElementById("novaGameTitle").textContent = `${state.playerName} vs Nova`;
    document.getElementById("novaRulesBar").textContent = settingsSummary(state);
    document.getElementById("novaDiffBadge").textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
    document.getElementById("novaModeBadge").textContent = state.mode === "realtime" ? "Real-Time" : "Turn-Based";
    document.getElementById("novaTimerBadge").style.display = state.mode === "realtime" ? "inline-flex" : "none";
    document.getElementById("novaTimerBadge").textContent = "3:00";
    document.getElementById("novaSecretInput").maxLength = state.digits;
    document.getElementById("novaSecretInput").disabled = false;
    document.getElementById("novaLockBtn").disabled = false;
    document.getElementById("novaGuessInput").maxLength = state.digits;
    document.getElementById("novaGuessInput").placeholder = `e.g. ${randomCode(state.digits, state.allowRepeats)}`;
    document.getElementById("novaSecretInput").placeholder = `e.g. ${randomCode(state.digits, state.allowRepeats)}`;
    document.getElementById("novaSecretHelp").textContent = `Choose your secret code. ${digitRuleText(state.allowRepeats)}`;
    document.getElementById("novaSecretPanel").style.display = "grid";
    document.getElementById("novaSecretLocked").style.display = "none";
    document.getElementById("novaGuessInput").disabled = true;
    document.getElementById("novaGuessBtn").disabled = true;
    document.getElementById("novaDigitGrid").closest(".tracker-panel").style.display = state.trackerEnabled ? "block" : "none";
    if (state.trackerEnabled) {
      buildDigitTracker("novaDigitGrid");
      connectDigitPad("novaDigitGrid", "novaGuessInput", () => state.allowRepeats);
    }
    renderNovaUI();
    showPage("pageNovaGame");
  }

  function lockSecret() {
    if (state.locked) return;
    const val = document.getElementById("novaSecretInput").value.trim();
    if (!isValidCode(val, state.digits, state.allowRepeats)) {
      showMessage("novaMessage", `Secret must be ${state.digits} digits${state.allowRepeats ? "" : " with no repeats"}.`, "var(--red)");
      return;
    }
    state.playerSecret = val;
    state.locked = true;
    document.getElementById("novaSecretInput").disabled = true;
    document.getElementById("novaLockBtn").disabled = true;
    document.getElementById("novaSecretPanel").style.display = "none";
    document.getElementById("novaSecretLocked").style.display = "block";
    document.getElementById("novaGuessInput").disabled = false;
    document.getElementById("novaGuessBtn").disabled = false;
    if (state.mode === "realtime") startRealtimeTimer();
    hideMessage("novaMessage");
  }

  function submitGuess(raw) {
    if (!state.locked || state.gameOver) return;
    if (state.novaThinking) {
      showMessage("novaMessage", "Nova is thinking. Wait for the reply guess.", "var(--yellow)");
      return;
    }
    const guess = raw.trim();
    if (!isValidCode(guess, state.digits, state.allowRepeats)) {
      showMessage("novaMessage", `Guess must be ${state.digits} digits${state.allowRepeats ? "" : " with no repeats"}.`, "var(--red)");
      return;
    }
    hideMessage("novaMessage");

    // Player guesses Nova's secret
    const { greens, yellows } = scoreGuess(state.novaSecret, guess, state.clueMode);
    state.playerGuesses.push({ guess, greens, yellows });
    if (state.trackerEnabled) applyGuessToTracker("novaDigitGrid", state.novaSecret, guess, state.clueMode);
    renderNovaUI();
    document.getElementById("novaGuessInput").value = "";

    if (guess === state.novaSecret) {
      state.playerScore++;
      endRound(`${state.playerName} cracked it!`, `The code was ${state.novaSecret}. You got it in ${state.playerGuesses.length} guesses.`, true);
      return;
    }

    // Nova guesses player's secret
    state.novaThinking = true;
    document.getElementById("novaGuessInput").disabled = true;
    document.getElementById("novaGuessBtn").disabled = true;
    setTimeout(() => {
      if (state.gameOver) return;
      const novaGuess = Nova.makeGuess();
      const ns = scoreGuess(state.playerSecret, novaGuess, state.clueMode);
      Nova.update(novaGuess, ns.greens, ns.yellows);
      state.novaGuesses.push({ guess: novaGuess, greens: ns.greens, yellows: ns.yellows });
      state.novaThinking = false;
      renderNovaUI();
      if (novaGuess === state.playerSecret) {
        state.novaScore++;
        endRound("Nova cracked your code!", `Nova guessed ${state.playerSecret} in ${state.novaGuesses.length} tries.`, false);
      } else {
        document.getElementById("novaGuessInput").disabled = false;
        document.getElementById("novaGuessBtn").disabled = false;
      }
    }, 700);
  }

  function endRound(title, msg, playerWon) {
    state.gameOver = true;
    stopTimer();
    document.getElementById("novaGuessBtn").disabled = true;
    document.getElementById("novaGuessInput").disabled = true;
    showRoundEnd(title, msg, [
      { label: "Next Round", primary: true, action: () => nextRound() },
      { label: "Quit", primary: false, action: () => { novaQuit(); } }
    ]);
  }

  function nextRound() {
    stopTimer();
    state.round++;
    state.playerGuesses = [];
    state.novaGuesses = [];
    state.novaThinking = false;
    state.locked = false;
    state.gameOver = false;
    state.novaSecret = randomCode(state.digits, state.allowRepeats);
    state.timerSecs = 180;
    Nova.init(state.digits, state.difficulty, state.allowRepeats, state.clueMode);
    document.getElementById("novaSecretInput").value = "";
    document.getElementById("novaSecretInput").disabled = false;
    document.getElementById("novaLockBtn").disabled = false;
    document.getElementById("novaSecretHelp").textContent = `Choose your secret code. ${digitRuleText(state.allowRepeats)}`;
    document.getElementById("novaSecretPanel").style.display = "grid";
    document.getElementById("novaSecretLocked").style.display = "none";
    document.getElementById("novaGuessInput").disabled = true;
    document.getElementById("novaGuessBtn").disabled = true;
    document.getElementById("novaTimerBadge").textContent = "3:00";
    if (state.trackerEnabled) {
      buildDigitTracker("novaDigitGrid");
      connectDigitPad("novaDigitGrid", "novaGuessInput", () => state.allowRepeats);
    }
    renderNovaUI();
  }

  function handleDraw() {
    if (state.gameOver) return;
    state.gameOver = true;
    stopTimer();
    document.getElementById("novaGuessInput").disabled = true;
    document.getElementById("novaGuessBtn").disabled = true;
    showRoundEnd("Time's Up!", "Neither side cracked the code in time.", [
      { label: "Overtime (+2 min)", primary: true, action: () => startOvertime() },
      { label: "Draw — Quit", primary: false, action: () => novaQuit() }
    ]);
  }

  function startOvertime() {
    state.timerSecs = 120;
    state.gameOver = false;
    state.novaThinking = false;
    document.getElementById("novaGuessInput").disabled = false;
    document.getElementById("novaGuessBtn").disabled = false;
    startRealtimeTimer();
  }

  function startRealtimeTimer() {
    stopTimer();
    const end = Date.now() + state.timerSecs * 1000;
    const badge = document.getElementById("novaTimerBadge");
    badge.style.display = "inline-flex";
    timerInterval = setInterval(() => {
      const rem = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      badge.textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (rem === 0) {
        handleDraw();
      }
    }, 500);
  }

  function renderNovaUI() {
    document.getElementById("novaRoundBadge").textContent = `Round ${state.round}`;
    document.getElementById("novaScoreBadge").textContent = `${state.playerScore} – ${state.novaScore}`;
    document.getElementById("novaYourGuessCount").textContent = state.playerGuesses.length;
    document.getElementById("novaNovaGuessCount").textContent = state.novaGuesses.length;

    const yourList = document.getElementById("novaYourHistory");
    yourList.innerHTML = "";
    state.playerGuesses.forEach((g, i) => {
      yourList.appendChild(renderHistoryItem(state.novaSecret, g.guess, `#${i+1} — ${g.guess}`, state.clueMode));
    });

    const novaList = document.getElementById("novaNovaHistory");
    novaList.innerHTML = "";
    state.novaGuesses.forEach((g, i) => {
      novaList.appendChild(renderHistoryItemPublic(g.guess, g.greens, g.yellows, `#${i+1} — ${g.guess}`, state.clueMode));
    });
  }

  return { start, lockSecret, submitGuess };
})();

window.novaQuit = function() { showPage("pageHome"); };
document.getElementById("novaLockBtn").addEventListener("click", e => {
  e.preventDefault();
  NovaGame.lockSecret();
});
document.getElementById("novaGuessBtn").addEventListener("click", e => {
  e.preventDefault();
  NovaGame.submitGuess(document.getElementById("novaGuessInput").value);
});
document.getElementById("novaGuessInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    NovaGame.submitGuess(document.getElementById("novaGuessInput").value);
  }
});

document.getElementById("novaStartBtn").addEventListener("click", e => {
  e.preventDefault();
  const digits = document.getElementById("novaDigits").value;
  const diff = segValue("novaDiffSeg") || "medium";
  const mode = segValue("novaModeSeg") || "turns";
  const allowRepeats = segValue("novaRepeatSeg") === "repeat";
  const clueMode = segValue("novaClueSeg") || "position";
  const trackerEnabled = segValue("novaTrackerSeg") !== "off";
  NovaGame.start("You", digits, diff, mode, allowRepeats, clueMode, trackerEnabled);
});

/* ══════════════════════════════════════════════════════════
   MULTIPLAYER GAME STATE
══════════════════════════════════════════════════════════ */
const MultiGame = (() => {
  let state = {};
  let listeners = [];
  let timerInterval = null;

  function clearListeners() {
    listeners.forEach(off => off());
    listeners = [];
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function reset() {
    clearListeners();
    stopTimer();
    state = {
      roomCode: null,
      playerId: null, // "p1" or "p2"
      playerName: "",
      opponentName: "",
      digits: 4,
      allowRepeats: false,
      clueMode: "position",
      trackerEnabled: true,
      mode: "turns", // "turns" | "realtime"
      round: 1,
      p1Score: 0,
      p2Score: 0,
      mySecret: null,
      myLocked: false,
      oppLocked: false,
      myGuesses: [],
      oppGuesses: [],
      currentTurn: "p1",
      timerSecs: 180,
      gameOver: false,
      gameStarted: false,
      roundStarting: false,
      timerStarted: false
    };
  }

  function createRoom(name, digits, mode, allowRepeats, clueMode, trackerEnabled) {
    reset();
    if (!db) { alert("Firebase not configured. Multiplayer requires a live database."); return; }
    state.playerName = "Player 1";
    state.digits = parseInt(digits);
    state.allowRepeats = !!allowRepeats;
    state.clueMode = clueMode || "position";
    state.trackerEnabled = trackerEnabled !== false;
    state.mode = mode;
    state.playerId = "p1";
    state.roomCode = randomRoomCode();

    showPage("pageLobby");
    document.getElementById("lobbyEyebrow").textContent = "Multiplayer · Waiting for opponent";
    document.getElementById("lobbyTitle").textContent = "Room Code";
    document.getElementById("lobbyRoomCode").textContent = state.roomCode;
    document.getElementById("lobbyStatus").textContent = "Share this code with your friend. Waiting for them to join…";
    document.getElementById("lobbySettings").style.display = "block";
    document.getElementById("lobbySettings").textContent = settingsSummary(state);

    const roomRef = fbRef(`rooms/${state.roomCode}`);
    roomRef.set({
      digits: state.digits,
      allowRepeats: state.allowRepeats,
      clueMode: state.clueMode,
      trackerEnabled: state.trackerEnabled,
      mode: state.mode,
      round: 1,
      p1: { name: state.playerName, locked: false, secret: "", score: 0, uid: authUid || "" },
      p2: { name: "", locked: false, secret: "", score: 0 },
      currentTurn: "p1",
      phase: "lobby",
      timerEnd: null,
      overtimeVotes: {},
      guesses: { p1: [], p2: [] }
    }).then(() => {
      document.getElementById("lobbyStatus").textContent = "Room is live. Share this code with your friend.";
      return roomRef.child("p1/connected").set(true);
    }).then(() => {
      roomRef.child("p1/connected").onDisconnect().set(false);
      roomRef.child("phase").onDisconnect().set("abandoned:p1");
    }).catch(err => {
      document.getElementById("lobbyStatus").textContent = "Firebase did not create the room.";
      alert(firebaseErrorMessage("Create room", err));
    });

    const handleRoomValue = snap => {
      const data = snap.val();
      if (!data) return;
      if (data.p2 && data.p2.name && data.phase === "lobby") {
        state.opponentName = data.p2.name;
        document.getElementById("lobbyStatus").textContent = `${state.opponentName} joined! Setting up game…`;
        // Move to secret lock phase
        roomRef.update({ phase: "lock" });
      }
      if (data.phase === "lock") {
        clearListeners();
        startGamePhase(data);
      }
    };
    roomRef.on("value", handleRoomValue);
    listeners.push(() => roomRef.off("value", handleRoomValue));
  }

  function joinRoom(name, code) {
    reset();
    if (!db) { alert("Firebase not configured. Multiplayer requires a live database."); return; }
    state.playerName = name || "Player 2";
    state.playerId = "p2";
    state.roomCode = code.toUpperCase();

    const roomRef = fbRef(`rooms/${state.roomCode}`);
    roomRef.once("value", snap => {
      const data = snap.val();
      if (!data) { alert("Room not found. Check the code and try again."); return; }
      state.digits = data.digits;
      state.allowRepeats = !!data.allowRepeats;
      state.clueMode = data.clueMode || "position";
      state.trackerEnabled = data.trackerEnabled !== false;
      state.mode = data.mode;
      state.opponentName = data.p1.name;
      roomRef.child("p2").update({ name: state.playerName, locked: false, secret: "", uid: authUid || "" }).then(() => {
        return roomRef.child("p2/connected").set(true);
      }).then(() => {
        roomRef.child("p2/connected").onDisconnect().set(false);
        roomRef.child("phase").onDisconnect().set("abandoned:p2");
      }).catch(err => {
        alert(firebaseErrorMessage("Join room", err));
      });

      const handleJoinValue = snap2 => {
        const d2 = snap2.val();
        if (!d2) return;
        state.digits = d2.digits || state.digits;
        state.allowRepeats = !!d2.allowRepeats;
        state.clueMode = d2.clueMode || state.clueMode || "position";
        state.trackerEnabled = d2.trackerEnabled !== false;
        state.mode = d2.mode || state.mode;
        state.opponentName = d2.p1 && d2.p1.name ? d2.p1.name : state.opponentName;
        if (d2.phase === "lock") {
          clearListeners();
          startGamePhase(d2);
        } else if (d2.phase === "lobby" && d2.p2 && d2.p2.name) {
          roomRef.update({ phase: "lock" });
        }
      };
      roomRef.on("value", handleJoinValue);
      listeners.push(() => roomRef.off("value", handleJoinValue));

      showPage("pageLobby");
      document.getElementById("lobbyEyebrow").textContent = "Multiplayer · Joined";
      document.getElementById("lobbyTitle").textContent = "Room Code";
      document.getElementById("lobbyRoomCode").textContent = state.roomCode;
      document.getElementById("lobbyStatus").textContent = `Joined ${state.opponentName}'s room. Setting up…`;
      document.getElementById("lobbySettings").style.display = "block";
      document.getElementById("lobbySettings").textContent = settingsSummary(state);
    });
  }

  function startGamePhase(data) {
    state.digits = data.digits;
    state.allowRepeats = !!data.allowRepeats;
    state.clueMode = data.clueMode || "position";
    state.trackerEnabled = data.trackerEnabled !== false;
    state.mode = data.mode;
    state.round = data.round || 1;
    state.p1Score = (data.p1 && data.p1.score) || 0;
    state.p2Score = (data.p2 && data.p2.score) || 0;
    state.opponentName = state.playerId === "p1" ? (data.p2 && data.p2.name) : (data.p1 && data.p1.name);
    state.currentTurn = data.currentTurn || "p1";
    state.myGuesses = [];
    state.oppGuesses = [];
    state.gameOver = false;
    state.myLocked = false;
    state.oppLocked = false;
    state.mySecret = null;
    state.gameStarted = false;
    state.timerStarted = false;

    setupMultiGameUI();
    listenForRoomState();
  }

  function setupMultiGameUI() {
    document.getElementById("multiGameTitle").textContent = "Multiplayer Match";
    document.getElementById("multiRulesBar").textContent = settingsSummary(state);
    document.getElementById("multiModeBadge").textContent = state.mode === "turns" ? "Turn-Based" : "Real-Time";
    document.getElementById("multiRoundBadge").textContent = `Round ${state.round}`;
    document.getElementById("multiScoreBadge").textContent = `${state.p1Score} – ${state.p2Score}`;
    document.getElementById("multiRoomBadge").textContent = `Room: ${state.roomCode}`;
    document.getElementById("multiYourLabel").textContent = "My Guesses";
    document.getElementById("multiOppLabel").textContent = "Opponent's Guesses";
    document.getElementById("multiTimerBadge").style.display = state.mode === "realtime" ? "inline-flex" : "none";
    document.getElementById("multiSecretPanel").style.display = "grid";
    document.getElementById("multiSecretLocked").style.display = "none";
    document.getElementById("multiWaitingOpponent").style.display = "none";
    document.getElementById("multiGameArea").style.display = "none";
    document.getElementById("multiSecretInput").maxLength = state.digits;
    document.getElementById("multiGuessInput").maxLength = state.digits;
    document.getElementById("multiGuessInput").placeholder = `e.g. ${randomCode(state.digits, state.allowRepeats)}`;
    document.getElementById("multiSecretInput").placeholder = `e.g. ${randomCode(state.digits, state.allowRepeats)}`;
    document.getElementById("multiSecretHelp").textContent = `Choose your secret code. ${digitRuleText(state.allowRepeats)} Game starts when both players lock.`;
    document.getElementById("multiGuessInput").disabled = true;
    document.getElementById("multiGuessBtn").disabled = true;
    document.getElementById("multiLockBtn").disabled = false;
    document.getElementById("multiSecretInput").value = "";
    document.getElementById("multiSecretInput").disabled = false;
    document.getElementById("multiDigitGrid").closest(".tracker-panel").style.display = state.trackerEnabled ? "block" : "none";
    if (state.trackerEnabled) {
      buildDigitTracker("multiDigitGrid");
      connectDigitPad("multiDigitGrid", "multiGuessInput", () => state.allowRepeats);
    }
    hideMessage("multiMessage");
    showPage("pageMultiGame");
  }

  function listenForRoomState() {
    const roomRef = fbRef(`rooms/${state.roomCode}`);
    const handleRoomState = snap => {
      const data = snap.val();
      if (!data) return;
      const myId = state.playerId;
      const oppId = myId === "p1" ? "p2" : "p1";
      state.oppLocked = !!(data[oppId] && data[oppId].locked);
      state.myLocked = !!(data[myId] && data[myId].locked);
      state.currentTurn = data.currentTurn || state.currentTurn || "p1";
      state.p1Score = (data.p1 && data.p1.score) || 0;
      state.p2Score = (data.p2 && data.p2.score) || 0;
      state.opponentName = data[oppId] && data[oppId].name ? data[oppId].name : state.opponentName;
      if (data.round && data.round !== state.round && data.phase === "lock") {
        state.roundStarting = false;
        clearListeners();
        startGamePhase(data);
        return;
      }
      if (data.phase === "lock" && state.gameOver) {
        state.roundStarting = false;
        clearListeners();
        startGamePhase(data);
        return;
      }
      if (data.phase && data.phase.startsWith("abandoned:")) {
        handleAbandoned(data.phase.split(":")[1]);
        return;
      }
      if (state.myLocked) {
        document.getElementById("multiSecretPanel").style.display = "none";
        document.getElementById("multiSecretLocked").style.display = "block";
        document.getElementById("multiSecretLocked").textContent = `Your secret: ${state.mySecret || "locked"}`;
        document.getElementById("multiWaitingOpponent").style.display = state.oppLocked ? "none" : "block";
      }
      if (state.myLocked && state.oppLocked && data.phase === "lock") {
        roomRef.child("phase").set("playing");
      }
      if (data.phase === "draw" && data.overtimeVotes && data.overtimeVotes.p1 && data.overtimeVotes.p2) {
        roomRef.update({
          phase: "playing",
          timerEnd: Date.now() + 120000,
          overtimeVotes: {}
        });
        return;
      }
      if (data.phase === "playing") {
        if (state.gameOver) resumeOvertime(data);
        else beginPlaying(data);
      } else if (data.phase && data.phase.startsWith("win:")) {
        handleWin(data.phase.split(":")[1]);
      } else if (data.phase === "draw") {
        handleDraw();
      }
    };
    roomRef.on("value", handleRoomState);
    listeners.push(() => roomRef.off("value", handleRoomState));
  }

  function beginPlaying(data) {
    if (state.gameStarted) return;
    state.gameStarted = true;
    state.gameOver = false;
    state.oppSecret = null;
    document.getElementById("multiWaitingOpponent").style.display = "none";
    document.getElementById("multiSecretLocked").textContent = `Your secret: ${state.mySecret || "locked"}`;
    document.getElementById("multiGameArea").style.display = "grid";
    fetchOppSecret();
    startTurnListener();
    if (state.mode === "realtime") startRealtimeTimer(data.timerEnd);
  }

  function resumeOvertime(data) {
    state.gameOver = false;
    state.timerStarted = false;
    document.getElementById("roundEndOverlay").style.display = "none";
    document.getElementById("multiGameArea").style.display = "grid";
    updateTurnUI();
    if (!state.oppSecret) fetchOppSecret();
    if (state.mode === "realtime") startRealtimeTimer(data.timerEnd || Date.now() + 120000);
  }

  function lockSecret() {
    if (state.myLocked || state.gameStarted) return;
    const val = document.getElementById("multiSecretInput").value.trim();
    if (!isValidCode(val, state.digits, state.allowRepeats)) {
      showMessage("multiMessage", `Secret must be ${state.digits} digits${state.allowRepeats ? "" : " with no repeats"}.`, "var(--red)");
      return;
    }
    state.mySecret = val;
    state.myLocked = true;
    hideMessage("multiMessage");

    const roomRef = fbRef(`rooms/${state.roomCode}`);
    roomRef.child(state.playerId).update({ locked: true, secret: val });

    document.getElementById("multiSecretPanel").style.display = "none";
    document.getElementById("multiSecretInput").disabled = true;
    document.getElementById("multiLockBtn").disabled = true;
    document.getElementById("multiSecretLocked").style.display = "block";
    document.getElementById("multiSecretLocked").textContent = `Your secret: ${state.mySecret}`;
    document.getElementById("multiWaitingOpponent").style.display = state.oppLocked ? "none" : "block";
  }

  function fetchOppSecret() {
    const oppId = state.playerId === "p1" ? "p2" : "p1";
    fbRef(`rooms/${state.roomCode}/${oppId}/secret`).once("value", snap => {
      state.oppSecret = snap.val();
    });
  }

  function startTurnListener() {
    const roomRef = fbRef(`rooms/${state.roomCode}`);
    // Listen for guesses from opponent
    const oppId = state.playerId === "p1" ? "p2" : "p1";
    const off = roomRef.child(`guesses/${oppId}`).on("value", snap => {
      const data = snap.val();
      if (!data) return;
      const arr = Object.values(data).sort((a, b) => a.ts - b.ts);
      state.oppGuesses = arr;
      renderMultiUI();
    });
    listeners.push(() => roomRef.child(`guesses/${oppId}`).off("value", off));

    // Listen for current turn
    const off2 = roomRef.child("currentTurn").on("value", snap => {
      state.currentTurn = snap.val() || "p1";
      updateTurnUI();
    });
    listeners.push(() => roomRef.child("currentTurn").off("value", off2));

    // Listen for phase (win conditions)
  }

  function isMyTurn() {
    if (state.mode === "realtime") return true;
    return state.currentTurn === state.playerId;
  }

  function updateTurnUI() {
    const myTurn = isMyTurn();
    document.getElementById("multiGuessInput").disabled = !myTurn || state.gameOver;
    document.getElementById("multiGuessBtn").disabled = !myTurn || state.gameOver;
    const label = document.getElementById("multiTurnLabel");
    if (state.mode === "turns") {
      label.textContent = myTurn ? "Your turn — make a guess!" : "Waiting for opponent's guess…";
      label.style.borderColor = myTurn ? "var(--cyan)" : "var(--line)";
    } else {
      label.textContent = "Real-Time — guess whenever you want!";
    }
  }

  function submitGuess(raw) {
    if (!isMyTurn() || state.gameOver) return;
    const guess = raw.trim();
    if (!isValidCode(guess, state.digits, state.allowRepeats)) {
      showMessage("multiMessage", `Guess must be ${state.digits} digits${state.allowRepeats ? "" : " with no repeats"}.`, "var(--red)");
      return;
    }
    if (!state.oppSecret) { showMessage("multiMessage", "Waiting for game to fully sync…", "var(--yellow)"); return; }
    hideMessage("multiMessage");

    const { greens, yellows } = scoreGuess(state.oppSecret, guess, state.clueMode);
    const entry = { guess, greens, yellows, ts: Date.now() };
    state.myGuesses.push(entry);

    const roomRef = fbRef(`rooms/${state.roomCode}`);
    const myId = state.playerId;
    const guessKey = `g${state.myGuesses.length}`;
    roomRef.child(`guesses/${myId}/${guessKey}`).set(entry);

    if (state.trackerEnabled) applyGuessToTracker("multiDigitGrid", state.oppSecret, guess, state.clueMode);
    document.getElementById("multiGuessInput").value = "";
    renderMultiUI();

    if (guess === state.oppSecret) {
      // I won this round
      const newScore = state.playerId === "p1" ? state.p1Score + 1 : state.p2Score + 1;
      if (state.playerId === "p1") state.p1Score = newScore;
      else state.p2Score = newScore;
      roomRef.update({ [`${state.playerId}/score`]: newScore, phase: `win:${state.playerId}` });
      return;
    }

    // Advance turn in turn-based
    if (state.mode === "turns") {
      const oppId = state.playerId === "p1" ? "p2" : "p1";
      state.currentTurn = oppId;
      updateTurnUI();
      roomRef.child("currentTurn").set(oppId);
    }
  }

  function handleWin(winnerId) {
    if (state.gameOver) return;
    state.gameOver = true;
    stopTimer();
    const iWon = winnerId === state.playerId;
    const winnerName = winnerId === "p1" ? (state.playerId === "p1" ? state.playerName : state.opponentName) : (state.playerId === "p2" ? state.playerName : state.opponentName);
    showRoundEnd(
      iWon ? "You cracked it!" : `${winnerName} wins this round!`,
      `Score: ${state.p1Score} – ${state.p2Score}`,
      [
        { label: "Next Round", primary: true, action: () => nextRound() },
        ...(state.playerId === "p1" ? [{ label: "Change Settings", primary: false, action: () => changeMultiSettings() }] : []),
        { label: "Quit", primary: false, action: () => multiQuit() }
      ]
    );
  }

  function changeMultiSettings() {
    showPage("pageMultiSetup");
    const createBtn = document.querySelector("#multiJoinSeg button[data-val='create']");
    if (createBtn) createBtn.click();
    document.getElementById("multiStartBtn").textContent = "Apply to Next Round";
    document.getElementById("multiStartBtn").dataset.updateRoom = "true";
  }

  function applySettingsNextRound() {
    state.digits = parseInt(document.getElementById("multiDigits").value);
    state.mode = segValue("multiModeSeg") || state.mode;
    state.allowRepeats = segValue("multiRepeatSeg") === "repeat";
    state.clueMode = segValue("multiClueSeg") || state.clueMode;
    state.trackerEnabled = segValue("multiTrackerSeg") !== "off";
    document.getElementById("multiStartBtn").textContent = "Create / Join";
    document.getElementById("multiStartBtn").dataset.updateRoom = "";
    nextRound();
  }

  function handleDraw() {
    if (state.gameOver) return;
    state.gameOver = true;
    stopTimer();
    showRoundEnd("Time's Up!", "Neither player cracked the code in time.",
      [
        { label: "Vote Overtime (+2 min)", primary: true, action: () => startOvertime() },
        { label: "Draw — Quit", primary: false, action: () => multiQuit() }
      ]
    );
  }

  function handleAbandoned(playerId) {
    state.gameOver = true;
    stopTimer();
    const msg = playerId === state.playerId ? "You left the room." : "The other player left or refreshed, so the match ended.";
    showRoundEnd("Room Closed", msg, [
      { label: "Back to Home", primary: true, action: () => showPage("pageHome") }
    ]);
  }

  function startOvertime() {
    fbRef(`rooms/${state.roomCode}/overtimeVotes/${state.playerId}`).set(true);
    document.getElementById("roundEndMsg").textContent = "Overtime vote sent. Waiting for the other player...";
  }

  function startRealtimeTimer(existingEnd) {
    if (state.timerStarted && !existingEnd) return;
    state.timerStarted = true;
    stopTimer();
    const end = existingEnd || Date.now() + state.timerSecs * 1000;
    if (!existingEnd) fbRef(`rooms/${state.roomCode}`).child("timerEnd").set(end);
    const badge = document.getElementById("multiTimerBadge");
    badge.style.display = "inline-flex";
    timerInterval = setInterval(() => {
      const rem = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      badge.textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (rem === 0) {
        stopTimer();
        if (!state.gameOver) {
          fbRef(`rooms/${state.roomCode}`).child("phase").set("draw");
        }
      }
    }, 500);
  }

  function nextRound() {
    state.round++;
    state.roundStarting = true;
    clearListeners();
    stopTimer();
    state.gameStarted = false;
    state.timerStarted = false;
    const roomRef = fbRef(`rooms/${state.roomCode}`);
    roomRef.update({
      round: state.round,
      phase: "lock",
      digits: state.digits,
      mode: state.mode,
      currentTurn: "p1",
      timerEnd: null,
      overtimeVotes: {},
      allowRepeats: state.allowRepeats,
      clueMode: state.clueMode,
      trackerEnabled: state.trackerEnabled,
      guesses: { p1: {}, p2: {} },
      "p1/locked": false,
      "p1/secret": "",
      "p2/locked": false,
      "p2/secret": ""
    });
    // slight delay for both clients to see the update
    setTimeout(() => startGamePhase({
      digits: state.digits, mode: state.mode, round: state.round,
      allowRepeats: state.allowRepeats,
      clueMode: state.clueMode,
      trackerEnabled: state.trackerEnabled,
      currentTurn: "p1",
      p1: { name: state.playerId === "p1" ? state.playerName : state.opponentName, score: state.p1Score },
      p2: { name: state.playerId === "p2" ? state.playerName : state.opponentName, score: state.p2Score }
    }), 300);
  }

  function renderMultiUI() {
    document.getElementById("multiRoundBadge").textContent = `Round ${state.round}`;
    document.getElementById("multiScoreBadge").textContent = `${state.p1Score} – ${state.p2Score}`;
    document.getElementById("multiYourGuessCount").textContent = state.myGuesses.length;
    document.getElementById("multiOppGuessCount").textContent = state.oppGuesses.length;
    updateTurnUI();

    const myList = document.getElementById("multiYourHistory");
    myList.innerHTML = "";
    state.myGuesses.forEach((g, i) => {
      if (state.oppSecret) {
        myList.appendChild(renderHistoryItem(state.oppSecret, g.guess, `#${i+1} — ${g.guess}`, state.clueMode));
      }
    });

    const oppList = document.getElementById("multiOppHistory");
    oppList.innerHTML = "";
    state.oppGuesses.forEach((g, i) => {
      oppList.appendChild(renderHistoryItemPublic(g.guess, g.greens, g.yellows, `#${i+1} — ${g.guess}`, state.clueMode));
    });
  }

  function quit() {
    if (state.roomCode && !state.gameOver) {
      const ok = window.confirm("Leaving will end the match for both players. Leave now?");
      if (!ok) return;
    }
    if (state.roomCode && db) {
      fbRef(`rooms/${state.roomCode}`).child("phase").set(`abandoned:${state.playerId || "unknown"}`);
    }
    clearListeners();
    stopTimer();
    showPage("pageHome");
  }

  return { createRoom, joinRoom, lockSecret, submitGuess, quit, applySettingsNextRound };
})();

window.multiQuit = function() { MultiGame.quit(); };
window.leaveLobby = function() { showPage("pageHome"); };

document.getElementById("lobbyCopyBtn").addEventListener("click", () => {
  const code = document.getElementById("lobbyRoomCode").textContent;
  navigator.clipboard.writeText(code).then(() => {
    document.getElementById("lobbyCopyBtn").textContent = "Copied!";
    setTimeout(() => document.getElementById("lobbyCopyBtn").textContent = "Copy", 2000);
  });
});

document.getElementById("multiStartBtn").addEventListener("click", e => {
  e.preventDefault();
  if (e.currentTarget.dataset.updateRoom === "true") {
    MultiGame.applySettingsNextRound();
    return;
  }
  const joinType = segValue("multiJoinSeg") || "create";
  const digits = document.getElementById("multiDigits").value;
  const mode = segValue("multiModeSeg") || "turns";
  const allowRepeats = segValue("multiRepeatSeg") === "repeat";
  const clueMode = segValue("multiClueSeg") || "position";
  const trackerEnabled = segValue("multiTrackerSeg") !== "off";
  withDatabase("Multiplayer", () => {
    if (joinType === "create") {
      MultiGame.createRoom("Player 1", digits, mode, allowRepeats, clueMode, trackerEnabled);
    } else {
      const code = document.getElementById("multiJoinCode").value.trim();
      if (!code) { alert("Enter a room code to join."); return; }
      MultiGame.joinRoom("Player 2", code);
    }
  });
});

document.getElementById("multiLockBtn").addEventListener("click", e => {
  e.preventDefault();
  MultiGame.lockSecret();
});
document.getElementById("multiGuessBtn").addEventListener("click", e => {
  e.preventDefault();
  MultiGame.submitGuess(document.getElementById("multiGuessInput").value);
});
document.getElementById("multiGuessInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    MultiGame.submitGuess(document.getElementById("multiGuessInput").value);
  }
});

/* ══════════════════════════════════════════════════════════
   GROUP GAME STATE
══════════════════════════════════════════════════════════ */
const GroupGame = (() => {
  let state = {};
  let listeners = [];
  let timerInterval = null;

  function clearListeners() { listeners.forEach(off => off()); listeners = []; }
  function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

  function reset() {
    clearListeners();
    stopTimer();
    state = {
      roomCode: null,
      playerId: null,
      playerName: "",
      players: {},
      groupType: "race",
      digits: 4,
      allowRepeats: false,
      clueMode: "position",
      playerCount: 4,
      mode: "turns",
      visibility: "easy",
      round: 1,
      secret: null,
      mySecret: null,
      myLocked: false,
      scores: {},
      guesses: {},
      cracked: {},
      lockedTargets: {},
      battleSecrets: {},
      overtimeQuitters: {},
      overtimePlayers: null,
      currentTurn: null,
      timerSecs: 180,
      gameOver: false,
      hostId: null,
      isHost: false,
      gameStarted: false,
      timerStarted: false
    };
  }

  function createRoom(name, digits, playerCount, mode, visibility, allowRepeats, clueMode, groupType) {
    reset();
    if (!db) { alert("Firebase not configured. Group Race requires a live database."); return; }
    state.playerName = name || "Player";
    state.digits = parseInt(digits);
    state.allowRepeats = !!allowRepeats;
    state.clueMode = clueMode || "position";
    state.playerCount = parseInt(playerCount);
    state.groupType = groupType || "race";
    state.mode = mode;
    state.visibility = state.groupType === "battle" ? "hard" : visibility;
    state.roomCode = randomRoomCode();
    state.playerId = "p1";
    state.hostId = "p1";
    state.isHost = true;
    state.secret = randomCode(state.digits, state.allowRepeats);

    const myEntry = { name: state.playerName, ready: true, locked: false, secret: "", connected: true, uid: authUid || "" };
    const roomData = {
      digits: state.digits, allowRepeats: state.allowRepeats, clueMode: state.clueMode, playerCount: state.playerCount, mode: state.mode, groupType: state.groupType,
      hostId: "p1",
      visibility: state.visibility, round: 1, phase: "lobby",
      secret: state.secret, currentTurn: "p1",
      players: { p1: myEntry },
      battleSecrets: {},
      guesses: {},
      cracked: {},
      lockedTargets: {},
      overtimeQuitters: {},
      overtimePlayers: null,
      overtimeVotes: {},
      scores: { p1: 0 }
    };
    fbRef(`groups/${state.roomCode}`).set(roomData).then(() => {
      fbRef(`groups/${state.roomCode}/players/p1/connected`).onDisconnect().set(false);
    }).catch(err => {
      alert(firebaseErrorMessage("Create group room", err));
    });
    state.players = { p1: myEntry };
    state.scores = { p1: 0 };

    showLobby();
    listenForPlayers();
  }

  function joinRoom(name, code) {
    reset();
    if (!db) { alert("Firebase not configured. Group Race requires a live database."); return; }
    state.playerName = name || "Player";
    state.roomCode = code.toUpperCase();
    state.hostId = null;
    state.isHost = false;

    fbRef(`groups/${state.roomCode}`).once("value", snap => {
      const data = snap.val();
      if (!data) { alert("Room not found. Check the code."); return; }
      state.digits = data.digits;
      state.allowRepeats = !!data.allowRepeats;
      state.clueMode = data.clueMode || "position";
      state.playerCount = data.playerCount;
      state.groupType = data.groupType || "race";
      state.mode = data.mode;
      state.visibility = state.groupType === "battle" ? "hard" : data.visibility;
      state.secret = data.secret;

      // Assign next available player id
      const existing = Object.keys(data.players || {});
      const nums = existing.map(k => parseInt(k.slice(1)));
      const next = (Math.max(0, ...nums) + 1);
      state.playerId = `p${next}`;

      fbRef(`groups/${state.roomCode}/players/${state.playerId}`).set({ name: state.playerName, ready: true, locked: false, secret: "", connected: true, uid: authUid || "" }).then(() => {
        fbRef(`groups/${state.roomCode}/players/${state.playerId}/connected`).onDisconnect().set(false);
        return fbRef(`groups/${state.roomCode}/scores/${state.playerId}`).set(0);
      }).catch(err => {
        alert(firebaseErrorMessage("Join group room", err));
      });

      showLobby();
      listenForPlayers();
    });
  }

  function showLobby() {
    showPage("pageLobby");
    document.getElementById("lobbyEyebrow").textContent = "Group Race · Waiting for players";
    document.getElementById("lobbyTitle").textContent = "Room Code";
    document.getElementById("lobbyRoomCode").textContent = state.roomCode;
    document.getElementById("lobbyStatus").textContent = "Waiting for all players to join…";
    document.getElementById("lobbySettings").style.display = "block";
    document.getElementById("lobbySettings").textContent = settingsSummary(state);
  }

  function listenForPlayers() {
    const roomRef = fbRef(`groups/${state.roomCode}`);
    const handlePlayersValue = snap => {
      const data = snap.val();
      if (!data) return;
      state.players = data.players || {};
      state.scores = data.scores || {};
      syncGroupHost(data, roomRef);

      const connectedPlayers = Object.entries(state.players).filter(([, p]) => p.connected !== false);
      const count = connectedPlayers.length;
      const list = document.getElementById("lobbyPlayerList");
      list.innerHTML = connectedPlayers.map(([id, p]) =>
        `<div class="connection-status" style="margin:0">${p.name}${id === state.playerId ? " (You)" : ""}${id === state.hostId ? " · Host" : ""}</div>`
      ).join("");

      document.getElementById("lobbyStatus").textContent = `${count} / ${state.playerCount} players joined. ${count < state.playerCount ? "Waiting…" : "Everyone's here!"}`;
      document.getElementById("lobbySettings").style.display = "block";
      document.getElementById("lobbySettings").textContent = settingsSummary(data);

      if (count >= state.playerCount && data.phase === "lobby") {
        if (state.isHost) {
          roomRef.child("phase").set((data.groupType || "race") === "battle" ? "lock" : "playing");
        }
      }
      if (data.phase === "lock") {
        clearListeners();
        startGroupGame(data);
      }
      if (data.phase === "playing") {
        clearListeners();
        startGroupGame(data);
      }
    };
    roomRef.on("value", handlePlayersValue);
    listeners.push(() => roomRef.off("value", handlePlayersValue));
  }

  function syncGroupHost(data, roomRef) {
    const players = data.players || {};
    const connectedIds = Object.keys(players).filter(pid => players[pid] && players[pid].connected !== false);
    const currentHost = data.hostId;
    const nextHost = connectedIds.includes(currentHost) ? currentHost : connectedIds.sort()[0];
    state.hostId = nextHost || currentHost || null;
    state.isHost = !!state.hostId && state.hostId === state.playerId;
    if (nextHost && nextHost !== currentHost) {
      roomRef.child("hostId").set(nextHost);
    }
  }

  function leaveGroupSilently() {
    if (!db || !state.roomCode || !state.playerId) return;
    const roomRef = fbRef(`groups/${state.roomCode}`);
    roomRef.once("value", snap => {
      const data = snap.val() || {};
      const players = data.players || {};
      const remaining = Object.keys(players).filter(pid => pid !== state.playerId && players[pid] && players[pid].connected !== false).sort();
      const updates = { [`players/${state.playerId}/connected`]: false };
      if (remaining.length) {
        updates.hostId = remaining.includes(data.hostId) ? data.hostId : remaining[0];
        if (data.currentTurn === state.playerId) updates.currentTurn = remaining[0];
      }
      roomRef.update(updates);
    });
  }

  function lockSecret() {
    if (state.groupType !== "battle" || state.myLocked) return;
    if (state.overtimePlayers && !state.overtimePlayers.includes(state.playerId)) return;
    const val = document.getElementById("groupSecretInput").value.trim();
    if (!isValidCode(val, state.digits, state.allowRepeats)) {
      showMessage("groupMessage", `Secret must be ${state.digits} digits${state.allowRepeats ? "" : " with no repeats"}.`, "var(--red)");
      return;
    }
    state.mySecret = val;
    state.myLocked = true;
    hideMessage("groupMessage");
    document.getElementById("groupSecretInput").disabled = true;
    document.getElementById("groupLockBtn").disabled = true;
    document.getElementById("groupSecretPanel").style.display = "none";
    document.getElementById("groupSecretLocked").style.display = "block";
    document.getElementById("groupSecretLocked").textContent = `Your secret: ${val}`;
    fbRef(`groups/${state.roomCode}/players/${state.playerId}`).update({ locked: true, secret: val });
    fbRef(`groups/${state.roomCode}/battleSecrets/${state.playerId}`).set(val);
  }

  function startGroupGame(data) {
    state.players = data.players || {};
    state.battleSecrets = data.battleSecrets || {};
    state.scores = data.scores || {};
    state.cracked = data.cracked || {};
    state.lockedTargets = data.lockedTargets || {};
    state.overtimeQuitters = data.overtimeQuitters || {};
    state.overtimePlayers = data.overtimePlayers || null;
    state.hostId = data.hostId || state.hostId || "p1";
    state.isHost = state.hostId === state.playerId;
    state.guesses = {};
    state.currentTurn = data.currentTurn || "p1";
    state.gameOver = false;
    state.round = data.round || 1;
    state.mode = data.mode || state.mode;
    state.groupType = data.groupType || state.groupType || "race";
    state.visibility = state.groupType === "battle" ? "hard" : (data.visibility || state.visibility);
    state.digits = data.digits || state.digits;
    state.allowRepeats = !!data.allowRepeats;
    state.clueMode = data.clueMode || state.clueMode || "position";
    state.phase = data.phase || state.phase || "playing";
    state.secret = data.secret || state.secret;
    state.myLocked = !!(state.players[state.playerId] && state.players[state.playerId].locked);
    state.mySecret = (state.players[state.playerId] && state.players[state.playerId].secret) || null;
    state.gameStarted = true;
    state.timerStarted = false;

    setupGroupGameUI();
    listenForGuesses();
    listenForTurn();
    listenForGroupRoom();
    if (state.groupType === "race" && state.mode === "realtime") startGroupTimer(null, data.timerEnd);
  }

  function setupGroupGameUI() {
    document.getElementById("groupGameTitle").textContent = state.groupType === "battle" ? "Code Battle" : "Group Race";
    document.getElementById("groupRulesBar").textContent = state.groupType === "battle"
      ? `${settingsSummary(state)} · first to ${battleWinTarget()} points`
      : settingsSummary(state);
    document.getElementById("groupModeBadge").textContent = state.mode === "turns" ? "Turn-Based" : "Real-Time";
    document.getElementById("groupRoundBadge").textContent = `Round ${state.round}`;
    updateGroupHostBadge();
    document.getElementById("groupTimerBadge").style.display = state.mode === "realtime" ? "inline-flex" : "none";
    document.getElementById("groupGuessInput").maxLength = state.digits;
    document.getElementById("groupGuessInput").placeholder = `e.g. ${randomCode(state.digits, state.allowRepeats)}`;
    document.getElementById("groupGuessInput").value = "";
    prepareGroupSecretInput();
    updateBattleTargetWrap();
    buildTargetSelect();
    renderGroupScoreboard();
    updateCurrentTargetLabel();
    buildGroupHistories();
    updateGroupTurnUI();
    showPage("pageGroupGame");
  }

  function updateGroupHostBadge() {
    const hostName = state.hostId && state.players[state.hostId] ? state.players[state.hostId].name : state.hostId;
    document.getElementById("groupRoomBadge").textContent = `Room: ${state.roomCode}${hostName ? ` · Host: ${hostName}` : ""}`;
  }

  function prepareGroupSecretInput() {
    const panel = document.getElementById("groupSecretPanel");
    const locked = document.getElementById("groupSecretLocked");
    const help = document.getElementById("groupSecretHelp");
    const input = document.getElementById("groupSecretInput");
    const btn = document.getElementById("groupLockBtn");
    const lockKey = `${state.roomCode || "room"}:${state.round || 1}:${state.phase || "lock"}:${state.playerId || "player"}`;
    const canEnterSecret = state.groupType === "battle" && !state.myLocked && (!state.overtimePlayers || state.overtimePlayers.includes(state.playerId));

    panel.style.display = canEnterSecret ? "grid" : "none";
    locked.style.display = state.groupType === "battle" && !canEnterSecret ? "block" : "none";
    locked.textContent = state.groupType === "battle" && state.myLocked
      ? `Your secret: ${state.mySecret || "locked"}`
      : "Your secret is locked. Waiting for the rest of the room...";
    help.textContent = `Choose your secret code. ${digitRuleText(state.allowRepeats)}`;
    input.maxLength = state.digits;
    if (input.dataset.lockKey !== lockKey) {
      input.dataset.lockKey = lockKey;
      input.value = "";
      input.placeholder = `e.g. ${randomCode(state.digits, state.allowRepeats)}`;
    }
    input.disabled = !canEnterSecret;
    btn.disabled = !canEnterSecret;
  }

  function buildTargetSelect() {
    const sel = document.getElementById("groupTargetSelect");
    if (!sel) return;
    sel.innerHTML = "";
    const autoTarget = getAutomaticBattleTarget();
    if (autoTarget) {
      const p = state.players[autoTarget];
      const opt = document.createElement("option");
      opt.value = autoTarget;
      opt.textContent = `${(p && p.name) || autoTarget} (overtime)`;
      sel.appendChild(opt);
      sel.value = autoTarget;
      sel.disabled = true;
      updateBattleTargetWrap();
      updateCurrentTargetLabel();
      return;
    }
    const lockedTarget = state.lockedTargets[state.playerId];
    const overtimeTargetPool = activeOvertimePlayers();
    const targetIds = lockedTarget
      ? [lockedTarget]
      : activeGroupPlayerIds().filter(pid => {
        if (pid === state.playerId || state.cracked[`${state.playerId}_${pid}`]) return false;
        return !overtimeTargetPool || overtimeTargetPool.includes(pid);
      });
    targetIds.forEach(pid => {
      const p = state.players[pid];
      if (!p) return;
      const opt = document.createElement("option");
      opt.value = pid;
      opt.textContent = `${p.name || pid}${lockedTarget === pid ? " (locked)" : ""}`;
      sel.appendChild(opt);
    });
    sel.disabled = !!lockedTarget;
    updateBattleTargetWrap();
    updateCurrentTargetLabel();
  }

  function updateCurrentTargetLabel() {
    const el = document.getElementById("groupCurrentTarget");
    if (!el) return;
    if (state.groupType !== "battle") {
      el.style.display = "none";
      return;
    }
    const autoTarget = getAutomaticBattleTarget();
    if (autoTarget) {
      const name = (state.players[autoTarget] || {}).name || autoTarget;
      el.textContent = `Overtime target: ${name}. This tiebreaker is locked to the tied players.`;
      el.style.display = "block";
      el.style.borderColor = "var(--cyan)";
      return;
    }
    const lockedTarget = state.lockedTargets[state.playerId];
    if (lockedTarget) {
      const name = (state.players[lockedTarget] || {}).name || lockedTarget;
      el.textContent = `Current target: ${name}. Crack this code before choosing someone else.`;
      el.style.display = "block";
      el.style.borderColor = "var(--cyan)";
      return;
    }
    el.textContent = "No target locked yet. Your first guess locks your target.";
    el.style.display = "block";
    el.style.borderColor = "var(--line)";
  }

  function updateBattleTargetWrap() {
    const wrap = document.getElementById("groupTargetWrap");
    if (!wrap) return;
    wrap.style.display = state.groupType === "battle" && !getAutomaticBattleTarget() ? "block" : "none";
  }

  function renderGroupScoreboard() {
    const el = document.getElementById("groupScoreboard");
    if (!el) return;
    if (!activeGroupPlayerIds().length) {
      el.style.display = "none";
      return;
    }
    el.style.display = "flex";
    const target = state.groupType === "battle" ? ` / ${battleWinTarget()}` : "";
    el.innerHTML = Object.entries(state.players).filter(([, p]) => p && p.connected !== false).map(([pid, p]) => {
      const classes = ["score-pill"];
      if (pid === state.playerId) classes.push("me");
      if (state.overtimePlayers && state.overtimePlayers.includes(pid)) classes.push("active");
      const name = `${p.name || pid}${pid === state.playerId ? " (You)" : ""}`;
      return `<div class="${classes.join(" ")}">${name}<span>${state.scores[pid] || 0}${target}</span></div>`;
    }).join("");
  }

  function buildGroupHistories() {
    const wrap = document.getElementById("groupHistoryWrap");
    wrap.innerHTML = "";
    Object.entries(state.players).filter(([, p]) => p && p.connected !== false).forEach(([pid, p]) => {
      const isMe = pid === state.playerId;
      if (state.visibility === "hard" && !isMe) return;
      const div = document.createElement("div");
      div.innerHTML = `<div class="section-title"><h3>${p.name}${isMe ? " (You)" : ""}</h3><span id="groupCount_${pid}">0</span></div>
        <ul class="history-list" id="groupHistory_${pid}"></ul>`;
      wrap.appendChild(div);
    });
  }

  function listenForGuesses() {
    const roomRef = fbRef(`groups/${state.roomCode}/guesses`);
    const off = roomRef.on("value", snap => {
      const data = snap.val() || {};
      state.guesses = data;
      renderGroupGuesses();
    });
    listeners.push(() => roomRef.off("value", off));
  }

  function listenForGroupRoom() {
    const roomRef = fbRef(`groups/${state.roomCode}`);
    const off = roomRef.on("value", snap => {
      const data = snap.val();
      if (!data) return;
      state.players = data.players || state.players;
      syncGroupHost(data, roomRef);
      updateGroupHostBadge();
      state.battleSecrets = data.battleSecrets || state.battleSecrets || {};
      state.scores = data.scores || state.scores;
      state.cracked = data.cracked || {};
      state.lockedTargets = data.lockedTargets || {};
      state.overtimeQuitters = data.overtimeQuitters || {};
      state.overtimePlayers = data.overtimePlayers || null;
      state.phase = data.phase || state.phase || "playing";
      renderGroupScoreboard();
      updateCurrentTargetLabel();
      state.myLocked = !!(state.players[state.playerId] && state.players[state.playerId].locked);
      state.mySecret = (state.players[state.playerId] && state.players[state.playerId].secret) || state.mySecret;
      if (state.groupType === "battle" && state.overtimePlayers && state.players[state.playerId] && !state.players[state.playerId].locked) {
        state.myLocked = false;
        state.mySecret = null;
      }
      if (state.groupType === "battle" && data.phase === "lock") {
        const activePlayers = Object.values(state.players).filter(p => p && p.connected !== false);
        const allLocked = activePlayers.length >= state.playerCount && activePlayers.every(p => p.locked);
        document.getElementById("groupStatusBar").textContent = allLocked ? "All secrets locked. Starting..." : "Code Battle: waiting for everyone to lock a secret.";
        prepareGroupSecretInput();
        document.getElementById("groupGameArea").style.display = "none";
        if (allLocked && state.isHost) {
          roomRef.update({ phase: "playing", timerEnd: state.mode === "realtime" ? Date.now() + 180000 : null });
        }
      }
      if (state.groupType === "battle" && data.phase === "overtimeLock") {
        const tiedPlayers = data.overtimePlayers || state.overtimePlayers || [];
        const tiedLocked = tiedPlayers.every(pid => state.players[pid] && state.players[pid].locked);
        const isTied = tiedPlayers.includes(state.playerId);
        document.getElementById("groupStatusBar").textContent = isTied
          ? "Overtime reset: choose a new secret. First tied player to crack the other wins."
          : "The tied players are choosing new overtime codes. You are spectating.";
        prepareGroupSecretInput();
        document.getElementById("groupGameArea").style.display = "none";
        if (tiedLocked && state.isHost) {
          roomRef.update({ phase: "playing", timerEnd: Date.now() + 120000 });
        }
      }
      if (state.groupType === "battle" && data.phase === "playing") {
        const isOvertimeWatcher = isBattleOvertimeWatcher();
        const activeNames = state.overtimePlayers ? state.overtimePlayers.map(pid => (state.players[pid] || {}).name || pid).join(", ") : "";
        document.getElementById("groupStatusBar").textContent = isOvertimeWatcher
          ? `Overtime is between ${activeNames}. You are watching this tiebreaker.`
          : state.overtimePlayers
            ? `Overtime: only ${activeNames} can guess. First tied player to score wins.`
            : `Pick a target, make a guess, and score 1 point for each code you crack. First to ${battleWinTarget()} wins.`;
        document.getElementById("groupSecretPanel").style.display = "none";
        document.getElementById("groupSecretLocked").style.display = "block";
        document.getElementById("groupSecretLocked").textContent = `Your secret: ${state.mySecret || "locked"}`;
        document.getElementById("groupGameArea").style.display = "grid";
        renderGroupGuesses();
        buildTargetSelect();
        renderGroupScoreboard();
        updateCurrentTargetLabel();
        updateGroupTurnUI();
        if (state.mode === "realtime") startGroupTimer(null, data.timerEnd);
      }
    });
    listeners.push(() => roomRef.off("value", off));
  }

  function listenForTurn() {
    const roomRef = fbRef(`groups/${state.roomCode}`);
    const off = roomRef.child("currentTurn").on("value", snap => {
      state.currentTurn = snap.val();
      updateCurrentTargetLabel();
      updateGroupTurnUI();
    });
    listeners.push(() => roomRef.child("currentTurn").off("value", off));

    const off2 = roomRef.child("phase").on("value", snap => {
      const phase = snap.val();
      if (phase && phase.startsWith("win:")) {
        const wid = phase.split(":")[1];
        handleGroupWin(wid);
      } else if (phase && phase.startsWith("abandoned:")) {
        handleGroupAbandoned(phase.split(":")[1]);
      } else if (phase === "draw") {
        fbRef(`groups/${state.roomCode}`).once("value", snap => {
          const data = snap.val() || {};
          state.players = data.players || state.players;
          state.battleSecrets = data.battleSecrets || state.battleSecrets || {};
          state.scores = data.scores || state.scores;
          state.cracked = data.cracked || state.cracked || {};
          state.lockedTargets = data.lockedTargets || state.lockedTargets || {};
          state.overtimeQuitters = data.overtimeQuitters || state.overtimeQuitters || {};
          state.overtimePlayers = data.overtimePlayers || state.overtimePlayers || null;
          handleGroupDraw();
        });
      } else if (phase === "overtimeLock") {
        fbRef(`groups/${state.roomCode}`).once("value", snap => {
          clearListeners();
          startGroupGame(snap.val());
        });
      } else if (phase === "playing" && state.gameOver) {
        clearListeners();
        fbRef(`groups/${state.roomCode}`).once("value", snap => startGroupGame(snap.val()));
      }
    });
    listeners.push(() => roomRef.child("phase").off("value", off2));

    const handleRoomValue = snap => {
      const data = snap.val();
      if (!data) return;
      if (state.isHost && data.overtimePlayers && data.overtimeQuitters && ["draw", "playing", "overtimeLock"].includes(data.phase)) {
        resolveOvertimeQuitters(data, roomRef);
      }
      if (data.phase === "draw" && data.overtimeVotes) {
        const players = activeOvertimePlayers(data) || Object.keys(data.players || {});
        const allVoted = players.length > 0 && players.every(pid => data.overtimeVotes[pid]);
        if (allVoted && state.isHost) {
          if ((data.groupType || state.groupType) === "battle" && tiedPlayersCrackedEachOther(players, data.cracked || {})) {
            const updates = {
              phase: "overtimeLock",
              timerEnd: null,
              overtimeVotes: {}
            };
            players.forEach(pid => {
              updates[`players/${pid}/locked`] = false;
              updates[`players/${pid}/secret`] = "";
              updates[`battleSecrets/${pid}`] = "";
              updates[`lockedTargets/${pid}`] = null;
            });
            players.forEach(a => {
              players.forEach(b => {
                if (a !== b) updates[`cracked/${a}_${b}`] = null;
              });
            });
            roomRef.update(updates);
          } else {
            const updates = {
              phase: "playing",
              timerEnd: Date.now() + 120000,
              overtimeVotes: {}
            };
            players.forEach(pid => {
              updates[`lockedTargets/${pid}`] = null;
            });
            roomRef.update(updates);
          }
        }
      } else if (data.phase === "playing" && state.gameOver) {
        resumeGroupOvertime(data);
      }
    };
    roomRef.on("value", handleRoomValue);
    listeners.push(() => roomRef.off("value", handleRoomValue));
  }

  function isMyGroupTurn() {
    if (isBattleOvertimeWatcher()) return false;
    if (state.mode === "realtime") return true;
    return state.currentTurn === state.playerId;
  }

  function isBattleOvertimeWatcher() {
    if (state.groupType !== "battle" || !Array.isArray(state.overtimePlayers)) return false;
    if (!state.overtimePlayers.includes(state.playerId)) return true;
    return !!(state.overtimeQuitters && state.overtimeQuitters[state.playerId]);
  }

  function activeOvertimePlayers(data) {
    const overtimePlayers = data ? data.overtimePlayers : state.overtimePlayers;
    if (!Array.isArray(overtimePlayers)) return null;
    const quitters = (data ? data.overtimeQuitters : state.overtimeQuitters) || {};
    return overtimePlayers.filter(pid => !quitters[pid]);
  }

  function getAutomaticBattleTarget() {
    if (state.groupType !== "battle") return null;
    const active = activeOvertimePlayers();
    if (!active || active.length !== 2 || !active.includes(state.playerId)) return null;
    return active.find(pid => pid !== state.playerId) || null;
  }

  function resolveOvertimeQuitters(data, roomRef) {
    const active = activeOvertimePlayers(data);
    if (!active) return;
    if (active.length >= 2) {
      if (data.mode === "turns" && !active.includes(data.currentTurn)) {
        roomRef.child("currentTurn").set(active[0]);
      }
      return;
    }
    if (active.length === 1) {
      roomRef.child("phase").set(`win:${active[0]}`);
    } else {
      roomRef.child("phase").set("draw");
    }
  }

  function tiedPlayersCrackedEachOther(players, cracked) {
    if (!players || players.length !== 2) return false;
    const [a, b] = players;
    return !!(cracked[`${a}_${b}`] && cracked[`${b}_${a}`]);
  }

  function battleWinTarget() {
    return Math.max(1, activeGroupPlayerIds().length - 1);
  }

  function activeGroupPlayerIds(players = state.players) {
    return Object.keys(players || {}).filter(pid => players[pid] && players[pid].connected !== false).sort();
  }

  function highestScoreWinner() {
    const entries = Object.entries(state.scores || {});
    if (!entries.length) return null;
    const sorted = entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const topScore = sorted[0][1] || 0;
    const tied = sorted.filter(([, score]) => (score || 0) === topScore);
    return tied.length === 1 ? sorted[0][0] : null;
  }

  function tiedTopScorers() {
    const entries = Object.entries(state.scores || {});
    if (!entries.length) return [];
    const topScore = Math.max(...entries.map(([, score]) => score || 0));
    return entries.filter(([, score]) => (score || 0) === topScore).map(([pid]) => pid);
  }

  function updateGroupTurnUI() {
    const myTurn = isMyGroupTurn();
    const waitingForBattleLock = state.groupType === "battle" && !state.myLocked;
    document.getElementById("groupGuessInput").disabled = !myTurn || state.gameOver || waitingForBattleLock;
    document.getElementById("groupGuessBtn").disabled = !myTurn || state.gameOver || waitingForBattleLock;
    const label = document.getElementById("groupTurnLabel");
    if (state.mode === "turns") {
      const cp = state.players[state.currentTurn];
      label.textContent = myTurn ? (state.groupType === "battle" ? "Your turn - choose a target." : "Your turn!") : `Waiting for ${cp ? cp.name : "next player"}…`;
      label.style.borderColor = myTurn ? "var(--cyan)" : "var(--line)";
    } else {
      label.textContent = isBattleOvertimeWatcher()
        ? "Overtime watcher - tied players are deciding the round."
        : state.groupType === "battle" && state.overtimePlayers
          ? "Overtime - first tied player to score wins."
          : state.groupType === "battle" ? "Real-Time - choose any target." : "Real-Time — guess whenever!";
    }
  }

  function submitGuess(raw) {
    if (!isMyGroupTurn() || state.gameOver) return;
    if (isBattleOvertimeWatcher()) {
      showMessage("groupMessage", "You are watching overtime. Only tied players can guess.", "var(--yellow)");
      return;
    }
    if (state.groupType === "battle" && !state.myLocked) {
      showMessage("groupMessage", "Lock your secret before guessing.", "var(--yellow)");
      return;
    }
    const guess = raw.trim();
    if (!isValidCode(guess, state.digits, state.allowRepeats)) {
      showMessage("groupMessage", `Guess must be ${state.digits} digits${state.allowRepeats ? "" : " with no repeats"}.`, "var(--red)");
      return;
    }
    hideMessage("groupMessage");

    const targetId = state.groupType === "battle" ? (getAutomaticBattleTarget() || document.getElementById("groupTargetSelect").value) : null;
    if (state.groupType === "battle" && (!targetId || targetId === state.playerId)) {
      showMessage("groupMessage", "Choose someone else to target.", "var(--red)");
      return;
    }
    if (state.groupType === "battle" && state.cracked[`${state.playerId}_${targetId}`]) {
      showMessage("groupMessage", "You already cracked that player's code this round. Pick another target.", "var(--yellow)");
      return;
    }
    const lockedTarget = state.groupType === "battle" ? state.lockedTargets[state.playerId] : null;
    if (lockedTarget && lockedTarget !== targetId) {
      showMessage("groupMessage", `You are locked onto ${(state.players[lockedTarget] || {}).name || "that target"} until you crack their code.`, "var(--yellow)");
      buildTargetSelect();
      return;
    }
    const targetSecret = state.groupType === "battle" ? (state.battleSecrets[targetId] || (state.players[targetId] && state.players[targetId].secret)) : state.secret;
    if (!targetSecret) {
      showMessage("groupMessage", "Waiting for that player's secret to sync.", "var(--yellow)");
      return;
    }
    const targetName = state.groupType === "battle" ? ((state.players[targetId] || {}).name || targetId) : null;
    const { greens, yellows } = scoreGuess(targetSecret, guess, state.clueMode);
    const entry = { guess, greens, yellows, targetId, targetName, ts: Date.now() };
    const myGuesses = (state.guesses[state.playerId] && Object.values(state.guesses[state.playerId])) || [];
    const key = `g${myGuesses.length + 1}`;
    fbRef(`groups/${state.roomCode}/guesses/${state.playerId}/${key}`).set(entry);
    if (state.groupType === "battle" && !state.lockedTargets[state.playerId]) {
      state.lockedTargets[state.playerId] = targetId;
      fbRef(`groups/${state.roomCode}/lockedTargets/${state.playerId}`).set(targetId);
      buildTargetSelect();
      updateCurrentTargetLabel();
    }
    document.getElementById("groupGuessInput").value = "";

    if (guess === targetSecret) {
      const newScore = (state.scores[state.playerId] || 0) + 1;
      fbRef(`groups/${state.roomCode}/scores/${state.playerId}`).set(newScore);
      if (state.groupType === "battle") {
        fbRef(`groups/${state.roomCode}/cracked/${state.playerId}_${targetId}`).set(true);
        fbRef(`groups/${state.roomCode}/lockedTargets/${state.playerId}`).remove();
        delete state.lockedTargets[state.playerId];
        buildTargetSelect();
        updateCurrentTargetLabel();
        showMessage("groupMessage", `Correct. You cracked ${targetName}'s code and scored 1 point.`, "var(--green)");
        if (newScore >= battleWinTarget()) {
          fbRef(`groups/${state.roomCode}/phase`).set(`win:${state.playerId}`);
          return;
        }
        if (state.overtimePlayers && state.overtimePlayers.includes(state.playerId)) {
          fbRef(`groups/${state.roomCode}/phase`).set(`win:${state.playerId}`);
          return;
        }
      } else {
        fbRef(`groups/${state.roomCode}/phase`).set(`win:${state.playerId}`);
        return;
      }
    }

    // Advance turn
    if (state.mode === "turns") {
      const pids = activeOvertimePlayers() || activeGroupPlayerIds();
      const idx = pids.indexOf(state.playerId);
      const next = pids[(idx + 1) % pids.length];
      state.currentTurn = next;
      updateGroupTurnUI();
      fbRef(`groups/${state.roomCode}/currentTurn`).set(next);
    }
  }

  function renderGroupGuesses() {
    Object.entries(state.guesses).forEach(([pid, gdata]) => {
      const arr = Object.values(gdata || {}).sort((a, b) => a.ts - b.ts);
      const isMe = pid === state.playerId;
      if (state.visibility === "hard" && !isMe) return;
      const list = document.getElementById(`groupHistory_${pid}`);
      const countEl = document.getElementById(`groupCount_${pid}`);
      if (!list) return;
      list.innerHTML = "";
      if (countEl) countEl.textContent = arr.length;
      arr.forEach((g, i) => {
        const targetText = state.groupType === "battle" && g.targetId
          ? (g.targetId === state.playerId ? "targeted you" : `targeted ${g.targetName || ((state.players[g.targetId] || {}).name || g.targetId)}`)
          : null;
        const label = targetText ? `#${i+1} — ${g.guess} (${targetText})` : `#${i+1} — ${g.guess}`;
        if (isMe) {
          const secret = state.groupType === "battle" ? ((state.players[g.targetId] || {}).secret || "") : state.secret;
          list.appendChild(secret ? renderHistoryItem(secret, g.guess, label, state.clueMode) : renderHistoryItemPublic(g.guess, g.greens, g.yellows, label, state.clueMode));
        } else {
          list.appendChild(renderHistoryItemPublic(g.guess, g.greens, g.yellows, label, state.clueMode));
        }
      });
    });
  }

  function handleGroupWin(winnerId) {
    state.gameOver = true;
    stopTimer();
    const wName = (state.players[winnerId] || {}).name || winnerId;
    const iWon = winnerId === state.playerId;
    const scoreText = state.groupType === "battle"
      ? Object.entries(state.scores || {}).map(([pid, score]) => `${(state.players[pid] || {}).name || pid}: ${score || 0}`).join(" · ")
      : `The code was ${state.secret}.`;
    showRoundEnd(iWon ? "You won the round!" : `${wName} wins!`,
      scoreText,
      [
        { label: "Next Round", primary: true, action: () => nextGroupRound() },
        ...(state.isHost ? [{ label: "Change Settings", primary: false, action: () => changeGroupSettings() }] : []),
        { label: "Quit", primary: false, action: () => window.groupQuit() }
      ]
    );
  }

  function changeGroupSettings() {
    showPage("pageGroupSetup");
    const createBtn = document.querySelector("#groupJoinSeg button[data-val='create']");
    if (createBtn) createBtn.click();
    document.getElementById("groupSize").value = String(activeGroupPlayerIds().length || state.playerCount);
    document.getElementById("groupSize").disabled = true;
    document.getElementById("groupStartBtn").textContent = "Apply to Next Round";
    document.getElementById("groupStartBtn").dataset.updateRoom = "true";
  }

  function applySettingsNextRound() {
    state.playerCount = activeGroupPlayerIds().length || state.playerCount;
    state.digits = parseInt(document.getElementById("groupDigits").value);
    state.allowRepeats = segValue("groupRepeatSeg") === "repeat";
    state.mode = segValue("groupModeSeg") || state.mode;
    state.groupType = segValue("groupTypeSeg") || state.groupType;
    state.visibility = state.groupType === "battle" ? "hard" : (segValue("groupVisSeg") || state.visibility);
    state.clueMode = segValue("groupClueSeg") || state.clueMode;
    document.getElementById("groupStartBtn").textContent = "Create / Join";
    document.getElementById("groupStartBtn").dataset.updateRoom = "";
    document.getElementById("groupSize").disabled = false;
    nextGroupRound();
  }

  function handleGroupAbandoned(playerId) {
    state.gameOver = true;
    stopTimer();
    const who = playerId === state.playerId ? "You left the room." : `${(state.players[playerId] || {}).name || "A player"} left or refreshed, so the room ended.`;
    showRoundEnd("Room Closed", who, [
      { label: "Back to Home", primary: true, action: () => showPage("pageHome") }
    ]);
  }

  function handleGroupDraw() {
    if (state.gameOver) return;
    state.gameOver = true;
    stopTimer();
    if (isBattleOvertimeWatcher()) {
      const activeNames = state.overtimePlayers ? state.overtimePlayers.map(pid => (state.players[pid] || {}).name || pid).join(", ") : "the tied players";
      showRoundEnd("Overtime Tiebreaker", `${activeNames} are tied for first. You are spectating this overtime.`,
        [
          { label: "Spectate", primary: true, action: () => { updateGroupTurnUI(); } },
          { label: "Quit", primary: false, action: () => window.groupQuit() }
        ]
      );
      return;
    }
    const msg = state.groupType === "battle" && state.overtimePlayers
      ? "Top score is tied. Only the tied players can vote and play overtime."
      : "No one cracked the code in time.";
    showRoundEnd("Time's Up!", msg,
      [
        { label: "Vote Overtime (+2 min)", primary: true, action: () => startGroupOvertime() },
        { label: "Draw — Quit", primary: false, action: () => window.groupQuit() }
      ]
    );
  }

  function startGroupOvertime() {
    if (isBattleOvertimeWatcher()) {
      document.getElementById("roundEndMsg").textContent = "Only tied players vote for overtime. You are watching this tiebreaker.";
      return;
    }
    fbRef(`groups/${state.roomCode}/overtimeVotes/${state.playerId}`).set(true);
    const active = activeOvertimePlayers();
    document.getElementById("roundEndMsg").textContent = state.overtimePlayers
      ? `Overtime vote sent. Waiting for ${active && active.length > 2 ? "the other tied players" : "the other tied player"}...`
      : "Overtime vote sent. Waiting for the rest of the room...";
  }

  function resumeGroupOvertime(data) {
    state.gameOver = false;
    state.timerStarted = false;
    state.overtimePlayers = data.overtimePlayers || state.overtimePlayers;
    state.overtimeQuitters = data.overtimeQuitters || state.overtimeQuitters || {};
    document.getElementById("roundEndOverlay").style.display = "none";
    updateGroupTurnUI();
    startGroupTimer(null, data.timerEnd || Date.now() + 120000);
  }

  function startGroupTimer(secs, existingEnd) {
    if (state.timerStarted && !secs && !existingEnd) return;
    state.timerStarted = true;
    stopTimer();
    const dur = secs || state.timerSecs;
    const end = existingEnd || Date.now() + dur * 1000;
    if (!existingEnd) fbRef(`groups/${state.roomCode}/timerEnd`).set(end);
    const badge = document.getElementById("groupTimerBadge");
    badge.style.display = "inline-flex";
    timerInterval = setInterval(() => {
      const rem = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      badge.textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (rem === 0) {
        stopTimer();
        if (!state.gameOver && state.isHost) {
          if (state.groupType === "battle") {
            const winnerId = highestScoreWinner();
            if (winnerId) {
              fbRef(`groups/${state.roomCode}/phase`).set(`win:${winnerId}`);
            } else {
              fbRef(`groups/${state.roomCode}`).update({ phase: "draw", overtimePlayers: tiedTopScorers() });
            }
          } else {
            fbRef(`groups/${state.roomCode}/phase`).set("draw");
          }
        } else if (!state.gameOver && !state.isHost) {
          if (state.groupType === "battle") {
            const winnerId = highestScoreWinner();
            if (!winnerId) {
              state.overtimePlayers = tiedTopScorers();
              handleGroupDraw();
            }
          } else {
            handleGroupDraw();
          }
        }
      }
    }, 500);
  }

  function nextGroupRound() {
    state.round++;
    clearListeners();
    stopTimer();
    const newSecret = randomCode(state.digits, state.allowRepeats);
    state.secret = newSecret;
    state.mySecret = null;
    state.myLocked = false;
    state.gameOver = false;
    state.gameStarted = false;
    state.timerStarted = false;
    state.guesses = {};
    const pids = activeGroupPlayerIds();
    const playerUpdates = {};
    if (state.groupType === "battle") {
      pids.forEach(pid => {
        playerUpdates[`players/${pid}/locked`] = false;
        playerUpdates[`players/${pid}/secret`] = "";
        playerUpdates[`battleSecrets/${pid}`] = "";
      });
    }
    fbRef(`groups/${state.roomCode}`).update({
      round: state.round,
      phase: state.groupType === "battle" ? "lock" : "playing",
      digits: state.digits,
      playerCount: state.playerCount,
      mode: state.mode,
      visibility: state.visibility,
      secret: newSecret,
      groupType: state.groupType,
      allowRepeats: state.allowRepeats,
      clueMode: state.clueMode,
      currentTurn: pids[0],
      guesses: {},
      cracked: {},
      lockedTargets: {},
      overtimeVotes: {},
      overtimeQuitters: {},
      overtimePlayers: null,
      timerEnd: null,
      ...playerUpdates
    });
    setTimeout(() => startGroupGame({
      players: state.players, scores: state.scores, mode: state.mode,
      digits: state.digits, allowRepeats: state.allowRepeats, clueMode: state.clueMode, visibility: state.visibility, groupType: state.groupType,
      currentTurn: pids[0], round: state.round
    }), 300);
  }

  function quit() {
    const isBattleOvertime = state.groupType === "battle" && Array.isArray(state.overtimePlayers) && state.overtimePlayers.includes(state.playerId);
    const isBattleSpectator = state.groupType === "battle" && Array.isArray(state.overtimePlayers) && !state.overtimePlayers.includes(state.playerId);
    if (isBattleSpectator) {
      leaveGroupSilently();
      clearListeners();
      stopTimer();
      showPage("pageHome");
      return;
    }
    if (isBattleOvertime && db && state.roomCode) {
      const roomRef = fbRef(`groups/${state.roomCode}`);
      roomRef.once("value", snap => {
        const data = snap.val() || {};
        const quitters = { ...(data.overtimeQuitters || {}), [state.playerId]: true };
        const active = (data.overtimePlayers || []).filter(pid => !quitters[pid]);
        const updates = { [`overtimeQuitters/${state.playerId}`]: true };
        if (active.length === 1) updates.phase = `win:${active[0]}`;
        else if (active.length === 0) updates.phase = "draw";
        roomRef.update(updates);
      });
    } else if (db && state.roomCode) {
      const roomRef = fbRef(`groups/${state.roomCode}`);
      roomRef.once("value", snap => {
        const data = snap.val() || {};
        const players = data.players || {};
        const remaining = Object.keys(players).filter(pid => pid !== state.playerId && players[pid] && players[pid].connected !== false).sort();
        if (remaining.length < 2) {
          roomRef.child("phase").set(`abandoned:${state.playerId || "unknown"}`);
          return;
        }
        const updates = {
          [`players/${state.playerId}/connected`]: false,
          hostId: remaining.includes(data.hostId) ? data.hostId : remaining[0],
          playerCount: remaining.length
        };
        if (data.currentTurn === state.playerId) updates.currentTurn = remaining[0];
        roomRef.update(updates);
      });
    }
    showPage("pageHome");
  }

  return { createRoom, joinRoom, submitGuess, lockSecret, quit, applySettingsNextRound };
})();

window.groupQuit = function() { GroupGame.quit(); };

document.getElementById("groupStartBtn").addEventListener("click", e => {
  e.preventDefault();
  if (e.currentTarget.dataset.updateRoom === "true") {
    GroupGame.applySettingsNextRound();
    return;
  }
  const name = document.getElementById("groupPlayerName").value.trim() || "Player";
  const joinType = segValue("groupJoinSeg") || "create";
  withDatabase("Group Race", () => {
    if (joinType === "create") {
      const digits = document.getElementById("groupDigits").value;
      const playerCount = document.getElementById("groupSize").value;
      const mode = segValue("groupModeSeg") || "turns";
      const vis = segValue("groupVisSeg") || "easy";
      const allowRepeats = segValue("groupRepeatSeg") === "repeat";
      const clueMode = segValue("groupClueSeg") || "position";
      const groupType = segValue("groupTypeSeg") || "race";
      GroupGame.createRoom(name, digits, playerCount, mode, groupType === "battle" ? "hard" : vis, allowRepeats, clueMode, groupType);
    } else {
      const code = document.getElementById("groupJoinCode").value.trim();
      if (!code) { alert("Enter a room code to join."); return; }
      GroupGame.joinRoom(name, code);
    }
  });
});

document.getElementById("groupGuessBtn").addEventListener("click", e => {
  e.preventDefault();
  GroupGame.submitGuess(document.getElementById("groupGuessInput").value);
});
document.getElementById("groupTargetSelect").addEventListener("change", () => {
  const el = document.getElementById("groupCurrentTarget");
  const sel = document.getElementById("groupTargetSelect");
  if (el && sel && sel.value) {
    el.textContent = `Selected target: ${sel.options[sel.selectedIndex].textContent.replace(" (locked)", "")}. Press Guess to lock this target.`;
    el.style.display = "block";
    el.style.borderColor = "var(--line)";
  }
});
document.getElementById("groupLockBtn").addEventListener("click", e => {
  e.preventDefault();
  GroupGame.lockSecret();
});
document.getElementById("groupGuessInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    GroupGame.submitGuess(document.getElementById("groupGuessInput").value);
  }
});

/* ─── Init ──────────────────────────────────────────────── */
showPage("pageHome");
