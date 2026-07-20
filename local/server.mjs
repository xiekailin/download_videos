import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import cors from "cors";
import express from "express";

import { createDownloader } from "./downloaders.mjs";
import { JobManager } from "./job-manager.mjs";
import { extractUrls } from "./url-utils.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(moduleDir, "..");
export const EXPORT_DIR = path.join(PROJECT_ROOT, "export");
const TEMP_DIR = path.join(PROJECT_ROOT, ".temp");
const WEB_DIR = path.join(PROJECT_ROOT, "web");

export function openPath(targetPath) {
  const command =
    process.platform === "win32"
      ? { file: "explorer.exe", args: [targetPath] }
      : process.platform === "darwin"
        ? { file: "open", args: [targetPath] }
        : { file: "xdg-open", args: [targetPath] };
  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

export function createApp({ manager, exportDir = EXPORT_DIR, openFolder = openPath }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/u }));
  app.use(express.json({ limit: "128kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, exportDir, platform: process.platform });
  });
  app.get("/api/jobs", (_request, response) => {
    response.json({ jobs: manager.list() });
  });
  app.get("/api/jobs/:id", (request, response) => {
    const job = manager.get(request.params.id);
    if (!job) return response.status(404).json({ error: "任务不存在" });
    return response.json({ job });
  });
  app.post("/api/jobs", (request, response) => {
    const urls = extractUrls(request.body?.text ?? "");
    if (!urls.length) return response.status(400).json({ error: "请粘贴至少一个有效网页链接" });
    if (urls.length > 20) return response.status(400).json({ error: "每次最多提交 20 个链接" });
    const proxy = String(request.body?.proxy ?? "").trim();
    if (proxy && !/^(?:https?|socks[45]?):\/\//iu.test(proxy)) {
      return response.status(400).json({ error: "代理地址格式不正确" });
    }
    const jobs = manager.enqueue(urls, { proxy });
    return response.status(202).json({ jobs });
  });
  app.delete("/api/jobs", (_request, response) => {
    manager.clearFinished();
    response.status(204).end();
  });
  app.post("/api/open-export", (_request, response) => {
    openFolder(exportDir);
    response.json({ ok: true });
  });

  app.use(
    "/files",
    (request, response, next) => {
      try {
        if (decodeURIComponent(request.path).split(/[\\/]+/u).includes("..")) {
          return response.status(400).json({ error: "文件路径不合法" });
        }
      } catch {
        return response.status(400).json({ error: "文件路径不合法" });
      }
      return next();
    },
    express.static(exportDir, { dotfiles: "deny", index: false }),
  );
  app.use(express.static(WEB_DIR, { extensions: ["html"] }));
  app.get("*splat", (_request, response) => response.sendFile(path.join(WEB_DIR, "index.html")));
  return app;
}

export async function startLocalServer({ port = Number(process.env.PORT ?? 3210), open = true } = {}) {
  await Promise.all([
    fs.mkdir(EXPORT_DIR, { recursive: true }),
    fs.mkdir(TEMP_DIR, { recursive: true }),
  ]);
  const manager = new JobManager({
    download: createDownloader({ projectRoot: PROJECT_ROOT, exportDir: EXPORT_DIR, tempDir: TEMP_DIR }),
  });
  const app = createApp({ manager });
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`高清下载器已启动：${url}`);
  console.log(`视频保存目录：${EXPORT_DIR}`);
  if (open) setTimeout(() => openPath(url), 500);
  return { server, url, manager };
}

const isDirectRun =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  startLocalServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
