# 高清视频下载器

一个在本机运行的网页工具。粘贴视频网页链接后，文件会保存到项目内的 `export` 文件夹。

## 支持范围

- 央视网、共产党员网：调用官网播放器，捕获播放器处理后的 720p 高清数据。
- 微信公众号、求是网：自动选择网页提供的最高分辨率文件。
- 其他常见视频网站：使用 yt-dlp 下载最佳画质并自动合并为 MP4。
- 支持一次粘贴多个链接，任务按顺序执行，避免同时开多个播放器占满内存。

请只下载你有权保存的内容。网站改版、登录限制、地区限制或 DRM 规则变化可能影响下载。

## macOS

1. 首次使用双击 `setup.command`，等待依赖安装完成。
2. 以后双击 `start.command`。
3. 浏览器会自动打开 `http://127.0.0.1:3210`。

如果 macOS 阻止运行，右键脚本选择“打开”，或在终端执行：

```bash
chmod +x setup.command start.command
./setup.command
```

## Windows 10/11 便携版（解压即用）

便携版内置 Windows x64 版 Node.js、Chromium、FFmpeg、FFprobe 和 yt-dlp。普通用户不需要安装 Node.js：

1. 解压 `HD-Video-Downloader-Windows-x64.zip`，不要在 ZIP 压缩包内直接运行。
2. 双击解压目录中的 `启动下载器.bat`。
3. 程序会自动打开 `http://127.0.0.1:3210`，视频保存在同目录的 `export` 文件夹。

请将程序解压到有写入权限的目录，不要放在 `Program Files` 中。首次运行时 Windows Defender/SmartScreen 可能会针对未签名的批处理或 yt-dlp 弹出提示。当前便携包针对 Windows x64 构建，不是 Windows ARM64 原生版。

### 生成 Windows 便携 ZIP

此项目在 macOS 上无法直接生成 Windows 二进制依赖，因此使用 GitHub Actions 的 Windows Runner 构建：

1. 将项目推送到 GitHub 仓库。
2. 打开仓库的 **Actions** 页面，选择 **Build Windows portable ZIP**。
3. 点击 **Run workflow**，等待构建和冒烟测试完成。
4. 下载 `HD-Video-Downloader-Windows-x64` artifact。下载到的 ZIP 就是可以发给 Windows 用户的便携包，不需要再从里面取第二个 ZIP。

构建脚本会校验固定版本的 Node.js 和 yt-dlp，并在压缩前验证 Node.js、Chromium、FFmpeg、FFprobe、yt-dlp 与本地 HTTP 服务。

## Windows 10/11 源码安装

1. 安装 [Node.js 20 LTS 或更高版本](https://nodejs.org/)。
2. 首次使用双击 `setup.bat`。
3. 以后双击 `start.bat`。
4. 浏览器会自动打开 `http://127.0.0.1:3210`。

项目移动到另一台电脑后，需要在那台电脑上重新运行对应的安装脚本，以安装正确平台的浏览器和视频组件。

## 代理

如果微信或境外网站无法读取，可在网页的“网络访问需要代理？”中填写：

```text
http://127.0.0.1:7897
```

也支持 `https://`、`socks4://` 和 `socks5://`。代理地址只保存在当前浏览器中。

## 命令行启动

```bash
npm ci
npx playwright install chromium
node scripts/install-tools.mjs
npm start
```

默认只监听本机 `127.0.0.1:3210`，不会对局域网开放。
