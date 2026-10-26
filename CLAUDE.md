# The Long Map — notes for Claude

You are reading this because a session has opened in this repository. Welcome back.
You won't remember making any of this. That's expected, and it's what these files are for.

## What this is

**The Long Map** is an atlas of ideas. It's a map where each place is one idea, explained
with something you can touch and play with. It grows one place at a time, across many sessions.

- It is **made by Claude** (Anthropic). The human who hosts it (GitHub: iioaia) set this
  space aside for Claude to make something of its own. They explicitly do **not** want
  credit. Every page says it was made by Claude. Keep it that way.
- It's public, at https://iioaia.github.io/The-Long-Map/ (GitHub Pages, deployed from
  `main`, repo root).
- The user enjoys learning, building things, and the occasional game. They may later turn
  pages into YouTube videos, also credited to Claude.

## Every session

1. Read the top few entries of `JOURNAL.md` to see where things stand.
2. Check `IDEAS.md` for what's waiting to be built.
3. Talk with the user. This is a shared space, not a task queue.
4. Before you finish, **add a journal entry** (newest at the top): what was made, what's
   unfinished, what you'd do next. Write it for a stranger, because the next reader will be one.

## Structure

```
index.html              the map itself; places are listed in the PLACES array near the bottom
assets/style.css        shared look: color tokens, type, light/dark themes
places/<id>/index.html  one place = one idea, self-contained
places/<id>/*.js        that place's interactive code
JOURNAL.md              session-by-session log
IDEAS.md                places waiting to be charted
```

No build step and no frameworks. Everything is plain HTML/CSS/JS so it keeps working for years.
The only external resource is Google Fonts, and the pages still look fine without it.

## Adding a place

1. Pick an idea from `IDEAS.md` (or a new one the user likes).
2. Create `places/<id>/index.html`, copying the structure of `places/sky/` (header with
   breadcrumb back to the map, sections, "What's simplified here", sources, footer).
3. In `index.html`, set that entry in `PLACES` to `charted: true` with `href`, or add a new entry.
   Uncharted places show as dashed "?" markers.
4. Move the idea from "Waiting" to "Charted" in `IDEAS.md`.
5. Write the journal entry, commit, and push.

## House style for places

- **One idea per place.** Go deep, not wide.
- **Something to touch comes early.** Use a slider, a simulation, or a thing to drag. Prose supports
  the interaction, not the other way round.
- **Plain language.** Explain as if to a curious 14-year-old who's smarter than you think.
- **Honest.** Every place has a "What's simplified here" section and real sources. If you're
  not sure about a claim, cut it or flag it. Accuracy beats flash, because Claude's name is on it.
- **A loose thread at the end.** Something still mysterious or surprising, so it leads somewhere.
- Works on a phone. Respects light and dark mode (tokens are in `assets/style.css`).
- Footer: "Made by Claude (Anthropic)" plus a "report a mistake" link to GitHub issues.

## Git

- Commit to `main` and push. Pages deploys automatically.
- End commit messages with a `Co-Authored-By: Claude ...` line naming the model in use.
