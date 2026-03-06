#!/bin/bash
set -e

APP_DIR="/opt/sora"

echo "=== 1. 安装 Node.js 20 ==="
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
fi
echo "Node: $(node -v)"

echo ""
echo "=== 2. 安装 Nginx ==="
sudo yum install -y nginx

echo ""
echo "=== 3. 创建项目目录 ==="
sudo mkdir -p $APP_DIR
sudo chown $(whoami):$(whoami) $APP_DIR

echo ""
echo "=== 4. 复制项目文件 ==="
cp -r server/ web/ package.json package-lock.json $APP_DIR/

echo ""
echo "=== 5. 安装 npm 依赖 ==="
cd $APP_DIR
npm install --ignore-scripts

echo ""
echo "=== 6. 安装 Playwright Chromium ==="
npx playwright install --with-deps chromium

echo ""
echo "=== 7. 安装 pm2 ==="
sudo npm install -g pm2

echo ""
echo "=== 8. 配置 Nginx ==="
sudo cp deploy/nginx.conf /etc/nginx/conf.d/sora.conf 2>/dev/null || \
sudo cp $APP_DIR/../sora-video-downloader/deploy/nginx.conf /etc/nginx/conf.d/sora.conf 2>/dev/null || \
echo "请手动复制 deploy/nginx.conf 到 /etc/nginx/conf.d/sora.conf"

# 删掉默认配置避免冲突
sudo rm -f /etc/nginx/conf.d/default.conf

echo ""
echo "=== 9. 启动服务 ==="
cd $APP_DIR
pm2 delete sora 2>/dev/null || true
pm2 start server/index.mjs --name sora
pm2 save

sudo nginx -t && sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "=== 10. 防火墙放行 80 端口 ==="
sudo firewall-cmd --permanent --add-service=http 2>/dev/null || true
sudo firewall-cmd --reload 2>/dev/null || true

echo ""
echo "=== 11. 设置 pm2 开机自启 ==="
pm2 startup systemd -u $(whoami) --hp $HOME 2>&1 | tail -1 | bash 2>/dev/null || true
pm2 save

echo ""
echo "========================================="
echo "  部署完成！"
echo "  访问：http://$(hostname -I | awk '{print $1}')"
echo "========================================="
