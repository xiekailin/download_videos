import fs from "node:fs/promises";
import path from "node:path";

import { captureCntvVideo } from "./cctv-capture.mjs";
import { downloadGeneric } from "./generic-downloader.mjs";
import { probeMedia, verifyDecode } from "./media.mjs";
import { downloadFile, fetchJson, fetchText } from "./network.mjs";
import { parseCntvPage, parseQstheoryPage, parseWechatPage } from "./parsers.mjs";
import { classifyUrl, sanitizeFilename } from "./url-utils.mjs";

async function uniqueOutputPath(exportDir, baseName, extension = ".mp4") {
  const safe = sanitizeFilename(baseName);
  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index ? ` (${index + 1})` : "";
    const candidate = path.join(exportDir, `${safe}${suffix}${extension}`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("无法生成可用的输出文件名");
}

function directProgress(update, { received, total }) {
  if (!total) {
    update({ progress: 45, message: `已下载 ${(received / 1_048_576).toFixed(1)} MB` });
    return;
  }
  const percent = Math.min(100, (received / total) * 100);
  update({
    progress: 10 + Math.round(percent * 0.75),
    message: `正在下载高清文件 ${percent.toFixed(0)}%`,
  });
}

export function createDownloader({ projectRoot, exportDir, tempDir }) {
  return async function download({ id, url, proxy, update }) {
    await Promise.all([
      fs.mkdir(exportDir, { recursive: true }),
      fs.mkdir(tempDir, { recursive: true }),
    ]);
    const type = classifyUrl(url);
    let outputPath;

    if (type === "wechat") {
      update({ progress: 4, message: "正在解析微信网页" });
      const pageHtml = await fetchText(url, { proxy });
      const source = parseWechatPage(pageHtml);
      outputPath = await uniqueOutputPath(exportDir, `微信_${source.title}`);
      await downloadFile(source.videoUrl, outputPath, {
        proxy,
        referer: url,
        onProgress: (progress) => directProgress(update, progress),
      });
    } else if (type === "qstheory") {
      update({ progress: 4, message: "正在解析求是网页" });
      const pageHtml = await fetchText(url, { proxy });
      const source = parseQstheoryPage(pageHtml);
      outputPath = await uniqueOutputPath(exportDir, `求是_${source.title}`);
      await downloadFile(source.videoUrl, outputPath, {
        proxy,
        referer: url,
        onProgress: (progress) => directProgress(update, progress),
      });
    } else if (type === "cctv" || type === "cntv") {
      update({ progress: 4, message: "正在读取央视视频信息" });
      const pageHtml = await fetchText(url, { proxy });
      const pageInfo = parseCntvPage(pageHtml);
      const metadata = await fetchJson(
        `https://vdn.apps.cntv.cn/api/getHttpVideoInfo.do?pid=${pageInfo.guid}`,
        { proxy },
      );
      const duration = Number(metadata.video?.totalLength ?? 0);
      const title = String(metadata.title || pageInfo.title)
        .replace(/^\s*\[视频\]\s*/u, "")
        .trim();
      const prefix = type === "cctv" ? "央视" : "共产党员网";
      outputPath = await uniqueOutputPath(exportDir, `${prefix}_${title}`);
      await captureCntvVideo({
        guid: pageInfo.guid,
        duration,
        siteName: type === "cctv" ? "tvcctv" : "dslm",
        outputPath,
        tempDir: path.join(tempDir, id),
        proxy,
        update,
      });
    } else {
      update({ progress: 4, message: "正在调用通用下载器" });
      outputPath = await downloadGeneric({ url, exportDir, projectRoot, proxy, update });
    }

    update({ progress: 90, message: "正在检查清晰度和文件完整性" });
    const info = await probeMedia(outputPath);
    await verifyDecode(outputPath);
    return { filename: path.basename(outputPath), site: type, ...info };
  };
}
