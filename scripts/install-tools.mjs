import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { downloadFile } from "../local/network.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = path.join(projectRoot, "tools");

function releaseAsset() {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  if (process.platform === "linux" && process.arch === "arm64") return "yt-dlp_linux_aarch64";
  if (process.platform === "linux") return "yt-dlp_linux";
  throw new Error(`暂不支持的操作系统：${process.platform}/${process.arch}`);
}

const asset = releaseAsset();
const destination = path.join(toolsDir, process.platform === "linux" ? "yt-dlp" : asset);
await fs.mkdir(toolsDir, { recursive: true });

try {
  await fs.access(destination);
  console.log(`通用下载组件已存在：${path.basename(destination)}`);
} catch {
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  process.stdout.write("正在安装通用下载组件… 0%\r");
  let lastPercent = 0;
  await downloadFile(url, destination, {
    timeout: 10 * 60_000,
    onProgress: ({ received, total }) => {
      if (total) {
        const percent = Math.round((received / total) * 100);
        if (percent !== lastPercent) {
          lastPercent = percent;
          process.stdout.write(`正在安装通用下载组件… ${percent}%\r`);
        }
      }
    },
  });
  if (process.platform !== "win32") await fs.chmod(destination, 0o755);
  console.log(`\n通用下载组件安装完成：${path.basename(destination)}`);
}
