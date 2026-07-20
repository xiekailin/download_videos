import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ONLINE_ARCHIVE_CONFIG = Object.freeze({
  directoryName: "HD-Video-Downloader-Windows-Online",
  archiveName: "HD-Video-Downloader-Windows-Online.zip",
});

const ROOT_FILES = Object.freeze([
  "START_HERE.bat",
  "README.md",
  "package.json",
  "package-lock.json",
  "scripts/install-tools.mjs",
  "export/.gitkeep",
]);
const SOURCE_DIRECTORIES = Object.freeze(["local", "web", "scripts/windows-online"]);
const REQUIRED_FILES = Object.freeze([
  "START_HERE.bat",
  "package.json",
  "package-lock.json",
  "local/server.mjs",
  "web/index.html",
  "scripts/install-tools.mjs",
  "scripts/windows-online/install-and-start.bat",
  "export/.gitkeep",
]);

async function filesBelow(projectRoot, relativeDirectory) {
  const directory = path.join(projectRoot, relativeDirectory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(projectRoot, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

export async function onlineSourceFiles(projectRoot) {
  const sourceFiles = await Promise.all(
    SOURCE_DIRECTORIES.map((directory) => filesBelow(projectRoot, directory)),
  );
  return [...ROOT_FILES, ...sourceFiles.flat()].sort();
}

export async function copyOnlineSourceFiles(projectRoot, destination) {
  const files = await onlineSourceFiles(projectRoot);
  for (const relativePath of files) {
    const source = path.join(projectRoot, ...relativePath.split("/"));
    const target = path.join(destination, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (relativePath.endsWith(".bat")) {
      const contents = await fs.readFile(source, "utf8");
      await fs.writeFile(target, contents.replace(/\r?\n/gu, "\r\n"), "utf8");
    } else {
      await fs.copyFile(source, target);
    }
  }
}

export async function assertOnlineArchiveContents(directory) {
  const missing = [];
  for (const relativePath of REQUIRED_FILES) {
    try {
      await fs.access(path.join(directory, ...relativePath.split("/")));
    } catch {
      missing.push(relativePath);
    }
  }
  if (missing.length > 0) {
    throw new Error(`源码包缺少必要文件：${missing.join(", ")}`);
  }
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} 执行失败，退出码：${code}`));
    });
  });
}

export async function buildOnlineSourceArchive(projectRoot) {
  if (process.platform !== "darwin") {
    throw new Error("此打包入口需要在 macOS 上运行");
  }

  const distDirectory = path.join(projectRoot, "dist");
  const outputDirectory = path.join(distDirectory, ONLINE_ARCHIVE_CONFIG.directoryName);
  const archivePath = path.join(distDirectory, ONLINE_ARCHIVE_CONFIG.archiveName);
  await fs.mkdir(distDirectory, { recursive: true });
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.rm(archivePath, { force: true });
  await copyOnlineSourceFiles(projectRoot, outputDirectory);
  await assertOnlineArchiveContents(outputDirectory);
  await run("/usr/bin/ditto", [
    "-c",
    "-k",
    "--norsrc",
    "--keepParent",
    outputDirectory,
    archivePath,
  ]);
  return archivePath;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const projectRoot = path.resolve(path.dirname(currentFile), "..");
  const archivePath = await buildOnlineSourceArchive(projectRoot);
  console.log(`Windows 在线安装版已生成：${archivePath}`);
}
