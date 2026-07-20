import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { JobManager } from "../local/job-manager.mjs";
import { createApp } from "../local/server.mjs";

describe("one-click browser flow", () => {
  let browser;
  let exportDir;
  let server;
  let baseUrl;

  beforeAll(async () => {
    exportDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-downloader-e2e-"));
    const manager = new JobManager({
      download: async ({ url, update }) => {
        const filename = url.includes("idle-poll-test.shtml")
          ? "idle-poll-test.shtml.mp4"
          : "完成视频.mp4";
        update({ progress: 55, message: "正在下载高清数据" });
        await new Promise((resolve) => setTimeout(resolve, 30));
        await fs.writeFile(path.join(exportDir, filename), "demo");
        return {
          filename,
          size: 4,
          width: 1280,
          height: 720,
          duration: 72,
        };
      },
    });
    const app = createApp({ manager, exportDir, openFolder: () => {} });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((resolve) => server?.close(resolve));
    await fs.rm(exportDir, { recursive: true, force: true });
  });

  it("submits a link and shows the finished 720p file", async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl);
    await page.getByLabel("视频网页链接").fill("https://tv.cctv.com/test.shtml");
    await page.getByRole("button", { name: "开始下载" }).click();

    await expect.poll(async () => page.getByText("下载完成").count()).toBe(1);
    await expect.poll(async () => page.getByText("1280 × 720").count()).toBe(1);
    await expect.poll(async () => page.getByRole("link", { name: "下载文件" }).count()).toBe(1);
    const progressTransition = await page.locator(".progress-bar").evaluate(
      (element) => getComputedStyle(element).transitionProperty,
    );
    expect(progressTransition).toBe("transform");
    await page.close();
  });

  it("avoids scroll-time backdrop filtering on the download panel", async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl);

    const backdropFilter = await page.locator(".download-panel").evaluate(
      (element) => getComputedStyle(element).backdropFilter,
    );

    expect(backdropFilter).toBe("none");
    await page.close();
  });

  it("does not rebuild an unchanged task list during idle polling", async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl);
    await page.getByLabel("视频网页链接").fill("https://tv.cctv.com/idle-poll-test.shtml");
    await page.getByRole("button", { name: "开始下载" }).click();
    const idleTask = page.locator(".task-card").filter({ hasText: "idle-poll-test.shtml" });
    await expect.poll(async () => idleTask.getByText("下载完成").count()).toBe(1);

    await page.evaluate(() => {
      window.taskListMutationCount = 0;
      const observer = new MutationObserver((mutations) => {
        window.taskListMutationCount += mutations.length;
      });
      observer.observe(document.querySelector("#task-list"), {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    });

    await page.waitForTimeout(2_800);

    const mutationCount = await page.evaluate(() => window.taskListMutationCount);
    expect(mutationCount).toBe(0);
    await page.close();
  });
});
