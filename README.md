# Mobopl-battle — Blob Hop! 🟢

A mobile-first, full-screen platformer where you play a sticky green blob.

## How to play

- **Left side:** virtual movement stick (appears under your thumb).
- **Right side:** four buttons — the **bottom (pink ▲) button jumps**. The other three don't do anything yet.
- The blob **sticks to every side of a platform** — tops, walls, even undersides. Crawl along surfaces, around corners, and jump from wall to wall.
- Jumping launches you away from the surface; steer the launch with the stick.
- Don't fall in the water! A splash resets the level.
- Grab the ⭐ to win.

Desktop fallback: arrow keys / WASD to move, Space to jump.

## Running locally

It's a static site — serve the folder with anything:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step, no dependencies: `index.html` + `style.css` + `game.js`.
