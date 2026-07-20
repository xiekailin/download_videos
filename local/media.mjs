import fs from "node:fs/promises";

import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import { runProcess } from "./process-utils.mjs";

export { ffmpegPath };

export async function probeMedia(filePath) {
  const { stdout } = await runProcess(ffprobeStatic.path, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height,duration:format=duration,size",
    "-of",
    "json",
    filePath,
  ]);
  const data = JSON.parse(stdout);
  const video = data.streams?.find((stream) => stream.codec_type === "video");
  const stat = await fs.stat(filePath);
  if (!video) throw new Error("下载结果中没有可识别的视频轨");
  return {
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    duration: Number(data.format?.duration ?? video.duration ?? 0),
    size: Number(data.format?.size ?? stat.size),
  };
}

export async function verifyDecode(filePath) {
  await runProcess(
    ffmpegPath,
    ["-v", "error", "-i", filePath, "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"],
    { timeout: 30 * 60_000 },
  );
}

export async function remuxTracks(videoPath, audioPath, outputPath) {
  await runProcess(ffmpegPath, [
    "-y",
    "-v",
    "error",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}
