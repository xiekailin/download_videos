import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PORTABLE_CONFIG,
  archiveCheckDirectory,
  assertPortableContents,
  extractedPortableRoot,
  launcherScript,
  npmInstallCommand,
  portablePaths,
  prunePortableDependencies,
  smokeTestPlan,
  smokeTestScript,
} from "../scripts/build-windows-portable.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeTemporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "windows-portable-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function touch(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "test");
}

describe("Windows 便携包配置", () => {
  it("使用固定版本与带版本的官方下载地址", () => {
    expect(PORTABLE_CONFIG.node.version).toMatch(/^v\d+\.\d+\.\d+$/u);
    expect(PORTABLE_CONFIG.node.url).toContain(`/${PORTABLE_CONFIG.node.version}/`);
    expect(PORTABLE_CONFIG.ytDlp.version).toMatch(/^\d{4}\.\d{2}\.\d{2}$/u);
    expect(PORTABLE_CONFIG.ytDlp.url).toContain(
      `/releases/download/${PORTABLE_CONFIG.ytDlp.version}/yt-dlp.exe`,
    );
    expect(PORTABLE_CONFIG.node.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(PORTABLE_CONFIG.ytDlp.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("ZIP 解压后只需进入一层目录即可找到启动器", () => {
    expect(extractedPortableRoot("C:\\archive-check")).toBe(
      path.join("C:\\archive-check", PORTABLE_CONFIG.directoryName),
    );
  });

  it("在包含中文和空格的路径中验证 ZIP", () => {
    expect(archiveCheckDirectory("C:\\temp")).toBe(
      path.join("C:\\temp", "中文 空格路径", "archive-check"),
    );
  });

  it("Actions 直接上传成品目录，避免下载后出现双层 ZIP", async () => {
    const workflow = await fs.readFile(
      path.join(process.cwd(), ".github", "workflows", "build-windows-portable.yml"),
      "utf8",
    );

    expect(workflow).toContain(`path: dist/${PORTABLE_CONFIG.directoryName}`);
    expect(workflow).not.toContain(`path: dist/${PORTABLE_CONFIG.archiveName}`);
  });

  it("启动器只使用包内 Node 和 Chromium", () => {
    const launcher = launcherScript();

    expect(launcher).toContain('"%APP_DIR%runtime\\node\\node.exe" local\\server.mjs');
    expect(launcher).toContain(
      'set "PLAYWRIGHT_BROWSERS_PATH=%APP_DIR%runtime\\ms-playwright"',
    );
    expect(launcher).toContain('cd /d "%APP_DIR%"');
    expect(launcher).not.toMatch(/\b(?:npm|npx)\b/iu);
  });

  it("在 Windows 上通过 cmd.exe 执行 npm.cmd", () => {
    expect(npmInstallCommand("win32", "C:\\Windows\\System32\\cmd.exe")).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd ci --omit=dev --no-audit --no-fund"],
    });
  });

  it("冒烟测试直接运行包内的四个命令行组件", () => {
    const rootDirectory = "C:\\portable";
    const paths = portablePaths(rootDirectory);

    expect(smokeTestPlan(rootDirectory)).toEqual([
      { name: "Node.js", file: paths.nodeExecutable, args: ["--version"] },
      { name: "FFmpeg", file: paths.ffmpegExecutable, args: ["-version"] },
      { name: "FFprobe", file: paths.ffprobeExecutable, args: ["-version"] },
      { name: "yt-dlp", file: paths.ytDlpExecutable, args: ["--version"] },
    ]);
  });

  it("冒烟脚本启动 Chromium 并访问随机端口的健康检查", () => {
    const script = smokeTestScript();

    expect(script).toContain("await chromium.launch({ headless: true })");
    expect(script).toContain("startLocalServer({ port: 0, open: false })");
    expect(script).toContain('fetch(`${url}/api/health`)');
  });

  it("只保留 FFprobe Windows x64 二进制与许可证", async () => {
    const directory = await makeTemporaryDirectory();
    const packageDirectory = path.join(directory, "node_modules", "ffprobe-static");
    await Promise.all([
      touch(path.join(packageDirectory, "LICENSE")),
      touch(path.join(packageDirectory, "bin", "win32", "x64", "ffprobe.exe")),
      touch(path.join(packageDirectory, "bin", "win32", "ia32", "ffprobe.exe")),
      touch(path.join(packageDirectory, "bin", "darwin", "arm64", "ffprobe")),
      touch(path.join(packageDirectory, "bin", "linux", "x64", "ffprobe")),
    ]);

    await prunePortableDependencies(directory);

    await expect(fs.access(path.join(packageDirectory, "LICENSE"))).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(packageDirectory, "bin", "win32", "x64", "ffprobe.exe")),
    ).resolves.toBeUndefined();
    await expect(fs.access(path.join(packageDirectory, "bin", "win32", "ia32"))).rejects.toThrow();
    await expect(fs.access(path.join(packageDirectory, "bin", "darwin"))).rejects.toThrow();
    await expect(fs.access(path.join(packageDirectory, "bin", "linux"))).rejects.toThrow();
  });

  it("在必要组件不全时拒绝生成成品", async () => {
    const directory = await makeTemporaryDirectory();

    await expect(assertPortableContents(directory)).rejects.toThrow("便携包缺少");
  });

  it("在第三方许可证不全时拒绝生成成品", async () => {
    const directory = await makeTemporaryDirectory();
    const paths = portablePaths(directory);
    await Promise.all([
      touch(paths.nodeExecutable),
      touch(paths.ytDlpExecutable),
      touch(paths.ffmpegExecutable),
      touch(paths.ffprobeExecutable),
      touch(path.join(paths.browserDirectory, "chromium-1234", "chrome-win", "chrome.exe")),
      touch(paths.launcher),
      touch(path.join(directory, "local", "server.mjs")),
      touch(path.join(directory, "web", "index.html")),
    ]);

    await expect(assertPortableContents(directory)).rejects.toThrow("LICENSE");
  });

  it("接受包含 Node、Chromium、FFmpeg、FFprobe 和 yt-dlp 的目录", async () => {
    const directory = await makeTemporaryDirectory();
    const paths = portablePaths(directory);

    await Promise.all([
      touch(paths.nodeExecutable),
      touch(paths.ytDlpExecutable),
      touch(paths.ffmpegExecutable),
      touch(paths.ffprobeExecutable),
      touch(path.join(paths.browserDirectory, "chromium-1234", "chrome-win", "chrome.exe")),
      touch(paths.launcher),
      touch(path.join(directory, "local", "server.mjs")),
      touch(path.join(directory, "web", "index.html")),
      touch(path.join(directory, "runtime", "node", "LICENSE")),
      touch(path.join(directory, "node_modules", "playwright", "LICENSE")),
      touch(path.join(directory, "node_modules", "ffmpeg-static", "LICENSE")),
      touch(path.join(directory, "node_modules", "ffmpeg-static", "ffmpeg.LICENSE")),
      touch(path.join(directory, "node_modules", "ffprobe-static", "LICENSE")),
      touch(path.join(directory, "第三方组件说明.txt")),
    ]);

    await expect(assertPortableContents(directory)).resolves.toBeUndefined();
  });
});
