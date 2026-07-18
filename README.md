# Mobopl-battle — Blob Hop! 🟢

A mobile-first, full-screen platformer where you play a sticky green blob.

## How to play

- **Left side:** virtual movement stick (appears under your thumb).
- **Right side:** four buttons — the **bottom (pink ▲) button jumps**, the **top (🪨) button turns you into a rock** for 3 seconds, and the **right (blue ») button dashes** in the direction the stick is pointing. The left button doesn't do anything yet.
- A **dash** is a quick, straight, gravity-free burst — shorter than a jump. Hit a platform mid-dash and you stop, stuck to it.
- The blob **sticks to every side of a platform** — tops, walls, even undersides. Crawl along surfaces, around corners, and jump from wall to wall.
- Jumping launches you away from the surface; steer the launch with the stick.
- As a **rock** you can't steer or jump — you keep your momentum and roll, and slopes speed you up. Some platforms are angled just for this.
- Don't fall in the water! A splash resets the level.
- Grab the ⭐ to win.

On touch devices in landscape, the game goes fullscreen on your first tap (where the browser supports it); the ⛶ button in the top-right corner toggles fullscreen any time.

Desktop fallback: arrow keys / WASD to move, Space to jump, R to turn to rock, F to dash.

## 🎧 Headphone / media-button controls

Tap the **🎧 button** (top-right, under ⛶) to route your headphones' media
buttons into the game via the Media Session API:

- **Play/pause** → jump
- **Next track** (double-press on many headsets) → dash
- **Previous track** (triple-press on many headsets) → rock

While enabled, the page loops an inaudible audio track — that's what makes the
browser treat the game as the active "media player" and deliver the button
events (it also means your phone may pause whatever music was playing, and
you'll see a "Blob Hop!" entry in the system media notification). Tap 🎧 again
to turn it off.

Keyboard media keys (⏯ ⏭ ⏮) work the same way on desktop.

Not mappable: **volume buttons** and **assistant gestures** — the OS consumes
those itself and never delivers them to a web page.

## Running locally

It's a static site — serve the folder with anything:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step, no dependencies: `index.html` + `style.css` + `game.js`.
