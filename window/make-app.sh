#!/bin/bash
# Makes the "Claude 보드" app: a standalone window showing the board,
# with an icon on the Desktop. Run once per computer:  bash window/make-app.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HOME/Library/Application Support/my-board"
APP="$HOME/Applications/Claude 보드.app"
CHROME="/Applications/Google Chrome.app"

if [ ! -d "$CHROME" ]; then
  echo "Google Chrome이 필요합니다: $CHROME 에 없음" >&2
  exit 1
fi

mkdir -p "$DATA" "$HOME/Applications"
cp "$HERE/board.html" "$DATA/board.html"

URL="file://$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$DATA/board.html")"
rm -rf "$APP"
osacompile -o "$APP" -e "do shell script \"open -na 'Google Chrome' --args --app='$URL' --window-size=560,1000\""

# icon
ICONSET="$(mktemp -d)/board.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$HERE/icon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$HERE/icon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/applet.icns"
codesign --force --deep -s - "$APP" 2>/dev/null
touch "$APP"

# Desktop shortcut (a Finder alias; a symbolic link does not open from the Desktop)
rm -f "$HOME/Desktop/Claude 보드"
osascript -e "tell application \"Finder\" to make alias file to (POSIX file \"$APP\" as alias) at (POSIX file \"$HOME/Desktop\" as alias)" >/dev/null

echo "만들었습니다: $APP"
echo "바탕화면 아이콘: $HOME/Desktop/Claude 보드"
