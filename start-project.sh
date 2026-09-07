#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PYTHON="$BACKEND_DIR/venv/Scripts/python.exe"
UI_URL="http://127.0.0.1:5173"

if [[ ! -f "$BACKEND_PYTHON" ]]; then
  echo "Backend virtual environment not found: $BACKEND_PYTHON"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Frontend dependencies not found. Run npm ci in frontend first."
  exit 1
fi

# Convert Git Bash or WSL paths to Windows paths for the new terminal windows.
to_windows_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$1"
  elif [[ "$1" =~ ^/[[:alpha:]]/ ]]; then
    # Basic /c/path -> C:/path fallback for minimal Bash environments.
    printf '%s:/%s\n' "${1:1:1^^}" "${1:3}"
  else
    printf '%s\n' "$1"
  fi
}

BACKEND_DIR_WIN="$(to_windows_path "$BACKEND_DIR")"
FRONTEND_DIR_WIN="$(to_windows_path "$FRONTEND_DIR")"
BACKEND_PYTHON_WIN="$(to_windows_path "$BACKEND_PYTHON")"

cmd.exe /c start "ArthNiti Backend" /D "$BACKEND_DIR_WIN" powershell.exe -NoExit -Command "& '$BACKEND_PYTHON_WIN' main.py"
cmd.exe /c start "ArthNiti Frontend" /D "$FRONTEND_DIR_WIN" powershell.exe -NoExit -Command "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"

echo "Starting the UI at $UI_URL..."
for _ in {1..30}; do
  curl --fail --silent "$UI_URL" >/dev/null 2>&1 && break
  sleep 1
done

CHROME=""
for candidate in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"; do
  if [[ -f "$candidate" ]]; then
    CHROME="$candidate"
    break
  fi
done

if [[ -n "$CHROME" ]]; then
  "$CHROME" "$UI_URL" >/dev/null 2>&1 &
else
  echo "Chrome was not found. Open $UI_URL manually."
fi
