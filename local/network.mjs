import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { pipeline } from "node:stream/promises";

import fetch from "node-fetch";
import { ProxyAgent } from "proxy-agent";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function makeAgent(proxy) {
  if (proxy) return new ProxyAgent({ getProxyForUrl: () => proxy });
  return new ProxyAgent();
}

export async function fetchResponse(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 45_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
        ...options.headers,
      },
      agent: makeAgent(options.proxy),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`网页请求失败（HTTP ${response.status}）`);
    return response;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("网页请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, options = {}) {
  return (await fetchResponse(url, options)).text();
}

export async function fetchJson(url, options = {}) {
  return (await fetchResponse(url, options)).json();
}

export async function downloadFile(url, destination, options = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: { referer: options.referer ?? url, ...options.headers },
    timeout: options.timeout ?? 120_000,
  });
  const total = Number(response.headers.get("content-length") ?? 0);
  const temporary = `${destination}.part`;
  await fsPromises.rm(temporary, { force: true });
  let received = 0;
  response.body.on("data", (chunk) => {
    received += chunk.length;
    options.onProgress?.({ received, total });
  });
  try {
    await pipeline(response.body, fs.createWriteStream(temporary));
    await fsPromises.rename(temporary, destination);
  } catch (error) {
    await fsPromises.rm(temporary, { force: true });
    throw error;
  }
  return { size: received, total };
}
