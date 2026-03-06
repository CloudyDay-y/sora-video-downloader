# Sora Video Downloader

输入 Sora 分享页链接，自动提取真实视频地址并下载为 mp4。

## 功能

- Web 页面使用（本地运行）
- Electron 桌面应用（可打包 macOS / Windows）
- 自动保存到 `~/Downloads`

## 安装

```bash
cd /Users/liwenchao/WebstormProjects/sora-video-downloader
npm install
npx playwright install chromium
```

## 本地网页模式

```bash
npm run dev:web
```

浏览器打开：`http://localhost:5178`

## 桌面应用开发模式

```bash
npm run dev:electron
```

## 打包

先在 **mac 上打 mac 包**：

```bash
npm run pack:mac
```

打包 Windows 需要额外环境（通常在 Windows 机器或配置 wine 后执行）：

```bash
npm run pack:win
```

产物在 `dist` 或 `release`（以 electron-builder 输出为准）。

## 注意

- Sora 的视频链接是带签名的临时 URL，会过期。
- 仅下载你有权限访问的内容。
