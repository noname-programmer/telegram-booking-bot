#!/usr/bin/env bash
# Runs when a Claude session starts: installs dependencies so `npm run lint`,
# `npm test` and `npm run smoke` work right away. Quiet when everything is in place.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
for dir in . test standalone; do
  if [ -f "$dir/package-lock.json" ] && [ ! -d "$dir/node_modules" ]; then
    (cd "$dir" && npm ci --silent --no-audit --no-fund >/dev/null 2>&1) \
      && echo "Installed npm dependencies in $dir/" \
      || echo "Could not install npm dependencies in $dir/ — run: (cd $dir && npm ci)"
  fi
done
exit 0
