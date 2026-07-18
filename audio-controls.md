# Capturing headphone media-button input on the web

Findings from implementing headphone-button game controls in Blob Hop
(see the `🎧` toggle in `game.js`, section "headphone / media-button
controls"). Written for agents/developers adding similar functionality.
This approach was verified working on Android Chrome with Bluetooth
headphones in July 2026.

## What is and isn't capturable

| Headphone input            | Capturable? | How                                        |
|----------------------------|-------------|--------------------------------------------|
| Play/pause press           | ✅ Yes      | Media Session API `play` / `pause` actions |
| Next track (often 2-press) | ✅ Yes      | `nexttrack` action                         |
| Previous track (3-press)   | ✅ Yes      | `previoustrack` action                     |
| Volume up/down             | ❌ No       | OS adjusts system volume; no event reaches the page |
| Assistant gesture          | ❌ No       | Consumed by the OS before the browser      |

Desktop keyboard media keys (⏯ ⏭ ⏮) arrive through the same action
handlers for free.

Caveat on multi-press: whether double/triple press maps to next/previous
track is decided by the headset firmware and OS settings. If the user has
double-press bound to their assistant, the browser never sees it.

## The core trick: you must be the active media session

`navigator.mediaSession.setActionHandler(...)` does nothing unless the
page is *actively playing audio*. The browser only routes hardware media
buttons to the tab it considers the current media player. So:

1. Generate a ~10 second, mono, 16-bit WAV entirely in JS: a 50 Hz sine
   at amplitude ≈ 60/32768 (about −55 dBFS — inaudible in practice but
   **not silent and not muted**). Serve it via `URL.createObjectURL(new Blob(...))`.
2. Play it on a **looping `<audio>` element**, started **inside a user
   gesture handler** (tap/click) to satisfy autoplay policy.
3. Then set `navigator.mediaSession.metadata` (a `MediaMetadata` with a
   title — this is what shows in the OS media notification), set
   `playbackState = "playing"`, and register the action handlers.

Why these details matter:

- **Muted audio does not activate the media session.** Don't use
  `audio.muted = true` or `volume = 0`; use a near-silent waveform
  instead. (If buttons stop arriving on some future Chrome version,
  suspect its "is this tab audible" heuristic and nudge the amplitude up.)
- **Short clips may not engage the session.** Chrome historically ignores
  media under ~5 seconds for media-session purposes; use ≥ 10 s and loop.
- **Re-assert `playbackState = "playing"` inside every action handler.**
  When the user presses pause, do your game action but *don't* pause the
  audio, and set the state back to `"playing"` — otherwise the OS decides
  you're paused and the button flow changes/stops.
- **Registering a handler suppresses the default behavior** (the browser
  won't actually pause your audio when a handled action fires).
- Wrap each `setActionHandler` call in try/catch — browsers throw on
  action names they don't support.

## UX consequences — make it opt-in

Becoming the active media session **takes audio focus**: the user's
music/podcast app gets paused, and a media notification card (with your
metadata title) appears in the notification shade. Don't do this on page
load; use an explicit toggle button, and on disable: pause the audio,
null out all action handlers, set `playbackState = "none"` and
`metadata = null`.

## Minimal skeleton

```js
const audio = new Audio(quietLoopURL());   // ~10 s near-silent WAV blob URL
audio.loop = true;

button.onclick = () => audio.play().then(() => {
  navigator.mediaSession.metadata = new MediaMetadata({ title: "My App" });
  navigator.mediaSession.playbackState = "playing";
  const act = (fn) => () => { fn(); navigator.mediaSession.playbackState = "playing"; };
  navigator.mediaSession.setActionHandler("play",  act(jump));
  navigator.mediaSession.setActionHandler("pause", act(jump));
  navigator.mediaSession.setActionHandler("nexttrack",     act(dash));
  navigator.mediaSession.setActionHandler("previoustrack", act(rock));
});
```

Feature-detect with `"mediaSession" in navigator && typeof MediaMetadata !== "undefined"`
and hide the toggle when unsupported.

The full working implementation (WAV generation included) lives in
[`game.js`](game.js) — search for `hpEnable`.
