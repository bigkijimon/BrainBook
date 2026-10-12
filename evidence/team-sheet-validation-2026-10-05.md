# Team popup (AgentFlow part B) — validation state

## The one fact that governs this folder

**Nothing in it has been measured on the current source.** `src/TeamRail.tsx` and `src/styles.css`
changed again this round, so the five PNGs here (`team-sheet-apppro-1440x900.png`,
`team-sheet-blogpro-1440x900.png`, `team-sheet-moviepro-1440x900.png`,
`team-sheet-moviepro-1440x700-fallback.png`, `team-sheet-moviepro-390x844.png`) describe a stylesheet
that is no longer on disk — `team-sheet-moviepro-390x844.png` in particular is a picture of the
composer drawn over the member cards, which is the defect the card was opened to repair, not a picture
of the repair. `evidence/team-sheet-manifest.json` and `evidence/team-sheet-measurements.json` do not
exist, which is the machine-readable form of the same fact: the manifest is written *before* the first
check of a run, so its absence means no run has started here.

`npm run build` now says this out loud rather than only this file saying it. Every non-green branch of
`scripts/check-harness-build.mjs` appends the captures it found on disk, by name, as attributed to no
finished measurement; the list it reads is the same `POPUP_CAPTURES` the run writes
(`scripts/source-fingerprint.mjs`). Treat the round as unfinished until a build prints
`ok   team-popup evidence describes this source`, which only happens after `status: "complete"` with the
current fingerprint.

## What the popup is, and what this round changed in it

The crew is one grid of member cards beside a conversation column, not a chain: the depth-first walk
feeds an ordered list, the list is `auto-fill` cards of at least 196px, and depth is an indent. At
1440 that is four columns, so fifteen members are four rows and the whole popup — header, chain-arrow
band, composer, "Now" list, every card — is content-sized well inside 900px. That was already true
before this round; it was unmeasured, not unbuilt.

| Finding | Fix | Where |
| --- | --- | --- |
| 🔴 The pane gave up its two columns ~200px before the content needed it to. The comment claimed "below ~1000px the crew column can no longer hold four 196px cards beside a 280px message column" and the rule was set to 1000px, but the arithmetic gives 100vw = 1204. Between 1001 and 1210 the crew resolved to three tracks, a fifteen-member chain became five rows, and the crew list needed a scrollbar of its own — at the swept 1024x768, the crew column was over its height while 330px of side column sat beside it doing nothing for the crew | The breakpoint is 1210px, with the arithmetic written out beside it. At 1024x768 the popup now stacks: four tracks, one pane scroller, the composer directly under the crew. Invisible at 1440x900 and at 390x844 | `src/styles.css` `.team-pane` breakpoint |
| 🔴 The 44px touch-target floor and the layout it belongs to were two different numbers: 640px in the two touch blocks, 1000px in the pane breakpoint. A 900px window therefore kept 30px chips and a 34px Send button while the suite asserted 44px there — it passed only because no swept viewport landed between the two | One number, 1210px, in all three places, so the rule and its measurement cannot disagree. `(pointer: coarse)` still carries the tablet with a fine pointer | `src/styles.css` two `@media` blocks |
| 🟠 The member card's type descended and then climbed: 13px name, 10.5px model, 11.5px role. The line that answers the question the popup exists to answer was last, and smaller than the id it followed | Name, then role, then model. Same three rows, same card height, so the fifteen-member fit is untouched — only the order is. Role goes to 12px, the project's own next step, which costs 1.4px per card | `src/TeamRail.tsx` `MemberFrame`, `src/styles.css` `.member-frame small` |
| 🟠 The depth indent was `var(--depth) × 12px` in a track whose text column is ~130px, and Router chains are seven members plus one per configured profile — the indent grew until the name wrapped | Capped at two levels. `--depth` itself is still the true depth, so `parentOf`, the `aria-describedby` note and "Reports to" in the info card stay exact; the chain band already spells the order out with arrows | `src/styles.css` `.team-cell` |

The two a11y items the round before raised (truncated text reachable by tap, not by `title`; arrow keys
on both roving groups) and the three from the round input (44px targets, copy that fits mouse and
touch, a voice test that picks its member out of the rendered sheet) were already in the source and
were not touched.

## Run this, in this order

1. `npm run verify:popup` — `test:team-sheet` then `test:voice`. The fit run must end
   `TEAM_SHEET_FIT_OK`, print `member card x (message box | "Now") intersections` as `0` at 1440x900,
   1440x700 and 390x844, and leave all eight captures plus both JSON files in `evidence/`. The voice
   run must end `VOICE_OK`. It deletes the five stale PNGs before it measures, so nothing above survives
   a run whether it passes or fails.
2. `npm run build` — its third line must read `ok   team-popup evidence describes this source`. A
   `warn` there means step 1 has not run since the last edit to `src/`.
3. `npx tsc --noEmit` — zero errors.
4. `macos/build-app.sh` → `INSTALLED /Applications/BrainBook.app`, then quit and relaunch, open AppPro's
   and BlogPro's popup at exactly 1440x900, and save both screenshots into this folder.

Read the manifest rather than the log: the manifest is what the folder can prove about itself.

## What to look at by eye

1440x900, AppPro: header, chain-arrow band, composer, "Now" list and all eleven member cards inside the
viewport, no scrollbar on the popup, four rows of cards and no full-width bar in the grid. Every card
reads name, then job, then model, and the job line is the largest of the two.

390x844, MoviePro: the composer and the "Now" list below the crew in normal flow, nothing painted over a
member card at any scroll position.

1024x768, MoviePro: stacked — one scroll region rather than a crew list with a scrollbar inside it.