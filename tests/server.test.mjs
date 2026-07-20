import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobManager } from "../local/job-manager.mjs";
import { createApp } from "../local/server.mjs";

describe("local HTTP API", () => {
  let exportDir;
  let server;
  let baseUrl;

  beforeEach(async () => {
    exportDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-downloader-test-"));
    const manager = new JobManager({
      download: async ({ url }) => ({
        filename: `${new URL(url).hostname}.mp4`,
        size: 2048,
      }),
    });
    const app = createApp({ manager, exportDir, openFolder: vi.fn() });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(exportDir, { recursive: true, force: true });
  });

  it("reports health and export directory", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true });
    expect(data.exportDir).toBe(exportDir);
  });

  it("accepts several pasted links and returns jobs", async () => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "https://tv.cctv.com/a\nhttps://www.qstheory.cn/b",
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.jobs).toHaveLength(2);
  });

  it("rejects an empty or invalid submission", async () => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "not a URL" }),
    });

    expect(response.status).toBe(400);
  });

  it("serves completed files only from export", async () => {
    await fs.writeFile(path.join(exportDir, "demo.mp4"), "video");
    const ok = await fetch(`${baseUrl}/files/demo.mp4`);
    const blocked = await fetch(`${baseUrl}/files/..%2Fpackage.json`);

    expect(await ok.text()).toBe("video");
    expect(blocked.status).toBeGreaterThanOrEqual(400);
  });
});
