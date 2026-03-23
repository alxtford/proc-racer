# Test Coverage Analysis

_Generated against commit f407e92 ("refactor core app, more tests")_

## Current State

The project uses two complementary validation layers:

| Layer | Tool | Scripts / Files |
|---|---|---|
| Content validation | Node.js script | `scripts/validate-content.mjs` |
| Integration / E2E | Playwright | `tests/playwright/validate.spec.mjs` |

There is **no unit testing framework** (no Vitest / Jest / Mocha). Every test runs against a live browser or a full track-build pipeline, meaning isolated logic errors are only caught when they surface through one of the specific flows the tests exercise.

### What the latest commit improved

The `f407e92` commit made meaningful additions:

- **Four tagged Playwright tests** (`@smoke`, `@garage`, `@reroll`, `@copy-audio`) replacing the old ad-hoc scripts, covering menu navigation, race completion, garage roll, style purchase, strike-board reroll, tooltip timing, and audio state transitions.
- **Elevation determinism check** in `validate-content.mjs`: `buildTrack` is called twice per event and `elevationSamples` are compared index-by-index, catching any non-deterministic height/bank output.
- **New geometry constraints**: height range bounds (24–220 units), grade limit (0.28), bank limit (width × 0.16), prop road-clearance, and pickup `z` coordinate presence.

---

## Gaps and Proposed Improvements

### 1. Pure utility functions (`src/core/utils.js`) — no coverage at all

These are the lowest-level building blocks used everywhere, yet have zero tests.

**`createRng(seed)`** is the most important. The elevation determinism test in `validate-content.mjs` indirectly exercises the RNG, but it does not assert that `createRng(seed)` itself is stable across Node.js versions or engine updates. A direct test should assert that a fixed seed always produces the same first N values.

**`wrapAngle`** uses a `while` loop that is easy to break with far-out-of-range inputs. Edge cases worth covering: values slightly above `Math.PI`, values at exactly `Math.PI`, and values many multiples of `TAU` away from zero (e.g. `100 * Math.PI`).

**`formatTime`** has a guard for non-finite input (`return "--"`) that is never exercised. Additional cases: `NaN`, `Infinity`, `0`, sub-minute values like `59.99`, and values that produce a leading zero on the seconds component (e.g. `61` → `"1:01.00"`).

---

### 2. Economy logic (`src/core/economy.js`) — single wallet path tested

The Playwright garage test verifies one scenario: fresh save (220 Flux) → spend 180 → 40 remaining. All other branches are untested.

**`spendCurrency` when balance is insufficient** should return `false` and leave the wallet unchanged. This is never tested. A bug here (e.g. spending going negative) would not be caught.

**`grantCurrency` clamping** — the upper cap of 999,999 (`clamp(next, 0, 999999)`) is never exercised. A test should grant currency above the cap and verify it is clamped.

**`ensureWallet` legacy field coalescing** — when `save.wallet` is absent, the function falls back to `save.currency` (legacy field from an older save version). This migration path is never tested. A regression here would silently zero out wallet balances for players loading old saves.

**`purchaseStoreProduct` currency priority** — when a `preferredCurrency` is specified, the function re-orders the price list to try that currency first, then falls back. The fallback path (preferred currency unavailable, falls back to default) has no test. Neither does the case where no currency is sufficient (`{ ok: false, reason: "insufficient_funds" }`).

---

### 3. Race reward calculation (`src/core/garage.js:325`) — complex branching, zero coverage

`calculateRaceReward` has eight independent additive conditions (finish position, goals met, par time delta, car survival, daily bonus, new event best, tutorial pickup). The E2E smoke test force-finishes the race by mutating `car.finished` directly rather than racing naturally, and does not assert the reward value at all.

Example untested combinations:

```
// Maximum reward: 1st place, daily, all goals, under par, no destroyed cars, new best
{ place: 1, goalsMet: 3, deltaToPar: -5, destroyedCount: 0,
  newEventBest: true, newDailyBest: true, event: { daily: true, guided: false } }

// Guided tutorial run: different base, tutorial pickup bonus
{ wasTutorialRun: true, tutorialPickupMet: true, event: { guided: true } }

// Last place, no goals, over par, guided
{ place: 4, goalsMet: 0, deltaToPar: 10, event: { guided: true } }
```

The weighted formula in `getGarageScore` (`accel*0.27 + topEnd*0.27 + handling*0.28 + durability*0.18`) and the tier bonus table in `getScrapValue` (apex: +22, pro: +14, club: +8, other: +4) are also pure formulas with no tests.

