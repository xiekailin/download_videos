#!/bin/zsh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org/"
  read -r "?按回车键退出…"
  exit 1
fi

echo "正在安装网页下载器…"
npm ci
npx playwright install chromium
node scripts/install-tools.mjs
mkdir -p export

echo ""
echo "安装完成。以后双击 start.command 即可使用。"
read -r "?按回车键退出…"
