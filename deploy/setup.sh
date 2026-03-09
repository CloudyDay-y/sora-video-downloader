#!/bin/bash
set -e

APP_DIR="/opt/sora"
PROJECT_DIR="$(pwd)"

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
echo "=== 6. 安装 Playwright 系统依赖 ==="
if command -v apt-get &> /dev/null; then
    npx playwright install-deps chromium
elif command -v dnf &> /dev/null; then
    sudo dnf install -y \
        alsa-lib atk at-spi2-atk cups-libs libdrm libXcomposite \
        libXdamage libXrandr mesa-libgbm pango nss nspr \
        libXScrnSaver gtk3 xorg-x11-fonts-100dpi \
        xorg-x11-fonts-75dpi xorg-x11-fonts-misc xorg-x11-fonts-Type1
elif command -v yum &> /dev/null; then
    sudo yum install -y \
        alsa-lib atk at-spi2-atk cups-libs libdrm libXcomposite \
        libXdamage libXrandr mesa-libgbm pango nss nspr \
        libXScrnSaver gtk3 xorg-x11-fonts-100dpi \
        xorg-x11-fonts-75dpi xorg-x11-fonts-misc xorg-x11-fonts-Type1
fi

echo ""
echo "=== 7. 安装 Playwright Chromium ==="
# 清除镜像设置，使用官方源确保文件存在
unset PLAYWRIGHT_DOWNLOAD_HOST
npx playwright install chromium

echo ""
echo "=== 8. 安装 pm2 ==="
sudo npm install -g pm2
# 创建软链接，确保 pm2 在 PATH 中可用
sudo ln -sf /usr/local/lib/node_modules/pm2/bin/pm2 /usr/local/bin/pm2
export PATH=$PATH:/usr/local/bin

echo ""
echo "=== 9. 配置 Nginx ==="
if [ -f "$PROJECT_DIR/deploy/nginx.conf" ]; then
    sudo cp "$PROJECT_DIR/deploy/nginx.conf" /etc/nginx/conf.d/sora.conf
else
    echo "警告：未找到 nginx.conf，请手动复制到 /etc/nginx/conf.d/sora.conf"
fi

# 删掉默认配置避免冲突
sudo rm -f /etc/nginx/conf.d/default.conf

echo ""
echo "=== 10. 启动服务 ==="
cd $APP_DIR
pm2 delete sora 2>/dev/null || true
pm2 start server/index.mjs --name sora
pm2 save

sudo nginx -t && sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "=== 11. 防火墙放行 80 端口 ==="
sudo firewall-cmd --permanent --add-service=http 2>/dev/null || true
sudo firewall-cmd --reload 2>/dev/null || true

echo ""
echo "=== 12. 设置 pm2 开机自启 ==="
pm2 startup systemd -u $(whoami) --hp $HOME 2>&1 | tail -1 | bash 2>/dev/null || true
pm2 save

echo ""
echo "========================================="
echo "  部署完成！"
echo "  访问：http://$(hostname -I | awk '{print $1}')"
echo "========================================="
