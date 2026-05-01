#!/bin/zsh

set -euo pipefail

REPO_DIR="/Users/isarichter/Documents/Dossier/Personal/Codex Projects/Waykeeper/waykeeper/web"
APP_URL="http://127.0.0.1:3000"

focus_waykeeper_tab() {
  /usr/bin/osascript <<APPLESCRIPT >/dev/null 2>&1
set targetUrl to "$APP_URL"

on focusChromiumApp(appName, targetUrl)
  tell application appName
    repeat with w in windows
      set tabIndex to 0
      repeat with t in tabs of w
        set tabIndex to tabIndex + 1
        try
          if (URL of t as text) starts with targetUrl then
            set active tab index of w to tabIndex
            set index of w to 1
            activate
            return true
          end if
        end try
      end repeat
    end repeat
  end tell
  return false
end focusChromiumApp

on focusSafariApp(targetUrl)
  tell application "Safari"
    repeat with w in windows
      set tabIndex to 0
      repeat with t in tabs of w
        set tabIndex to tabIndex + 1
        try
          if (URL of t as text) starts with targetUrl then
            set current tab of w to t
            set index of w to 1
            activate
            return true
          end if
        end try
      end repeat
    end repeat
  end tell
  return false
end focusSafariApp

tell application "System Events"
  set runningApps to name of every process
end tell

repeat with appName in {"Arc", "Google Chrome", "ChatGPT Atlas"}
  if runningApps contains (contents of appName) then
    if focusChromiumApp(contents of appName, targetUrl) then
      return "focused"
    end if
  end if
end repeat

if runningApps contains "Safari" then
  if focusSafariApp(targetUrl) then
    return "focused"
  end if
end if

return "missing"
APPLESCRIPT
}

open_or_focus_waykeeper() {
  if ! focus_waykeeper_tab; then
    open "$APP_URL"
  fi
}

cd "$REPO_DIR"

if lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Waykeeper is already running on port 3000."
  open_or_focus_waykeeper
  exit 0
fi

(
  while ! nc -z 127.0.0.1 3000 >/dev/null 2>&1; do
    sleep 1
  done
  open_or_focus_waykeeper
) &

echo "Starting Waykeeper on $APP_URL ..."
echo "A browser tab will open once the server is ready."
echo

npm run dev:user
