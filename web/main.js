const $ = (id) => document.getElementById(id);
const shareUrl = $('shareUrl');
const fileName = $('fileName');
const extractBtn = $('extractBtn');
const log = $('log');

function setLog(msg) {
  log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + log.textContent;
}

extractBtn.addEventListener('click', async () => {
  try {
    const url = shareUrl.value.trim();
    if (!url) return setLog('请先输入分享页链接');

    extractBtn.disabled = true;
    extractBtn.textContent = '正在提取...';
    setLog('正在提取视频地址，请稍等...');

    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareUrl: url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '提取失败');

    const videoUrl = data.currentSrc;

    if (!fileName.value.trim() || fileName.value === 'sora_video') {
      fileName.value = (data.title || 'sora_video').slice(0, 40);
    }

    setLog('提取成功！视频直链已获取，正在打开下载...');

    // 跨域链接 <a download> 无效，用 window.open 触发浏览器下载
    window.open(videoUrl, '_blank');

    setLog('已在新标签页打开视频，右键可另存为。');
  } catch (e) {
    setLog(`失败：${e.message}`);
  } finally {
    // 提取完立即恢复按钮，可以继续提取下一个
    extractBtn.disabled = false;
    extractBtn.textContent = '提取并下载';
  }
});
