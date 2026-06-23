let mode = "easy";
let allowRepeats = false;
let secret = "";
let knownDigits = {};
let impossibleDigits = {};

function startGame() {
  mode = document.getElementById("mode").value;
  allowRepeats = document.getElementById("repeatToggle").checked;

  document.getElementById("gameArea").classList.remove("hidden");
}

function hasRepeats(num) {
  return new Set(num).size !== num.length;
}

function setSecret() {
  const value = document.getElementById("secretInput").value;

  if (!/^\d{3}$/.test(value)) {
    alert("Enter a valid 3 digit number");
    return;
  }

  if (!allowRepeats && hasRepeats(value)) {
    alert("Repeated digits are disabled");
    return;
  }

  secret = value;

  document.getElementById("guessSection").classList.remove("hidden");

  alert("Secret number saved!");
}

function makeGuess() {
  const guess = document.getElementById("guessInput").value;

  if (!/^\d{3}$/.test(guess)) {
    alert("Enter a valid 3 digit guess");
    return;
  }

  if (!allowRepeats && hasRepeats(guess)) {
    alert("Repeated digits are disabled");
    return;
  }

  const row = document.createElement("div");
  row.className = "guess-row";

  for (let i = 0; i < 3; i++) {
    const box = document.createElement("div");
    box.className = "box";

    box.textContent = guess[i];

    if (mode === "easy") {
      if (guess[i] === secret[i]) {
        box.classList.add("green");
        knownDigits[guess[i]] = true;
      } else if (secret.includes(guess[i])) {
        box.classList.add("yellow");
        knownDigits[guess[i]] = true;
      } else {
        box.classList.add("gray");
        impossibleDigits[guess[i]] = true;
      }
    } else {
      if (secret.includes(guess[i])) {
        box.classList.add("yellow");
      } else {
        box.classList.add("gray");
      }
    }

    row.appendChild(box);
  }

  document.getElementById("history").prepend(row);

  if (mode === "easy") {
    updateTracker();
  }

  if (guess === secret) {
    setTimeout(() => {
      alert("You guessed the number!");
    }, 100);
  }

  document.getElementById("guessInput").value = "";
}

function updateTracker() {
  let html = "<h3>Digit Tracker</h3>";

  for (let i = 0; i <= 9; i++) {
    if (knownDigits[i]) {
      html += `<div>${i} ✅</div>`;
    } else if (impossibleDigits[i]) {
      html += `<div>${i} ❌</div>`;
    } else {
      html += `<div>${i} ❓</div>`;
    }
  }

  document.getElementById("tracker").innerHTML = html;
}
