# Warehouse Evil

A short first-person survival game that runs in the browser (Chrome), built for a presentation.

You play the **Analyst**. Six monsters, each one a pain point of building a dashboard, roam the warehouse. You start on the second floor with a weak shotgun. Somewhere in the dark there is the **Semantic Bot**, a crossbow that kills in one shot.

## The story

Before: every dashboard used its own logic, so two teams could have two different definitions of revenue. To build a dashboard an analyst had to:

| Monster | Pain point | Semantic Bot fix |
|---|---|---|
| Platform Team | Needs a model built by the Platform Team: wait in the queue | No ticket needed, the bot builds the model |
| dbt Aggregate | dbt aggregate models written by hand | Aggregates generated automatically |
| Semantic Layer | Semantic layer authored by hand | Semantic layer generated, never hand-written |
| Testing | Alerting and tests added manually | Tests and alerts come built in |
| Dashboard | Every dashboard re-implements its own logic | One source of truth for every team |
| Maintenance | The analyst maintains everything | The bot maintains it, not the analyst |

The wording is in the `PAIN` table in `game.js`.

## Run it

Open `index.html` in Chrome (double-click), or serve the folder:

```
python3 -m http.server 8000
```

then go to http://localhost:8000 and click to start. Chrome may need one click or key press before the title music plays.

No build step. three.js is included locally, so it works offline.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Shift | Sprint (monsters notice you from further away) |
| Mouse | Look |
| Left click | Shoot |
| R | Reload shotgun |
| 1 / 2 | Switch weapon |
| Esc | Pause (shows the pain-point list) |
| 0 | Demo shortcut: teleport next to the Semantic Bot |

## How to win

1. Stay on the second floor first. Monsters can't climb, and shotgun noise alerts them.
2. Take the stairs on the right, then follow the blue beam to the far west corner. Four guards patrol it.
3. Pick up the **Semantic Bot**, then kill all 6 monsters. The end screen compares the shotgun with the bot.

## Files

| File | What it is |
|---|---|
| `index.html` | Page and HUD |
| `game.js` | All game code |
| `three.min.js`, `post.js` | three.js r128 and its post-processing (bloom, tone mapping) |
| `music.mp3`, `starting.mp3`, `scream.mp3` | Background music, title music, monster scream |

Sound effects (shots, groans, heartbeat) are generated in the browser. If the game feels slow, lower the pixel ratio (`PR`) near the top of `game.js`.

The music files are copyrighted by their owners. Replace them with your own if you share this publicly.
