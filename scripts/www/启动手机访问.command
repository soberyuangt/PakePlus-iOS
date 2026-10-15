#!/bin/bash
# 白酒底价计算器 · 手机访问服务
# 用法：双击本文件 → 按提示用手机浏览器打开地址 → 关闭窗口即停止

cd "$(dirname "$0")" || exit 1

PORT=8080
IP=""
for i in en0 en1 en2 en3; do
  v=$(ipconfig getifaddr "$i" 2>/dev/null)
  if [ -n "$v" ]; then IP="$v"; break; fi
done
if [ -z "$IP" ]; then
  IP=$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
fi
if [ -z "$IP" ]; then IP="（未检测到，请手动查看网络设置里的 IP）"; fi

# 端口被占用则自动顺延
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done

URL="http://$IP:$PORT"

# 每次启动都按当前 IP 刷新二维码（没网就跳过，不影响启动）
if command -v curl >/dev/null 2>&1; then
  curl -s --max-time 8 -o "手机扫码打开.png" \
    "https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=12&data=$(printf '%s' "$URL" | sed 's|:|%3A|g; s|/|%2F|g')" \
    >/dev/null 2>&1 && QR_OK=1
fi

echo ""
echo "=================================================="
echo "   白酒底价计算器 · 手机端访问"
echo "=================================================="
echo ""
echo "  1. 手机连上和这台电脑【同一个 Wi-Fi】"
echo ""
echo "  2. 手机浏览器（Safari / Chrome / 微信内置浏览器）打开："
echo ""
echo "        $URL"
echo ""
if [ -n "$QR_OK" ]; then
  echo "     或直接扫本文件夹里的「手机扫码打开.png」"
  echo ""
fi
echo "  3. 打开后可点浏览器菜单「添加到主屏幕」，"
echo "     以后像 App 一样点图标直接用"
echo ""
echo "  · 停止服务：按 Control + C，或直接关掉本窗口"
echo "  · 电脑休眠 / 关机会断开"
echo "  · 换了 Wi-Fi 后 IP 会变，重新双击本文件即可"
echo "=================================================="
echo ""
echo "服务已启动，请不要关闭本窗口 ..."
echo ""

python3 -m http.server "$PORT" --bind 0.0.0.0
