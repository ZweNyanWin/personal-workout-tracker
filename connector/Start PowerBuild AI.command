#!/bin/zsh

# Finder starts with a minimal PATH; use the user's existing Node installation.
cd "${0:A:h:h}" || exit 1
if ! command -v node >/dev/null 2>&1 && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  print "Node.js could not be found. Open Terminal in this project and run npm run coach:connect."
  read "?Press Return to close."
  exit 1
fi

node connector/run.mjs
connector_result=$?
if (( connector_result != 0 )); then
  read "?Press Return to close."
fi
exit "$connector_result"
