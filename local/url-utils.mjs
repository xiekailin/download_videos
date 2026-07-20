const TRAILING_PUNCTUATION = /[),.;!?，。；！？）】》”’]+$/u;

export function extractUrls(input) {
  const matches = String(input ?? "").match(/https?:\/\/[^\s<>"']+/giu) ?? [];
  const result = [];
  const seen = new Set();

  for (const match of matches) {
    const candidate = match.replace(TRAILING_PUNCTUATION, "");
    try {
      const url = new URL(candidate);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const normalized = url.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    } catch {
      // Ignore malformed text fragments.
    }
  }

  return result;
}

export function classifyUrl(input) {
  const hostname = new URL(input).hostname.toLowerCase();
  if (hostname === "tv.cctv.com" || hostname.endsWith(".cctv.com")) return "cctv";
  if (hostname === "12371.cn" || hostname.endsWith(".12371.cn")) return "cntv";
  if (hostname === "mp.weixin.qq.com") return "wechat";
  if (hostname === "qstheory.cn" || hostname.endsWith(".qstheory.cn")) {
    return "qstheory";
  }
  return "generic";
}

export function sanitizeFilename(input, maxLength = 120) {
  const cleaned = String(input ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/gu, "")
    .slice(0, maxLength)
    .replace(/[. ]+$/gu, "");

  const fallback = cleaned || "video";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(fallback)
    ? `_${fallback}`
    : fallback;
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  if (index === 0) return `${Math.round(value)} B`;
  return `${(value / 1024 ** index).toFixed(1)} ${units[index]}`;
}
