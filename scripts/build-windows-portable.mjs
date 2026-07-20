import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runProcess } from "../local/process-utils.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const launcherTemplate = path.join(scriptDirectory, "windows-portable", "启动下载器.bat");

export const PORTABLE_CONFIG = Object.freeze({
  directoryName: "高清视频下载器-Windows-x64",
  archiveName: "HD-Video-Downloader-Windows-x64.zip",
  node: Object.freeze({
    version: "v22.23.1",
    sha256: "7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29",
    url: "https://nodejs.org/dist/v22.23.1/node-v22.23.1-win-x64.zip",
  }),
  ytDlp: Object.freeze({
    version: "2026.07.04",
    sha256: "52fe3c26dcf71fbdc85b528589020bb0b8e383155cfa81b64dd447bbe35e24b8",
    url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe",
  }),
});

export function launcherScript() {
  return fsSync.readFileSync(launcherTemplate, "utf8");
}

export function portablePaths(rootDirectory) {
  return {
    nodeExecutable: path.join(rootDirectory, "runtime", "node", "node.exe"),
    browserDirectory: path.join(rootDirectory, "runtime", "ms-playwright"),
    ytDlpExecutable: path.join(rootDirectory, "tools", "yt-dlp.exe"),
    ffmpegExecutable: path.join(rootDirectory, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    ffprobeExecutable: path.join(
      rootDirectory,
      "node_modules",
      "ffprobe-static",
      "bin",
      "win32",
      "x64",
      "ffprobe.exe",
    ),
    launcher: path.join(rootDirectory, "启动下载器.bat"),
  };
}

export function extractedPortableRoot(extractionDirectory) {
  return path.join(extractionDirectory, PORTABLE_CONFIG.directoryName);
}

export function archiveCheckDirectory(temporaryDirectory) {
  return path.join(temporaryDirectory, "中文 空格路径", "archive-check");
}

async function findFileNamed(directory, names) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && names.has(entry.name.toLowerCase())) return true;
    if (entry.isDirectory() && (await findFileNamed(entryPath, names))) return true;
  }
  return false;
}

