# Tests

Node tests for the app's pure functions. They need Node 18+ and nothing to install. The app itself never loads them.

```sh
node tests/progression.test.js
```

Run the command from the repo root (any working directory works). The script prints any failures and an `N passed, M failed` line. It exits with code 1 when a test fails.

- `load-app.js` reads the `<script>` from `index.html` and runs it in a Node `vm` sandbox with minimal browser stubs. `init()` is not run, so the app's functions can be called directly.
- `progression.test.js` covers:
  - progression after time off: gap thresholds, rounding to the increment, bodyweight exercises, the return ramp and drop sets
  - colours for eased vs back-off targets
  - placeholders and the ✓ button
  - editing past sessions
  - stall and regression detection around breaks

Some checks compare with the version before the time-off change (commit `5dc7913`), read through `git show`. Without git they are skipped.

All data in the tests is synthetic. Dates are relative to a fixed day, so results don't depend on when the tests run.
