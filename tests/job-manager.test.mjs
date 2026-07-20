import { describe, expect, it } from "vitest";

import { JobManager } from "../local/job-manager.mjs";

describe("JobManager", () => {
  it("requires a download function", () => {
    expect(() => new JobManager({})).toThrow(TypeError);
  });

  it("runs jobs sequentially and exposes progress", async () => {
    const events = [];
    const manager = new JobManager({
      download: async ({ url, update }) => {
        events.push(`start:${url}`);
        update({ progress: 45, message: "正在下载" });
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end:${url}`);
        return {
          filename: `${url.at(-1)}.mp4`,
          size: 1024,
          width: 1280,
          height: 720,
          duration: 10,
        };
      },
    });

    const jobs = manager.enqueue([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    await manager.whenIdle();

    expect(events).toEqual([
      "start:https://example.com/a",
      "end:https://example.com/a",
      "start:https://example.com/b",
      "end:https://example.com/b",
    ]);
    expect(manager.get(jobs[0].id)).toMatchObject({
      status: "completed",
      progress: 100,
      width: 1280,
      height: 720,
    });
  });

  it("records a failed download without stopping the remaining queue", async () => {
    let calls = 0;
    const manager = new JobManager({
      download: async ({ url }) => {
        calls += 1;
        if (url.endsWith("bad")) throw new Error("下载失败");
        return { filename: "ok.mp4", size: 1 };
      },
    });

    const jobs = manager.enqueue([
      "https://example.com/bad",
      "https://example.com/good",
    ]);
    await manager.whenIdle();

    expect(calls).toBe(2);
    expect(manager.get(jobs[0].id)).toMatchObject({
      status: "failed",
      error: "下载失败",
    });
    expect(manager.get(jobs[1].id).status).toBe("completed");
  });

  it("supports immediate idle checks, missing jobs, proxy values and cleanup", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const manager = new JobManager({
      download: async ({ proxy, update }) => {
        expect(proxy).toBe("http://127.0.0.1:7897");
        update({ message: "只更新文字" });
        update({ progress: "invalid" });
        await gate;
        return { filename: "ok.mp4" };
      },
    });

    await manager.whenIdle();
    expect(manager.get("missing")).toBeNull();
    const [job] = manager.enqueue(["https://example.com/one"], {
      proxy: " http://127.0.0.1:7897 ",
    });
    manager.enqueue([], {});
    manager.clearFinished();
    expect(manager.get(job.id).status).toBe("running");
    release();
    await manager.whenIdle();
    manager.clearFinished();
    expect(manager.list()).toEqual([]);
  });

  it("stringifies non-Error failures", async () => {
    const manager = new JobManager({ download: async () => { throw "站点拒绝访问"; } });
    const [job] = manager.enqueue(["https://example.com/fail"]);
    await manager.whenIdle();
    expect(manager.get(job.id).error).toBe("站点拒绝访问");
  });
});
