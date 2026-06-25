# CipherRoom

CipherRoom is a browser-based number-code guessing game. Players lock a secret code, then try to crack another code using color-style clues inspired by Wordle.

## Live Site

The project is designed to run on GitHub Pages.

Current GitHub Pages URL:

```text
https://vhyb69bdf2-droid.github.io/my-website-/
```

## Game Modes

### Multiplayer

Two players share a room code, lock secret numbers, and try to guess each other's code.

Options include:

- 3, 4, or 5 digit codes
- Repeated digits on or off
- Normal hints or hard hints
- Digit tracker on or off
- Turn-based or real-time rounds

### Nova

Play against the built-in AI opponent, Nova.

Difficulty levels:

- Easy
- Medium
- Impossible

Nova uses logic and elimination to make guesses. The harder modes narrow down possible codes more aggressively.

### Group

Group mode supports 3 to 5 players.

Group types:

- Shared Code Race: everyone races to crack one shared code.
- Code Battle: every player locks their own code and scores points by cracking other players' codes.

Code Battle overtime supports tied-player tiebreakers, spectators, and quit handling.

## Hint Modes

### Normal Hints

Normal hints show:

- Green: correct digit in the correct position
- Yellow: correct digit in the wrong position
- Gray/red tracker mark: digit is not in the code

### Hard Hints

Hard hints only tell you whether guessed digits are present somewhere in the code. They do not reveal exact positions.

## Digit Tracker

When enabled, the digit tracker helps keep track of what has been learned:

- Blank: digit has not been guessed yet
- Red X: digit is not in the code
- Yellow mark: digit is present, but position is unknown
- Green mark: digit is known in the correct position

You can also tap tracker digits to build guesses without typing.

## Files

Upload these files together at the root of the GitHub Pages repository:

```text
index.html
app.js
styles.css
firebase-config.js
README.md
```

## Firebase

CipherRoom uses Firebase Realtime Database for live multiplayer rooms.

The database URL is configured in:

```text
firebase-config.js
```

Current config:

```js
window.CIPHERROOM_FIREBASE = {
  databaseURL: "https://cipherroom-5fd37-default-rtdb.firebaseio.com"
};
```

Do not put private information, passwords, or personal data into room names or player names. Room data is intended only for gameplay.

## Running Locally

Because this is a static site, it can be served with any simple local web server.

Example:

```bash
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/
```

Opening `index.html` directly may work for layout checks, but using a local server is better for testing scripts and Firebase behavior.

## Deployment

1. Put all project files in the root of the GitHub repository.
2. Make sure the repository contains `index.html` at the root.
3. In GitHub, go to Settings → Pages.
4. Choose the branch and root folder for GitHub Pages.
5. Save and wait for the deployment to finish.

If you replace `app.js` or `styles.css`, update the cache version in `index.html` so browsers load the newest files.

## Notes

- GitHub Pages is public, so anyone with the link can open the game.
- Multiplayer depends on Firebase sync, so live testing should be done on two real devices when possible.
- If a room gets stuck during testing, refresh the page and rejoin with the same room code.
