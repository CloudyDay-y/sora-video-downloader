const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function sanitizeFileName(name = 'sora_video') {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'sora_video';
}

/**
 * 打开分享页，通过拦截网络请求 + 读取 <video> src 获取视频直链。
 */
async function extractVideoUrl(shareUrl) {
  // playwright-core 是 ESM-only，需要动态 import
  const { chromium } = await import('playwright-core');

  const isMac = process.platform === 'darwin';
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--mute-audio',
    ],
  };
  if (isMac) launchOptions.channel = 'chrome';

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    userAgent: DEFAULT_UA,
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  let capturedUrl = null;
  let title = 'sora_video';

  const isVideoUrl = (u) =>
    /https:\/\/videos\.openai\.com\//i.test(u);

  page.on('request', (req) => {
    const u = req.url();
    if (isVideoUrl(u)) {
      console.log('[抓取] 请求命中:', u.slice(0, 150));
      capturedUrl = u;
    }
  });

  page.on('response', (resp) => {
    const u = resp.url();
    if (isVideoUrl(u)) {
      console.log('[抓取] 响应命中:', resp.status(), u.slice(0, 150));
      capturedUrl = u;
    }
  });

  try {
    console.log('[提取] 打开页面:', shareUrl);
    await page.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[提取] 页面已加载');

    const started = Date.now();
    let round = 0;

    while (Date.now() - started < 60000) {
      round++;
      if (capturedUrl) {
        console.log('[提取] 已从网络拦截拿到直链');
        break;
      }

      try {
        const info = await page.evaluate(() => {
          const video = document.querySelector('video');
          return {
            title: document.title || '',
            videoCount: document.querySelectorAll('video').length,
            currentSrc: video?.currentSrc || '',
            src: video?.src || '',
            sourceSrc: video?.querySelector('source')?.src || '',
            readyState: video?.readyState ?? -1,
            paused: video?.paused ?? true,
          };
        });

        if (round <= 5 || round % 5 === 0) {
          console.log(`[轮询 #${round}]`, JSON.stringify(info));
        }

        if (info) {
          title = info.title || title;
          const found = [info.currentSrc, info.src, info.sourceSrc]
            .find((u) => u && isVideoUrl(u));
          if (found) {
            capturedUrl = found;
            console.log('[提取] 从 <video> 元素拿到直链');
            break;
          }
        }
      } catch (e) {
        console.log(`[轮询 #${round}] evaluate 异常:`, e.message?.slice(0, 100));
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      try {
        const video = page.locator('video').first();
        if ((await video.count()) > 0) {
          await video.click({ timeout: 2000 }).catch(() => {});
          await page.keyboard.press('Space').catch(() => {});
        }
      } catch {}

      await new Promise((r) => setTimeout(r, 2000));
    }

    try { title = (await page.title()) || title; } catch {}

    if (!capturedUrl) {
      try {
        const debug = await page.evaluate(() => {
          const srcs = [];
          document.querySelectorAll('video, video source, iframe').forEach((el) => {
            srcs.push({ tag: el.tagName, src: el.src || el.currentSrc || '' });
          });
          return { url: location.href, srcs };
        });
        console.log('[最终] 页面调试信息:', JSON.stringify(debug));
      } catch {}
      throw new Error('未能提取到视频直链，请确认链接是可公开访问的 Sora 分享页。');
    }

    return { title, currentSrc: capturedUrl };
  } finally {
    await browser.close().catch(() => {});
  }
}

function startServer(rootDir) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/extract', async (req, res) => {
    try {
      const { shareUrl } = req.body ?? {};
      if (!shareUrl || typeof shareUrl !== 'string') {
        return res.status(400).json({ error: '缺少 shareUrl' });
      }
      const info = await extractVideoUrl(shareUrl);
      return res.json(info);
    } catch (error) {
      return res.status(500).json({ error: error.message || '提取失败' });
    }
  });

  app.post('/api/download', async (req, res) => {
    try {
      const { videoUrl, fileName } = req.body ?? {};
      if (!videoUrl || typeof videoUrl !== 'string') {
        return res.status(400).json({ error: '缺少 videoUrl' });
      }

      const safeName = `${sanitizeFileName(fileName)}.mp4`;
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });
      const outPath = path.join(downloadsDir, safeName);

      await new Promise((resolve, reject) => {
        execFile('curl', [
          '--globoff', '-L', '--fail', '--http1.1',
          '-A', DEFAULT_UA,
          '-H', 'Referer: https://sora.chatgpt.com/',
          '-H', 'Origin: https://sora.chatgpt.com',
          '-o', outPath,
          videoUrl,
        ], { timeout: 300000 }, (err, _stdout, stderr) => {
          if (err) reject(new Error(`curl 下载失败: ${stderr || err.message}`));
          else resolve();
        });
      });

      const stat = fs.statSync(outPath);
      return res.json({ ok: true, outPath, size: stat.size });
    } catch (error) {
      return res.status(500).json({ error: error.message || '下载失败' });
    }
  });

  // 静态文件：打包后用 webdist，开发时用 web
  const distDir = path.join(rootDir, 'webdist');
  const webDir = path.join(rootDir, 'web');

  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_, res) => res.sendFile(path.join(distDir, 'index.html')));
  } else {
    app.use(express.static(webDir));
    app.get('*', (_, res) => res.sendFile(path.join(webDir, 'index.html')));
  }

  const PORT = process.env.PORT || 5178;
  return new Promise((resolve) => {
    app.listen(PORT, () => {
      console.log(`Sora Downloader running on http://localhost:${PORT}`);
      resolve(PORT);
    });
  });
}

// 如果直接用 node 运行（非 Electron），自动启动
if (require.main === module) {
  startServer(path.resolve(__dirname, '..'));
}

module.exports = { startServer };
