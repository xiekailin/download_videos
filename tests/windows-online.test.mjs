import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ONLINE_ARCHIVE_CONFIG,
  assertOnlineArchiveContents,
  copyOnlineSourceFiles,
  onlineSourceFiles,
} from "../scripts/build-windows-online-source.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeTemporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "windows-online-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("Windows 首次联网安装器", () => {
  it("根启动器从自身目录调用在线安装脚本", async () => {
    const launcher = await fs.readFile(path.join(projectRoot, "START_HERE.bat"), "utf8");

    expect(launcher).toContain(
      'set "INSTALLER=%~dp0scripts\\windows-online\\install-and-start.bat"',
    );
    expect(launcher).toContain('if not exist "%INSTALLER%"');
    expect(launcher).toContain('cmd.exe /d /c call "%INSTALLER%"');
    expect(launcher).toContain('set "EXIT_CODE=%ERRORLEVEL%"');
  });

  it("内层脚本提前退出时根启动器仍显示错误并暂停", async () => {
    const launcher = await fs.readFile(path.join(projectRoot, "START_HERE.bat"), "utf8");

    expect(launcher).toContain("Startup failed, exit code: %EXIT_CODE%");
    expect(launcher).toContain("startup_logs");
    expect(launcher).toMatch(
      /if not "%EXIT_CODE%"=="0" \([\s\S]*pause[\s\S]*exit \/b %EXIT_CODE%[\s\S]*\)/u,
    );
    expect(launcher).toMatch(/The downloader has stopped\.[\s\S]*pause/u);
  });

  it("检测 Node 20，并在缺失或版本过低时通过 winget 安装 LTS", async () => {
    const installer = await fs.readFile(
      path.join(projectRoot, "scripts", "windows-online", "install-and-start.bat"),
      "utf8",
    );

    expect(installer).toContain(
      'node -e "process.exit(Number(process.versions.node.split(\'.\')[0]) >= 20 ? 0 : 1)"',
    );
    expect(installer).toContain("winget --version");
    expect(installer).toContain("OpenJS.NodeJS.LTS");
    expect(installer).toContain("--accept-package-agreements");
    expect(installer).toContain("--accept-source-agreements");
    expect(installer).toContain('reg query "HKCU\\Environment" /v Path');
    expect(installer).toContain(
      'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path',
    );
    expect(installer.match(/call :check_node/g)).toHaveLength(2);
  });

  it("只在首次启动、锁文件变化或组件不完整时重装依赖", async () => {
    const installer = await fs.readFile(
      path.join(projectRoot, "scripts", "windows-online", "install-and-start.bat"),
      "utf8",
    );

    expect(installer).toContain("certutil -hashfile");
    expect(installer).toContain("package-lock.sha256");
    expect(installer).toContain('fc /b "%LOCK_HASH%" "%LOCK_HASH_TMP%"');
    expect(installer).toContain("call npm.cmd ci --omit=dev --no-audit --no-fund");
    expect(installer).toContain("node_modules\\.bin\\playwright.cmd\" install chromium");
    expect(installer).toContain("node scripts\\install-tools.mjs");
    expect(installer).toContain("chromium.executablePath()");
    expect(installer).toContain("tools/yt-dlp.exe");
    expect(installer).toContain('move /y "%LOCK_HASH_TMP%" "%LOCK_HASH%"');
  });

  it("把 Chromium 和运行状态保存在项目内并从带空格路径启动服务", async () => {
    const installer = await fs.readFile(
      path.join(projectRoot, "scripts", "windows-online", "install-and-start.bat"),
      "utf8",
    );

    expect(installer).toContain('set "APP_DIR=%~dp0..\\.."');
    expect(installer).toContain('for %%I in ("%APP_DIR%") do set "APP_DIR=%%~fI"');
    expect(installer).toContain('cd /d "%APP_DIR%"');
    expect(installer).toContain(
      'set "PLAYWRIGHT_BROWSERS_PATH=%STATE_DIR%\\ms-playwright"',
    );
    expect(installer).toContain("node local\\server.mjs");
  });

  it("每次启动写日志，失败时显示路径并暂停窗口", async () => {
    const installer = await fs.readFile(
      path.join(projectRoot, "scripts", "windows-online", "install-and-start.bat"),
      "utf8",
    );

    expect(installer).toContain('set "LOG_DIR=%APP_DIR%\\startup_logs"');
    expect(installer).toContain('set "LOG_FILE=%LOG_DIR%\\startup_');
    expect(installer).toContain("启动失败，错误码");
    expect(installer).toContain("详细日志：%LOG_FILE%");
    expect(installer).toMatch(/:failed[\s\S]*pause[\s\S]*exit \/b %EXIT_CODE%/u);
  });
});

