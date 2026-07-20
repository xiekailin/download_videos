import { describe, expect, it } from "vitest";

import {
  parseCntvPage,
  parseQstheoryPage,
  parseWechatPage,
} from "../local/parsers.mjs";

describe("parseCntvPage", () => {
  it("extracts the GUID and readable title", () => {
    const html = `
      <html><head><title>[视频] 广西抢险 - CCTV</title></head>
      <body><script>var guid = "e942b1e45ceb41a2a4d7cbb3f515d932";</script></body></html>`;

    expect(parseCntvPage(html)).toEqual({
      guid: "e942b1e45ceb41a2a4d7cbb3f515d932",
      title: "广西抢险",
    });
  });

  it("fails clearly when the page has no video GUID", () => {
    expect(() => parseCntvPage("<html></html>")).toThrow("没有找到央视视频标识");
  });

  it("supports videoCenterId and a title meta with reversed attributes", () => {
    const html = `
      <meta content="备用标题 &amp; 测试" property="og:title">
      <script>videoCenterId: '1234567890abcdef1234567890abcdef'</script>`;
    expect(parseCntvPage(html)).toEqual({
      guid: "1234567890abcdef1234567890abcdef",
      title: "备用标题 & 测试",
    });
  });
});

describe("parseQstheoryPage", () => {
  it("extracts a protocol-relative or HTTPS MP4 source", () => {
    const html = `
      <meta property="og:title" content="一起学习">
      <span video_src="//vod.example.com/high.mp4"></span>`;

    expect(parseQstheoryPage(html)).toEqual({
      title: "一起学习",
      videoUrl: "https://vod.example.com/high.mp4",
    });
  });

  it("keeps an absolute source and falls back to the title tag", () => {
    const html = `<title>求是专题</title><span video_src="https://vod.example.com/a.mp4"></span>`;
    expect(parseQstheoryPage(html)).toEqual({
      title: "求是专题",
      videoUrl: "https://vod.example.com/a.mp4",
    });
  });

  it("fails clearly when no source exists", () => {
    expect(() => parseQstheoryPage("<title>没有视频</title>")).toThrow("没有找到求是网页中的视频源");
  });
});

describe("parseWechatPage", () => {
  it("chooses the largest available rendition", () => {
    const html = `
      <meta property="og:title" content="微信测试视频">
      <script>
        var videoPageInfos = [{ mp_video_trans_info: [
          { format_id: '10104', width: '480' * 1, height: '270' * 1,
            filesize: '2556392', url: 'http://mpvideo.qpic.cn/low.mp4?x=1\\x26amp;y=2' },
          { format_id: '10002', width: '1280' * 1, height: '720' * 1,
            filesize: '17488498', url: 'http://mpvideo.qpic.cn/high.mp4?x=1\\x26amp;y=2' }
        ]}];
      </script>`;

    expect(parseWechatPage(html)).toMatchObject({
      title: "微信测试视频",
      width: 1280,
      height: 720,
      filesize: 17_488_498,
      videoUrl: "https://mpvideo.qpic.cn/high.mp4?x=1&y=2",
    });
  });

  it("fails clearly on a verification page", () => {
    expect(() => parseWechatPage("环境异常，请完成验证")).toThrow("未找到微信视频源");
  });

  it("skips incomplete renditions and uses filesize as a resolution tie-breaker", () => {
    const html = `
      { format_id: '1', width: '720', height: '720' }
      { format_id: '2', width: '720', height: '720', filesize: '10', url: 'https://a/low.mp4' }
      { format_id: '3', width: '720', height: '720', filesize: '20', url: 'https://a/high.mp4?x=1\\u0026y=2' }`;
    expect(parseWechatPage(html)).toMatchObject({
      title: "微信视频",
      formatId: 3,
      videoUrl: "https://a/high.mp4?x=1&y=2",
    });
  });
});