async function isFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function assertPortableContents(rootDirectory) {
  const paths = portablePaths(rootDirectory);
  const requiredFiles = [
    paths.nodeExecutable,
    paths.ytDlpExecutable,
    paths.ffmpegExecutable,
    paths.ffprobeExecutable,
    paths.launcher,
    path.join(rootDirectory, "local", "server.mjs"),
    path.join(rootDirectory, "web", "index.html"),
    path.join(rootDirectory, "runtime", "node", "LICENSE"),
    path.join(rootDirectory, "node_modules", "playwright", "LICENSE"),
    path.join(rootDirectory, "node_modules", "ffmpeg-static", "LICENSE"),
    path.join(rootDirectory, "node_modules", "ffmpeg-static", "ffmpeg.LICENSE"),
    path.join(rootDirectory, "node_modules", "ffprobe-static", "LICENSE"),
    path.join(rootDirectory, "第三方组件说明.txt"),
  ];
  const missing = [];
  for (const requiredFile of requiredFiles) {
    if (!(await isFile(requiredFile))) missing.push(path.relative(rootDirectory, requiredFile));
  }
  const hasChromium = await findFileNamed(
    paths.browserDirectory,
    new Set(["chrome.exe", "headless_shell.exe"]),
  );
  if (!hasChromium) missing.push("runtime\\ms-playwright\\...\\chrome.exe");
  if (missing.length) throw new Error(`便携包缺少必要组件：${missing.join("、")}`);
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await pipeline(fsSync.createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function downloadVerified({ url, sha256: expectedSha256 }, destination) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(600_000) });
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 (${response.status})：${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), fsSync.createWriteStream(destination));
  const actualSha256 = await sha256(destination);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA-256 校验失败：${path.basename(destination)}\n期望 ${expectedSha256}\n实际 ${actualSha256}`,
    );
  }
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function expandZip(archivePath, destination) {
  const command = [
    `$ErrorActionPreference = 'Stop'`,
    `Expand-Archive -LiteralPath ${quotePowerShell(archivePath)} -DestinationPath ${quotePowerShell(destination)} -Force`,
  ].join("; ");
  await runProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
}

async function compressDirectory(sourceDirectory, archivePath) {
  const command = [
    `$ErrorActionPreference = 'Stop'`,
    `Compress-Archive -LiteralPath ${quotePowerShell(sourceDirectory)} -DestinationPath ${quotePowerShell(archivePath)} -CompressionLevel Optimal -Force`,
  ].join("; ");
  await runProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    timeout: 30 * 60_000,
  });
}

async function copyApplicationFiles(portableRoot) {
  for (const directory of ["local", "web"]) {
    await fs.cp(path.join(projectRoot, directory), path.join(portableRoot, directory), {
      recursive: true,
    });
  }
  for (const fileName of ["package.json", "package-lock.json"]) {
    await fs.copyFile(path.join(projectRoot, fileName), path.join(portableRoot, fileName));
  }
  await fs.mkdir(path.join(portableRoot, "export"), { recursive: true });
  await fs.mkdir(path.join(portableRoot, "tools"), { recursive: true });
  await fs.copyFile(launcherTemplate, portablePaths(portableRoot).launcher);
}

export function npmInstallCommand(platform = process.platform, commandShell = process.env.ComSpec) {
  if (platform === "win32") {
    return {
      file: commandShell || "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd ci --omit=dev --no-audit --no-fund"],
    };
  }
  return { file: "npm", args: ["ci", "--omit=dev", "--no-audit", "--no-fund"] };
}

export async function prunePortableDependencies(portableRoot) {
  const ffprobeBin = path.join(portableRoot, "node_modules", "ffprobe-static", "bin");
  await Promise.all(
    [
      path.join(ffprobeBin, "darwin"),
      path.join(ffprobeBin, "linux"),
      path.join(ffprobeBin, "win32", "ia32"),
    ].map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
}

async function installProductionDependencies(portableRoot) {
  const npm = npmInstallCommand();
  await runProcess(npm.file, npm.args, {
    cwd: portableRoot,
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
    timeout: 20 * 60_000,
  });
  const browserDirectory = portablePaths(portableRoot).browserDirectory;
  await fs.mkdir(browserDirectory, { recursive: true });
  await runProcess(
    process.execPath,
    [path.join(portableRoot, "node_modules", "playwright", "cli.js"), "install", "chromium"],
    {
      cwd: portableRoot,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserDirectory },
      timeout: 20 * 60_000,
    },
  );
  await prunePortableDependencies(portableRoot);
}

async function installNodeRuntime(portableRoot, temporaryDirectory) {
  const archivePath = path.join(temporaryDirectory, "node-win-x64.zip");
  const expandedDirectory = path.join(temporaryDirectory, "node-expanded");
  await downloadVerified(PORTABLE_CONFIG.node, archivePath);
  await expandZip(archivePath, expandedDirectory);
  const extractedRoot = path.join(
    expandedDirectory,
    `node-${PORTABLE_CONFIG.node.version}-win-x64`,
  );
  await fs.mkdir(path.join(portableRoot, "runtime"), { recursive: true });
  await fs.rename(extractedRoot, path.join(portableRoot, "runtime", "node"));
}

async function writeBuildManifest(portableRoot) {
  const packageLock = JSON.parse(await fs.readFile(path.join(projectRoot, "package-lock.json"), "utf8"));
  const packages = packageLock.packages ?? {};
  const lines = [
    `Build time (UTC): ${new Date().toISOString()}`,
    `Node.js: ${PORTABLE_CONFIG.node.version}`,
    `Node.js SHA-256: ${PORTABLE_CONFIG.node.sha256}`,
    `yt-dlp: ${PORTABLE_CONFIG.ytDlp.version}`,
    `yt-dlp SHA-256: ${PORTABLE_CONFIG.ytDlp.sha256}`,
    `Playwright: ${packages["node_modules/playwright"]?.version ?? "unknown"}`,
    `ffmpeg-static: ${packages["node_modules/ffmpeg-static"]?.version ?? "unknown"}`,
    `ffprobe-static: ${packages["node_modules/ffprobe-static"]?.version ?? "unknown"}`,
    "Architecture: Windows x64",
  ];
  await fs.writeFile(path.join(portableRoot, "版本信息.txt"), `${lines.join("\r\n")}\r\n`, "utf8");
  const notices = [
    "第三方组件与许可证说明",
    "",
    `Node.js ${PORTABLE_CONFIG.node.version} (MIT): runtime\\node\\LICENSE`,
    `yt-dlp ${PORTABLE_CONFIG.ytDlp.version} (The Unlicense): https://github.com/yt-dlp/yt-dlp/blob/${PORTABLE_CONFIG.ytDlp.version}/LICENSE`,
    `Playwright ${packages["node_modules/playwright"]?.version ?? "unknown"} (Apache-2.0): node_modules\\playwright\\LICENSE`,
    "Chromium: 由 Playwright 官方安装器下载，源码与许可说明 https://www.chromium.org/Home/",
    `ffmpeg-static ${packages["node_modules/ffmpeg-static"]?.version ?? "unknown"} (GPL-3.0-or-later): node_modules\\ffmpeg-static\\LICENSE 及 ffmpeg.LICENSE`,
    `ffprobe-static ${packages["node_modules/ffprobe-static"]?.version ?? "unknown"} (MIT): node_modules\\ffprobe-static\\LICENSE`,
    "其他 npm 依赖的许可证文件保留在各自 node_modules 子目录中。",
  ];
  await fs.writeFile(
    path.join(portableRoot, "第三方组件说明.txt"),
    `${notices.join("\r\n")}\r\n`,
    "utf8",
  );
}

