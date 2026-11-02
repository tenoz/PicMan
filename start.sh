#!/usr/bin/env bash
#
# PicMan 启动脚本
#
#   ./start.sh              浏览器开发模式（http://localhost:3000）
#   ./start.sh web          同上
#   ./start.sh tauri        桌面应用开发模式（自动把 Tauri devPath 对齐到 3000）
#   ./start.sh preview      构建后预览生产产物（http://localhost:4173）
#   ./start.sh --help       查看用法
#
# 环境变量：
#   NO_OPEN=1               不要在启动后自动打开浏览器
#
# 说明：本脚本只做启动，不改任何配置文件。桌面模式用的端口对齐是通过
#      `tauri dev --config` 临时覆盖 devPath 实现的，避免动 tauri.conf.json。

set -euo pipefail

# 始终在项目根目录执行（脚本可能从任意位置被调用）
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WEB_PORT=3000
PREVIEW_PORT=4173

if [ -t 1 ]; then
  C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GRN=$'\033[32m'
  C_YEL=$'\033[33m'; C_BLU=$'\033[34m'; C_RST=$'\033[0m'
else
  C_DIM=''; C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''; C_RST=''
fi

info() { printf '%s▸%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%s✓%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YEL" "$C_RST" "$*"; }
die()  { printf '%s✗%s %s\n' "$C_RED" "$C_RST" "$*" >&2; exit 1; }

usage() {
  sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
}

MODE="${1:-web}"
case "$MODE" in
  -h|--help|help) usage; exit 0 ;;
  web|browser)    MODE=web ;;
  tauri|desktop)  MODE=tauri ;;
  preview|build)  MODE=preview ;;
  *) die "未知参数：${MODE}（可用：web / tauri / preview / --help）" ;;
esac

# 端口是否被监听：用 nc 而不是 lsof（本机 lsof 会挂住）
port_busy() {
  nc -z -G 1 127.0.0.1 "$1" >/dev/null 2>&1
}

# ---------- 1. 运行环境 ----------
command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node.js 18 或更高版本"
command -v npm  >/dev/null 2>&1 || die "未找到 npm"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  warn "当前 Node 为 $(node -v)，项目要求 18+，可能装依赖失败"
fi
ok "Node $(node -v) · npm $(npm -v)"

# ---------- 2. 依赖 ----------
if [ ! -d node_modules ]; then
  info "首次启动，正在安装依赖（大约几分钟）..."
  npm install || die "依赖安装失败，请检查网络或 npm 源"
  ok "依赖安装完成"
else
  ok "依赖已就绪"
fi

# ---------- 3. 桌面模式额外检查 ----------
if [ "$MODE" = "tauri" ]; then
  command -v cargo >/dev/null 2>&1 || die "桌面模式需要 Rust 工具链，未找到 cargo"
  ok "Rust $(cargo --version | awk '{print $2}')"
fi

# ---------- 4. 端口占用 ----------
PORT_BUSY=0
case "$MODE" in
  web)     CHECK_PORT=$WEB_PORT ;;
  tauri)   CHECK_PORT=$WEB_PORT ;;
  preview) CHECK_PORT=$PREVIEW_PORT ;;
esac

if port_busy "$CHECK_PORT"; then
  PORT_BUSY=1
  if [ "$MODE" = "tauri" ]; then
    die "端口 $CHECK_PORT 已被占用。桌面模式必须独占该端口，请先停掉正在运行的 dev server 再试"
  fi
  warn "端口 $CHECK_PORT 已被占用（大概是上次没关的 dev server）"
  warn "Vite 会自动换一个端口；想回到 $CHECK_PORT 请先停掉旧进程"
else
  ok "端口 $CHECK_PORT 空闲"
fi

# ---------- 5. 启动后自动开浏览器 ----------
open_when_ready() {
  [ "${NO_OPEN:-0}" = "1" ] && return 0
  [ "$PORT_BUSY" = "1" ] && return 0
  (
    i=0
    while [ "$i" -lt 100 ]; do
      if port_busy "$1"; then
        open "http://localhost:$1"
        exit 0
      fi
      i=$((i + 1))
      sleep 0.3
    done
  ) >/dev/null 2>&1 &
}

# ---------- 6. 按模式启动 ----------
case "$MODE" in
  web)
    info "浏览器开发模式 → http://localhost:$WEB_PORT"
    open_when_ready "$WEB_PORT"
    exec npm run dev
    ;;

  tauri)
    info "桌面开发模式 → 窗口加载 http://localhost:$WEB_PORT"
    info "首次编译 Rust 需要几分钟，之后是增量编译"
    # 用 --config 临时把 devPath 覆盖成项目实际端口，不改 tauri.conf.json
    exec npx tauri dev --config "{\"build\":{\"devPath\":\"http://localhost:$WEB_PORT\"}}"
    ;;

  preview)
    info "构建生产产物..."
    npm run build || die "构建失败"
    ok "构建完成，启动预览 → http://localhost:$PREVIEW_PORT"
    open_when_ready "$PREVIEW_PORT"
    exec npm run preview
    ;;
esac
