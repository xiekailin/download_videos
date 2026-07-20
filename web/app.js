const form = document.querySelector("#download-form");
const linksInput = document.querySelector("#video-links");
const proxyInput = document.querySelector("#proxy");
const submitButton = document.querySelector("#submit-button");
const pasteButton = document.querySelector("#paste-button");
const taskList = document.querySelector("#task-list");
const formMessage = document.querySelector("#form-message");
const exportPath = document.querySelector("#export-path");
const openFolderButton = document.querySelector("#open-folder-button");
const clearButton = document.querySelector("#clear-button");

let jobs = [];
let pollTimer;
let renderedJobsSignature;

proxyInput.value = localStorage.getItem("video-downloader-proxy") ?? "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function siteLabel(site, url) {
  const labels = {
    cctv: "CCTV · 高清捕获",
    cntv: "12371 · 高清捕获",
    wechat: "WECHAT · 原画下载",
    qstheory: "QSTHEORY · 原画下载",
    generic: "GENERAL · 最佳画质",
  };
  if (site && labels[site]) return labels[site];
  try { return new URL(url).hostname; } catch { return "VIDEO"; }
}

function statusLabel(status) {
  return { queued: "等待中", running: "处理中", completed: "下载完成", failed: "失败" }[status] ?? status;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!value) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDuration(seconds) {
  const value = Math.round(Number(seconds) || 0);
  if (!value) return "";
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}

function renderJobs() {
  const signature = JSON.stringify(jobs);
  if (signature === renderedJobsSignature) return;
  renderedJobsSignature = signature;

  if (!jobs.length) {
    taskList.innerHTML = `
      <div class="empty-state">
        <span class="empty-arrow" aria-hidden="true">↓</span>
        <h3>还没有下载任务</h3>
        <p>粘贴链接后，解析、下载、封装和校验进度会显示在这里。</p>
      </div>`;
    return;
  }

  taskList.innerHTML = jobs.map((job) => {
    const resultBits = [
      job.width && job.height ? `${job.width} × ${job.height}` : "",
      formatDuration(job.duration),
      formatBytes(job.size),
    ].filter(Boolean);
    const fileLink = job.filename
      ? `<a class="file-link" href="/files/${encodeURIComponent(job.filename)}" download>下载文件</a>`
      : "";
    const detail = job.status === "failed"
      ? `<span class="error-text">${escapeHtml(job.error || "未知错误")}</span>`
      : job.status === "completed"
        ? `<span class="task-result"><b>${escapeHtml(job.filename)}</b><span>${escapeHtml(resultBits.join(" · "))}</span></span>`
        : `<span>${escapeHtml(job.message || "等待下载")}</span>`;
    return `
      <article class="task-card ${escapeHtml(job.status)}">
        <div class="task-top">
          <div>
            <p class="task-site">${escapeHtml(siteLabel(job.site, job.url))}</p>
            <h3 class="task-title"><a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">${escapeHtml(job.filename || job.url)}</a></h3>
          </div>
          <span class="status ${escapeHtml(job.status)}">${escapeHtml(statusLabel(job.status))}</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(job.progress) || 0}">
          <div class="progress-bar" style="transform:scaleX(${(Number(job.progress) || 0) / 100})"></div>
        </div>
        <div class="task-meta"><div>${detail}</div><div class="task-actions">${fileLink}</div></div>
      </article>`;
  }).join("");
}

async function refreshJobs() {
  try {
    const response = await fetch("/api/jobs");
    const data = await response.json();
    jobs = data.jobs ?? [];
    renderJobs();
    const hasActive = jobs.some((job) => ["queued", "running"].includes(job.status));
    clearTimeout(pollTimer);
    pollTimer = setTimeout(refreshJobs, hasActive ? 700 : 2_500);
  } catch {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(refreshJobs, 3_000);
  }
}

function showError(message) {
  formMessage.textContent = message;
  formMessage.classList.toggle("visible", Boolean(message));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "正在提交…";
  const proxy = proxyInput.value.trim();
  localStorage.setItem("video-downloader-proxy", proxy);
  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: linksInput.value, proxy }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "提交失败");
    linksInput.value = "";
    jobs = [...data.jobs, ...jobs];
    renderJobs();
    await refreshJobs();
  } catch (error) {
    showError(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "开始下载";
  }
});

pasteButton.addEventListener("click", async () => {
  try {
    linksInput.value = await navigator.clipboard.readText();
    linksInput.focus();
  } catch {
    linksInput.focus();
    showError("浏览器没有剪贴板权限，请直接按 Ctrl/Command + V 粘贴");
  }
});

openFolderButton.addEventListener("click", async () => {
  await fetch("/api/open-export", { method: "POST" });
});

clearButton.addEventListener("click", async () => {
  await fetch("/api/jobs", { method: "DELETE" });
  await refreshJobs();
});

async function initialize() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    exportPath.textContent = data.exportDir;
  } catch {
    exportPath.textContent = "export";
  }
  await refreshJobs();
}

void initialize();
