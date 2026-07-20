#!/bin/zsh
cd "$(dirname "$0")"

if [[ ! -d node_modules ]]; then
  echo "尚未安装，请先双击 setup.command。"
  read -r "?按回车键退出…"
  exit 1
fi

npm start
status=$?
echo ""
echo "下载器已停止（状态码：$status）。"
read -r "?按回车键退出…"