export function smokeTestPlan(rootDirectory) {
  const paths = portablePaths(rootDirectory);
  return [
    { name: "Node.js", file: paths.nodeExecutable, args: ["--version"] },
    { name: "FFmpeg", file: paths.ffmpegExecutable, args: ["-version"] },
    { name: "FFprobe", file: paths.ffprobeExecutable, args: ["-version"] },
    { name: "yt-dlp", file: paths.ytDlpExecutable, args: ["--version"] },
  ];
}

export function smokeTestScript() {
  return `import { chromium } from "./node_modules/playwright/index.mjs";
import { startLocalServer } from "./local/server.mjs";

let browser;
let server;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent("<title>portable-smoke</title><p>ok</p>");
  if ((await page.title()) !== "portable-smoke") throw new Error("Chromium page check failed");

  const started = await startLocalServer({ port: 0, open: false });
  server = started.server;
  const { url } = started;
  const response = await fetch(\`${"${url}"}/api/health\`);
  const health = await response.json();
  if (!response.ok || health.ok !== true) throw new Error("Server health check failed");
  console.log("Chromium and server health smoke tests passed");
} finally {
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
`;
}

export async function smokeTestPortable(portableRoot) {
  for (const command of smokeTestPlan(portableRoot)) {
    const result = await runProcess(command.file, command.args, {
      cwd: portableRoot,
      timeout: 30_000,
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (!output) throw new Error(`${command.name} 冒烟测试未返回版本信息`);
    if (command.name === "Node.js" && !output.includes(PORTABLE_CONFIG.node.version)) {
      throw new Error(`Node.js 版本不符：${output}`);
    }
    console.log(`  ${command.name}: ${output.split(/\r?\n/u)[0]}`);
  }

  const helperPath = path.join(portableRoot, ".portable-smoke.mjs");
  await fs.writeFile(helperPath, smokeTestScript(), "utf8");
  try {
    await runProcess(portablePaths(portableRoot).nodeExecutable, [helperPath], {
      cwd: portableRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: portablePaths(portableRoot).browserDirectory,
      },
      timeout: 120_000,
    });
  } finally {
    await fs.rm(helperPath, { force: true });
  }
}

async function verifyPortableArchive(archivePath, temporaryDirectory) {
  const extractionDirectory = archiveCheckDirectory(temporaryDirectory);
  await expandZip(archivePath, extractionDirectory);
  const extractedRoot = extractedPortableRoot(extractionDirectory);
  await assertPortableContents(extractedRoot);
  await smokeTestPortable(extractedRoot);
}

export async function buildWindowsPortable() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows 便携包必须在 Windows x64 环境中构建");
  }
  const distDirectory = path.join(projectRoot, "dist");
  const portableRoot = path.join(distDirectory, PORTABLE_CONFIG.directoryName);
  const archivePath = path.join(distDirectory, PORTABLE_CONFIG.archiveName);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "video-downloader-build-"));
  try {
    await fs.rm(portableRoot, { recursive: true, force: true });
    await fs.rm(archivePath, { force: true });
    await fs.mkdir(portableRoot, { recursive: true });

    console.log("1/7 复制应用文件");
    await copyApplicationFiles(portableRoot);
    console.log("2/7 安装 Windows 生产依赖与 Chromium");
    await installProductionDependencies(portableRoot);
    console.log("3/7 下载并校验 Windows Node.js");
    await installNodeRuntime(portableRoot, temporaryDirectory);
    console.log("4/7 下载并校验 yt-dlp");
    await downloadVerified(PORTABLE_CONFIG.ytDlp, portablePaths(portableRoot).ytDlpExecutable);
    await writeBuildManifest(portableRoot);
    console.log("5/7 校验便携包内容");
    await assertPortableContents(portableRoot);
    console.log("6/7 生成 ZIP");
    await compressDirectory(portableRoot, archivePath);
    console.log("7/7 解压 ZIP 并运行成品冒烟测试");
    await verifyPortableArchive(archivePath, temporaryDirectory);
    console.log(`Windows 便携包已生成：${archivePath}`);
    return archivePath;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const isDirectRun =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  buildWindowsPortable().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
