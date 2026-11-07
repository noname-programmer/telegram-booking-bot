---
name: check
description: Run all project checks (lint, scenario tests, standalone smoke test) and explain the result in plain Russian. Use when the owner asks whether everything works, before deploying, or after any change.
---

# Check the project

1. Make sure dependencies are installed (`npm ci` in `.`, `test/`, `standalone/` where `node_modules` is missing).
2. Run, in order, and capture the output:
   - `npm run lint`
   - `cd test && npm test`
   - `cd standalone && npm run smoke`
3. Report to the owner in Russian, short:
   - ✅ / ❌ for each of: «Линтер», «Сценарии», «Запуск без Serverless»;
   - if something failed: which scenario or file, what it means in plain words, and a proposed fix.
     Ask before changing code to fix it.
4. If the current branch has a pull request on GitHub, also mention whether its CI is green.
