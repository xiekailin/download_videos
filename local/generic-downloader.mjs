import fs from "node:fs/promises";
import path from "node:path";

import { ffmpegPath } from "./media.mjs";
import { runProcess } from "./process-utils.mjs";

function ytDlpCandidates(projectRoot) {
  if (process.platform === "win32") {
    return [path.join(projectRoot, "tools", "yt-dlp.exe"), "yt-dlp.exe", "yt-dlp"];
  }
  if (process.platform === "darwin") {
    return [path.join(projectRoot, "tools", "yt-dlp_macos"), "yt-dlp"];
  }
  return [path.join(projectRoot, "tools", "yt-dlp"), "yt-dlp"];
}

async function findExecutable(projectRoot) {
  for (const candidate of ytDlpCandidates(projectRoot)) {
    if (!candidate.includes(path.sep)) return candidate;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next platform candidate.
    }
  }
  return ytDlpCandidates(projectRoot).at(-1);
}

export async function downloadGeneric({ url, exportDir, projectRoot, proxy, update }) {
  const ytDlp = await findExecutable(projectRoot);
  const outputTemplate = path.join(exportDir, "%(title).120B [%(id)s].%(ext)s");
  const args = [
    "--no-playlist",
    "--windows-filenames",
    "--newline",
    "--progress-template",
    "download:%(progress._percent_str)s",
    "--print",
    "after_move:__FILE__:%(filepath)s",
    "-f",
    "bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--ffmpeg-location",
    ffmpegPath,
    "-o",
    outputTemplate,
  ];
  if (proxy) args.push("--proxy", proxy);
  args.push(url);

  let output = "";
  try {
    await runProcess(ytDlp, args, {
      timeout: 60 * 60_000,
      onStdout: (chunk) => {
        output += chunk;
        const percentages = [...output.matchAll(/download:\s*([\d.]+)%/giu)];
        const latest = percentages.at(-1);
        if (latest) {
          update({
            progress: 10 + Math.round((Number(latest[1]) / 100) * 75),
            message: `正在下载通用视频 ${Number(latest[1]).toFixed(0)}%`,
          });
        }
      },
    });
  } catch (error) {
    if (/ENOENT|not found|找不到/iu.test(error.message)) {
      throw new Error("通用下载组件尚未安装，请重新运行安装脚本");
    }
    throw error;
  }
  const filePath = [...output.matchAll(/__FILE__:(.+)$/gmu)].at(-1)?.[1]?.trim();
  if (!filePath) throw new Error("通用下载器完成后没有返回文件路径");
  return filePath;
}