describe("Windows 在线安装版源码 ZIP", () => {
  it("只收集运行所需源码并保留 export 占位文件", async () => {
    const files = await onlineSourceFiles(projectRoot);

    expect(files).toContain("START_HERE.bat");
    expect(files).toContain("package-lock.json");
    expect(files).toContain("local/server.mjs");
    expect(files).toContain("web/index.html");
    expect(files).toContain("scripts/install-tools.mjs");
    expect(files).toContain("scripts/windows-online/install-and-start.bat");
    expect(files).toContain("export/.gitkeep");
    expect(files).not.toContain("start.command");
    expect(files).not.toContain("tests/windows-online.test.mjs");
    expect(files.every((file) => !file.startsWith("node_modules/"))).toBe(true);
    expect(files.every((file) => !file.startsWith("tools/"))).toBe(true);
    expect(files.every((file) => !file.startsWith(".git/"))).toBe(true);
    expect(files.every((file) => !file.startsWith("dist/"))).toBe(true);
  });

  it("复制到带中文和空格的目录后不带本机运行产物", async () => {
    const destinationParent = await makeTemporaryDirectory();
    const destination = path.join(destinationParent, "中文 空格", ONLINE_ARCHIVE_CONFIG.directoryName);

    await copyOnlineSourceFiles(projectRoot, destination);

    await expect(fs.access(path.join(destination, "START_HERE.bat"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(destination, "export", ".gitkeep"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(destination, "node_modules"))).rejects.toThrow();
    await expect(fs.access(path.join(destination, "startup_logs"))).rejects.toThrow();
    await expect(assertOnlineArchiveContents(destination)).resolves.toBeUndefined();

    const launcher = await fs.readFile(path.join(destination, "START_HERE.bat"), "utf8");
    expect(launcher).toContain("\r\n");
    expect(launcher.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("成品缺少启动器时拒绝打包", async () => {
    const destination = await makeTemporaryDirectory();

    await expect(assertOnlineArchiveContents(destination)).rejects.toThrow("源码包缺少");
  });

  it("macOS 打包入口可执行且输出到被忽略的 dist", async () => {
    const commandPath = path.join(projectRoot, "build-windows-online-zip.command");
    const [command, gitignore, stats] = await Promise.all([
      fs.readFile(commandPath, "utf8"),
      fs.readFile(path.join(projectRoot, ".gitignore"), "utf8"),
      fs.stat(commandPath),
    ]);

    expect(command).toContain('node "$SCRIPT_DIR/scripts/build-windows-online-source.mjs"');
    expect(command).toContain('cd "$SCRIPT_DIR"');
    expect(gitignore).toContain("dist/");
    expect(gitignore).toContain("startup_logs/");
    expect(gitignore).toContain(".windows-runtime/");
    expect(stats.mode & 0o111).not.toBe(0);
  });

  it("GitHub Actions 在真实 Windows 中文空格路径中执行首次启动", async () => {
    const workflow = await fs.readFile(
      path.join(projectRoot, ".github", "workflows", "test-windows-online.yml"),
      "utf8",
    );

    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("START_HERE.bat");
    expect(workflow).toContain("中文 空格");
    expect(workflow).toContain("http://127.0.0.1:3210/api/health");
    expect(workflow).toContain("startup_logs");
    expect(workflow).toContain("tools\\yt-dlp.exe");
  });
});
