# CipherRoom

CipherRoom is a multiplayer deduction number game prototype. Players choose secret number codes, guess an opponent's code, and receive Wordle-style clue feedback.

## Files

- `index.html` - website markup
- `styles.css` - responsive dark/light UI styling
- `app.js` - game logic for modes, guesses, Nova opponent turns, stats, and room controls
- `firebase-config.js` - optional realtime multiplayer configuration

## Publish on GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root.
3. Open the repository's **Settings**.
4. Go to **Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select the `main` branch and `/root` folder.
7. Save. GitHub will give you a public website URL after it deploys.

No build step is required.

## Friend Multiplayer

GitHub Pages only hosts static files. To make room codes work between two devices, connect the site to Firebase Realtime Database:

1. Go to [Firebase](https://firebase.google.com/) and create a project.
2. Create a **Realtime Database**.
3. Copy the database URL. It looks like `https://your-project-id-default-rtdb.firebaseio.com`.
4. Open `firebase-config.js`.
5. Replace the empty `databaseURL` value with your database URL.
6. Upload the updated files to GitHub.

For a quick prototype, use these Realtime Database rules:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

These rules are public and should only be used for testing. For a real launch, add authentication and private room rules.