---

### 4. Save migration (`src/core/save.js`) — high blast radius, zero coverage

`migrateSave` has two execution paths: same-version (merge defaults) and old-version (full reconstruction). Neither is tested.

**Same-version path** (lines 70–78): nested objects like `daily`, `strikeBoard`, and `settings` are spread-merged. A bug that dropped a field (e.g. `bestTime` from `daily`) would silently reset player data but would not cause a visible error in any current test.

**Old-version path** (lines 80–103): the Flux reconstruction formula on line 85 (`STARTING_FLUX + wins * 55 + eventProgress * 20`) is exercised by no test. The `dailyBest` → `daily.bestTime` field rename on line 100 is also untested.

**`pushRunHistory` capping** — the 24-entry cap (`slice(0, 24)`) is never tested. It is a simple function but the cap boundary is worth asserting.

---

### 5. Isometric projection (`src/core/isometric.js`) — new file, zero coverage

`isometric.js` (248 lines, added in f407e92) contains pure projection math with no tests:

- **`worldToIso`** — a linear transform; easy to verify with known inputs.
- **`projectIsoPoint`** — subtracts camera offset and applies scale; the camera-at-origin case and a non-zero camera case are both trivial to assert.
- **`buildIsoRibbon`** — generates screen-space ribbon geometry for track rendering. The output length should equal `track.points.length` for both left and right arrays, and banking should tilt the edge points. Currently there is no way to catch a sign error in the bank offset calculation.
- **`getTrackFrameAtIndex`** — the circuit wrap-around path (`index === 0` wrapping to `points.length - 1`) is only reached during actual rendering; a unit test for it would be straightforward.

---

### 6. EventBus (`src/core/eventBus.js`) — infrastructure with no tests

`EventBus` is used throughout `main.js` and the UI system, but has no tests. The unsubscribe pattern (the `on` method returns a cleanup function) is easy to break silently.

Cases to cover:
- Handler is called when a matching event is emitted.
- Handler is **not** called after the unsubscribe function is invoked.
- Multiple handlers registered to the same event are all called; removing one does not remove the others.
- Emitting to an event with no listeners is a no-op (no error thrown).

---

### 7. Playwright test gaps

The four E2E tests are a solid foundation but leave some flows untested:

**Save migration across reload** — no test loads a v4 save blob into `localStorage`, reloads, and verifies the migrated state. This is the scenario most likely to silently corrupt player data.

**Tutorial flow** — `resetApp` in the helper accepts a `tutorialCompleted` option but no test passes `false` to exercise the tutorial intro path. The tutorial pick-up reward (`wasTutorialRun: true`) is reachable only through this flow.

**Natural race completion** — the `@smoke` test ends the race by directly setting `car.finished = true` via `page.evaluate`. This bypasses the finish-line detection logic in `gameplay.js`. A test that races through the finish line checkpoint would cover that path.

**Settings persistence** — no test changes a setting (e.g. `reducedShake`), reloads the page, and verifies the setting is preserved in the loaded save. `persistSave` and `loadSave` are only indirectly exercised.

---

### 8. Content validation gaps

**Multiple daily event dates** — `validate-content.mjs` tests one hardcoded date (`2026-03-21`). `createDailyEvent` hashes the date into a seed; testing a handful of additional dates would catch any date-boundary edge cases in the hash function.

**`buildTrack` determinism for the full track** — the new determinism check compares `elevationSamples` between two calls, but does not compare `track.points`, `track.checkpoints`, or `track.sectors`. A geometry regression (non-deterministic point positions) would not be caught.

---

## Recommended Starting Point

The highest return-on-effort additions, in priority order:

1. **Unit tests for `economy.js`** — pure functions, no mocking needed, directly protect player currency data.
2. **Unit tests for `calculateRaceReward`** — 8 combinations, each a one-liner assertion, covers the most branchy untested logic.
3. **Unit tests for `utils.js`** — foundation of everything; `createRng` stability and `wrapAngle` edge cases in particular.
4. **A Playwright test loading an old-format save** — highest blast radius of any untested path; one test covers the entire `migrateSave` old-version branch.

Adding **Vitest** is the natural fit for items 1–3 since the project already uses native ES modules (`"type": "module"`) and has no transpilation step — no configuration is needed beyond `npm install -D vitest`.
