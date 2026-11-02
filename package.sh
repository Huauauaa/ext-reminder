#!/usr/bin/env bash
# 打包扩展为可分发的 zip。
# 用法：./package.sh
# 产物：dist/<name>-<version>.zip
set -euo pipefail

cd "$(dirname "$0")"

NAME=$(/usr/bin/python3 -c "import json;print(json.load(open('manifest.json'))['name'].lower().replace(' ','-'))")
VERSION=$(/usr/bin/python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/${NAME}-v${VERSION}.zip"

# 用 manifest 里出现的文件白名单来打包，避免把 README / 脚本 / dist 自己打进去
FILES=(manifest.json popup.html popup.css popup.js)
for f in "${FILES[@]}"; do
  [[ -e "$f" ]] || { echo "缺少文件: $f" >&2; exit 1; }
done
[[ -d icons ]] && FILES+=(icons)

rm -rf dist
mkdir -p dist
zip -r -X "$OUT" "${FILES[@]}" -x '*.DS_Store' >/dev/null

echo "已生成: $OUT"
unzip -l "$OUT"
