#!/bin/bash
# 前端自动部署脚本 — 由 GitHub Webhook 触发
set -e

LOG="/var/log/frontend-deploy.log"
exec >> "$LOG" 2>&1

REPO="476708310zhao-svg/CareerAO"
BUILD_DIR="/tmp/careerao-build"
WEB_ROOT="/www/wwwroot/zhiyincareer-web"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

if [ -n "$GITHUB_TOKEN" ]; then
  REPO_URL="https://${GITHUB_TOKEN}@github.com/${REPO}.git"
else
  REPO_URL="https://github.com/${REPO}.git"
fi

echo ""
echo "========================================="
echo "  前端部署开始: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# 拉取代码
if [ -d "$BUILD_DIR/.git" ]; then
  echo "[1/4] 拉取最新代码..."
  cd "$BUILD_DIR"
  git remote set-url origin "$REPO_URL"
  git fetch origin main
  git reset --hard origin/main
else
  echo "[1/4] 首次克隆仓库..."
  rm -rf "$BUILD_DIR"
  git clone "$REPO_URL" "$BUILD_DIR"
  cd "$BUILD_DIR"
fi

# 安装依赖
echo "[2/4] 安装依赖..."
npm ci --legacy-peer-deps

# 构建
echo "[3/4] 构建中..."
VITE_API_BASE_URL=https://www.zhiyincareer.com npm run build

# 部署到 web 目录
echo "[4/4] 部署文件..."
rm -rf "${WEB_ROOT:?}"/*
cp -r dist/* "$WEB_ROOT/"

echo "✅ 部署完成: $(date '+%Y-%m-%d %H:%M:%S')"
