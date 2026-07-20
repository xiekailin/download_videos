import crypto from "node:crypto";

function publicJob(job) {
  const { proxy: _proxy, ...visible } = job;
  return { ...visible };
}

export class JobManager {
  constructor({ download }) {
    if (typeof download !== "function") throw new TypeError("download must be a function");
    this.download = download;
    this.jobs = new Map();
    this.queue = [];
    this.running = false;
    this.idleWaiters = [];
  }

  enqueue(urls, options = {}) {
    const created = urls.map((url) => {
      const job = {
        id: crypto.randomUUID(),
        url,
        proxy: String(options.proxy ?? "").trim(),
        status: "queued",
        progress: 0,
        message: "等待下载",
        createdAt: new Date().toISOString(),
      };
      this.jobs.set(job.id, job);
      this.queue.push(job.id);
      return publicJob(job);
    });
    void this.#drain();
    return created;
  }

  get(id) {
    const job = this.jobs.get(id);
    return job ? publicJob(job) : null;
  }

  list() {
    return [...this.jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(publicJob);
  }

  clearFinished() {
    for (const [id, job] of this.jobs) {
      if (["completed", "failed"].includes(job.status)) this.jobs.delete(id);
    }
  }

  whenIdle() {
    if (!this.running && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  async #drain() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const id = this.queue.shift();
      const job = this.jobs.get(id);
      if (!job) continue;
      Object.assign(job, {
        status: "running",
        progress: Math.max(job.progress, 1),
        message: "正在解析网页",
        startedAt: new Date().toISOString(),
      });

      const update = (fields) => {
        if (fields.progress !== undefined) {
          fields.progress = Math.max(0, Math.min(99, Number(fields.progress) || 0));
        }
        Object.assign(job, fields);
      };

      try {
        const result = await this.download({
          id: job.id,
          url: job.url,
          proxy: job.proxy,
          update,
        });
        Object.assign(job, result, {
          status: "completed",
          progress: 100,
          message: "下载完成",
          finishedAt: new Date().toISOString(),
        });
      } catch (error) {
        Object.assign(job, {
          status: "failed",
          progress: 100,
          message: "下载失败",
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString(),
        });
      }
    }

    this.running = false;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}
