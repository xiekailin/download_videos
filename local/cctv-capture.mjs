import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

import { remuxTracks } from "./media.mjs";

export function buildPlayerHtml({ guid, siteName }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#000">
  <div id="capture_player" style="width:1280px;height:720px"></div>
  <script src="https://js.player.cntv.cn/creator/vodplayer.js"></script>
  <script>
    createVodPlayer({
      divId: "capture_player", w: 1280, h: 720,
      t: ${JSON.stringify(siteName)},
      videoCenterId: ${JSON.stringify(guid)},
      id: "null", videoId: "", url: location.href, articleId: "",
      filePath: "", sysSource: "", channelId: "", scheduleId: "",
      isLogin: "", userId: "", isDefaultPreImage: "true",
      isAutoPlay: "true", posterImg: "", isLeftBottom: "true",
      isAudio: "false", isVod4k: "false", isHttps: "true",
      wmode: "opaque", wideMode: "normal", listMode: "false",
      setupOn: "false", speedOn: "true", hasBarrage: "false",
      playerType: "vod_h5", webFullScreenOn: "false", drm: "true",
      language: "", h5: { p2p: false, bandwidth: 16777216 }
    });
  </script>
</body></html>`;
}

export async function captureCntvVideo({
  guid,
  duration,
  siteName,
  outputPath,
  tempDir,
  proxy,
  update,
}) {
  const prefix = path.join(tempDir, guid);
  const videoPath = `${prefix}.video.mp4`;
  const audioPath = `${prefix}.audio.mp4`;
  await fsPromises.mkdir(tempDir, { recursive: true });
  await Promise.all([videoPath, audioPath].map((filePath) => fsPromises.rm(filePath, { force: true })));

  const counters = {
    video: { chunks: 0, bytes: 0 },
    audio: { chunks: 0, bytes: 0 },
  };
  const launchOptions = {
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  };
  if (proxy) launchOptions.proxy = { server: proxy };

  let browser;
  try {
    try {
      browser = await chromium.launch(launchOptions);
    } catch (error) {
      throw new Error(`浏览器组件不可用，请重新运行安装脚本（${error.message}）`);
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    await page.exposeFunction("__captureMseChunk", (kind, base64) => {
      if (kind !== "video" && kind !== "audio") return;
      const bytes = Buffer.from(base64, "base64");
      fs.appendFileSync(kind === "video" ? videoPath : audioPath, bytes);
      counters[kind].chunks += 1;
      counters[kind].bytes += bytes.length;
    });

    await page.addInitScript(() => {
      const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
      MediaSource.prototype.addSourceBuffer = function addSourceBuffer(mimeType) {
        const sourceBuffer = originalAddSourceBuffer.call(this, mimeType);
        const originalAppendBuffer = sourceBuffer.appendBuffer;
        const kind = mimeType.toLowerCase().includes("video") ? "video" : "audio";

        sourceBuffer.appendBuffer = function appendBuffer(data) {
          try {
            const view =
              data instanceof ArrayBuffer
                ? new Uint8Array(data)
                : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            let binary = "";
            const blockSize = 0x8000;
            for (let offset = 0; offset < view.length; offset += blockSize) {
              binary += String.fromCharCode(...view.subarray(offset, offset + blockSize));
            }
            void window.__captureMseChunk(kind, btoa(binary));
          } catch (error) {
            console.error("capture failed", error);
          }
          return originalAppendBuffer.call(this, data);
        };
        return sourceBuffer;
      };
    });

    const captureUrl = "https://tv.cctv.com/__local_video_capture__.html";
    await page.route(captureUrl, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: buildPlayerHtml({ guid, siteName }),
      }),
    );
    update({ progress: 12, message: "正在启动官方高清播放器" });
    await page.goto(captureUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(
      ({ expected }) => {
        const video = document.querySelector("video");
        if (!video || !Number.isFinite(video.duration)) return false;
        return !expected || Math.abs(video.duration - expected) < 5;
      },
      { expected: Number(duration) || 0 },
      { timeout: 90_000 },
    );
    const actualDuration = await page.locator("video").evaluate((video) => video.duration);
    await page.locator("video").evaluate(async (video) => {
      video.muted = true;
      video.playbackRate = 16;
      await video.play();
    });

    const deadline = Date.now() + Math.max(120_000, actualDuration * 1_000);
    let playbackFinished = false;
    while (Date.now() < deadline) {
      const state = await page.locator("video").evaluate((video) => ({
        currentTime: video.currentTime,
        duration: video.duration,
        ended: video.ended,
      }));
      const ratio = state.duration ? state.currentTime / state.duration : 0;
      update({
        progress: 15 + Math.round(Math.min(1, ratio) * 68),
        message: `正在捕获播放器高清数据 ${Math.round(Math.min(1, ratio) * 100)}%`,
      });
      if (state.ended || state.currentTime >= state.duration - 0.25) {
        playbackFinished = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    if (!playbackFinished) throw new Error("高清播放器捕获超时");
    await page.waitForTimeout(2_000);
    if (!counters.video.bytes || !counters.audio.bytes) {
      throw new Error("播放器没有返回完整的音视频数据");
    }
  } catch (error) {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
    throw error;
  } finally {
    await browser?.close();
  }

  update({ progress: 86, message: "正在无损封装音视频" });
  try {
    await remuxTracks(videoPath, audioPath, outputPath);
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
}
