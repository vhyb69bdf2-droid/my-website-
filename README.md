# CipherRoom

CipherRoom is a browser-based number-code guessing game. Players lock a secret code, then try to crack another code using color-style clues inspired by Wordle.

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



Do not put private information, passwords, or personal data into room names or player names. Room data is intended only for gameplay.

