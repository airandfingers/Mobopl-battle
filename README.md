# Mobopl-battle — Blob Hop! 🟢

A mobile-first, full-screen platformer where you play a sticky green blob.

## How to play

- **Left side:** virtual movement stick (appears under your thumb).
- **Right side:** four buttons — the **bottom (pink ▲) button jumps**, the **top (🪨) button turns you into a rock** for 3 seconds, the **right (blue ») button dashes** in the direction the stick is pointing, and the **left (🦊) button turns you into a flying fox** for 2.5 seconds.
- A **dash** is a quick, straight, gravity-free burst — shorter than a jump. Hit a platform mid-dash and you stop, stuck to it.
- The **flying fox** flies freely: steer with the stick, tap jump to flap upward. Touching a platform lands and turns you back; so does the timer running out. (Locked in The Gauntlet — that one must be earned.)
- **Enemies** patrol platforms and buzz through the air. Touch one and you pop — unless you're a rock, which squashes them flat.
- The blob **sticks to every side of a platform** — tops, walls, even undersides. Crawl along surfaces, around corners, and jump from wall to wall.
- Jumping launches you away from the surface; steer the launch with the stick.
- As a **rock** you can't steer or jump — you keep your momentum and roll, and slopes speed you up. Some platforms are angled just for this.
- Don't fall in the water! A splash resets the level.
- Grab the ⭐ to clear the level and move on to the next.
- **Four levels:** Green Hills (a friendly warm-up), The Gauntlet — a long, hard run of precision hops, a ceiling traverse, dash-only gaps, a floating wall-shaft climb, and a rock-ramp ride — Enemy Level, a jump-heavy course full of critters with a bay only a flying fox can cross — and Poodle Push-ups, a hurdle course over rows of poodles mid-workout: they rise and sink with every rep, so time your jumps (no fox here either). No checkpoints; falling sends you back to the start of the level.
- Tap the level label in the top-left corner to open the level selector (with a little chime) and jump to any level. Desktop: number keys 1–4.
- Air control is direct: while jumping, your sideways speed follows the stick — let go to stop mid-air, push the other way to turn straight around.

On touch devices in landscape, the game goes fullscreen on your first tap (where the browser supports it); the ⛶ button in the top-right corner toggles fullscreen any time.

Desktop fallback: arrow keys / WASD to move, Space to jump, R to turn to rock, F to dash, G to turn to flying fox.

## Running locally

It's a static site — serve the folder with anything:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step, no dependencies: `index.html` + `style.css` + `game.js`.
