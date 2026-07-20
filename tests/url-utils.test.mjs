import { describe, expect, it } from "vitest";

import {
  classifyUrl,
  extractUrls,
  formatBytes,
  sanitizeFilename,
} from "../local/url-utils.mjs";

describe("extractUrls", () => {
  it("extracts, normalizes and deduplicates HTTP links", () => {
    const input = [
      "央视：https://tv.cctv.com/2026/a.shtml?x=1",
      "https://mp.weixin.qq.com/s/demo",
      "https://tv.cctv.com/2026/a.shtml?x=1",
    ].join("\n");

    expect(extractUrls(input)).toEqual([
      "https://tv.cctv.com/2026/a.shtml?x=1",
      "https://mp.weixin.qq.com/s/demo",
    ]);
  });

  it("rejects non-HTTP protocols", () => {
    expect(extractUrls("file:///tmp/a.mp4 javascript:alert(1)")).toEqual([]);
  });

  it("handles empty and malformed input", () => {
    expect(extractUrls()).toEqual([]);
    expect(extractUrls("http://[")) .toEqual([]);
  });
});

describe("classifyUrl", () => {
  it.each([
    ["https://tv.cctv.com/a", "cctv"],
    ["https://dslm.12371.cn/a", "cntv"],
    ["https://www.12371.cn/a", "cntv"],
    ["https://mp.weixin.qq.com/s/a", "wechat"],
    ["https://www.qstheory.cn/a", "qstheory"],
    ["https://example.com/video", "generic"],
  ])("classifies %s", (url, expected) => {
    expect(classifyUrl(url)).toBe(expected);
  });
});

describe("sanitizeFilename", () => {
  it("removes Windows-invalid characters and reserved trailing characters", () => {
    expect(sanitizeFilename('  新闻：广西<暴雨>|?*...  ')).toBe("新闻：广西暴雨");
  });

  it("uses a fallback and limits long names", () => {
    expect(sanitizeFilename(" ")).toBe("video");
    expect(sanitizeFilename("a".repeat(300))).toHaveLength(120);
    expect(sanitizeFilename("CON")).toBe("_CON");
  });
});

describe("formatBytes", () => {
  it("formats byte sizes for display", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(5)).toBe("5 B");
    expect(formatBytes(1_048_576)).toBe("1.0 MB");
  });
});
