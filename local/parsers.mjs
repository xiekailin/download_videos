function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

function extractMetaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "iu"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "iu"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return "";
}

function extractTitle(html, fallback = "video") {
  const raw =
    extractMetaContent(html, "og:title") ||
    decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "") ||
    fallback;
  return raw
    .replace(/^\s*\[视频\]\s*/u, "")
    .replace(/\s*[-_|]\s*(?:CCTV|央视网).*$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function parseCntvPage(html) {
  const guidPatterns = [
    /\bvar\s+guid\s*=\s*["']([a-f\d]{32})["']/iu,
    /\bvideoCenterId\s*[:=]\s*["']([a-f\d]{32})["']/iu,
    /fmspic\/[^"']*\/([a-f\d]{32})-(?:1|180|300)\.jpg/iu,
  ];
  const guid = guidPatterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
  if (!guid) throw new Error("没有找到央视视频标识，网页结构可能已更新");
  return { guid, title: extractTitle(html, "央视视频") };
}

export function parseQstheoryPage(html) {
  const match = html.match(/\bvideo_src=["']([^"']+)["']/iu);
  if (!match) throw new Error("没有找到求是网页中的视频源");
  const source = decodeHtml(match[1]);
  const videoUrl = source.startsWith("//") ? `https:${source}` : source;
  return { title: extractTitle(html, "求是视频"), videoUrl };
}

function readNumber(block, key) {
  const match = block.match(new RegExp(`\\b${key}\\s*:\\s*['\"]?([\\d.]+)`, "iu"));
  return Number(match?.[1] ?? 0);
}

function decodeWechatUrl(value) {
  return decodeHtml(value)
    .replace(/\\x26(?:amp;)?/giu, "&")
    .replace(/\\u0026/giu, "&")
    .replace(/^http:/iu, "https:");
}

export function parseWechatPage(html) {
  const renditions = [];
  const objectPattern = /\{[^{}]*\bformat_id\s*:[^{}]*\}/giu;
  for (const match of html.matchAll(objectPattern)) {
    const block = match[0];
    const url = block.match(/\burl\s*:\s*\(?["']([^"']+)["']/iu)?.[1];
    const width = readNumber(block, "width");
    const height = readNumber(block, "height");
    if (!url || !width || !height) continue;
    renditions.push({
      videoUrl: decodeWechatUrl(url),
      width,
      height,
      filesize: readNumber(block, "filesize"),
      formatId: readNumber(block, "format_id"),
    });
  }

  const best = renditions.sort(
    (left, right) => right.width * right.height - left.width * left.height || right.filesize - left.filesize,
  )[0];
  if (!best) {
    throw new Error("未找到微信视频源；如果页面要求验证，请填写可用代理后重试");
  }
  return { title: extractTitle(html, "微信视频"), ...best };
}
