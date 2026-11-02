#!/usr/bin/env bash
#
# build-dmg.sh —— 一键打出可安装的 dmg。
#
# 为什么不直接用 `tauri build` 的原生 dmg：
#   它调 create-dmg 的 bundle_dmg.sh，那个脚本用 AppleScript 控制 Finder 摆图标位置，
#   没有「自动化」权限时会挂在 `hdiutil detach /dev/diskN` 上，报错还只吐一句
#   `error running bundle_dmg.sh`；更坑的是失败会留下 /Volumes/PicMan 挂载点，
#   不清理下次直接撞名。详见 AGENTS.md 坑 37。
#
# 所以这里把「编译」和「封包」分开：
#   tauri build -b app  →  只出 .app，完全不碰 dmg 脚本
#   hdiutil create      →  自己做映像，不需要 Finder，不会留挂载点
#
# 用法：
#   ./scripts/build-dmg.sh          # 两个架构都打
#   ./scripts/build-dmg.sh arm      # 只打 Apple Silicon
#   ./scripts/build-dmg.sh intel    # 只打 Intel
#
# 产物：releases/PicMan_<版本>_<架构>.dmg，并打印 md5 / sha256 / 大小。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
VOLNAME="PicMan"
OUT_DIR="$ROOT/releases"

resolve_target() {
  case "$1" in
    arm|aarch64) echo "aarch64-apple-darwin" ;;
    intel|x64)   echo "x86_64-apple-darwin" ;;
    *) echo "未知架构：$1（可用 arm / intel）" >&2; exit 1 ;;
  esac
}

suffix_of() {
  case "$1" in
    aarch64-apple-darwin) echo "aarch64" ;;
    x86_64-apple-darwin)  echo "x64" ;;
  esac
}

# 上次失败可能留下挂载点。不清掉的话，hdiutil create 会撞名失败，
# 而报错完全指不到这个原因上。
cleanup_mount() {
  if [[ -d "/Volumes/$VOLNAME" ]]; then
    echo "  清理残留挂载点 /Volumes/$VOLNAME"
    hdiutil detach "/Volumes/$VOLNAME" >/dev/null 2>&1 || true
  fi
}

build_one() {
  local target="$1"
  local suffix
  suffix="$(suffix_of "$target")"
  local out="$OUT_DIR/PicMan_${VERSION}_${suffix}.dmg"

  # 注意：中文全角括号紧跟在变量后面时，必须写 ${var}。
  # 写成 $suffix（... 的话 bash 会把「（」当成标识符的一部分，报 unbound variable。
  echo ""
  echo "=== ${suffix}（${target}）==="
  cleanup_mount

  # -b app 是关键：跳过 bundle 阶段的 dmg 脚本，只产出 .app
  npx tauri build --target "$target" -b app

  local app="$ROOT/src-tauri/target/$target/release/bundle/macos/PicMan.app"
  if [[ ! -d "$app" ]]; then
    echo "找不到 .app：$app" >&2
    exit 1
  fi

  # stage 目录 = 映像里要放的东西：应用本体 + 指向 /Applications 的软链，
  # 用户打开 dmg 直接拖过去就装了。
  # 这个临时目录不主动清理——/tmp 由系统回收，本项目不碰 rm。
  local stage
  stage="$(mktemp -d "/tmp/picman-dmg-${suffix}.XXXXXX")"
  cp -R "$app" "$stage/"
  ln -s /Applications "$stage/Applications"

  mkdir -p "$OUT_DIR"
  hdiutil create -volname "$VOLNAME" -srcfolder "$stage" -ov -format UDZO -fs HFS+ "$out" >/dev/null

  echo "  ✓ $out"
  echo "    md5    $(md5 -q "$out")"
  echo "    sha256 $(shasum -a 256 "$out" | cut -d' ' -f1)"
  echo "    size   $(du -h "$out" | cut -f1)"
}

targets=()
case "${1:-both}" in
  both)            targets=("aarch64-apple-darwin" "x86_64-apple-darwin") ;;
  arm|intel|x64)   targets=("$(resolve_target "$1")") ;;
  aarch64)         targets=("aarch64-apple-darwin") ;;
  *)               echo "未知参数：$1（可用 arm / intel / both）" >&2; exit 1 ;;
esac

echo "PicMan v$VERSION —— 开始打包 ${#targets[@]} 个架构"

for t in "${targets[@]}"; do
  build_one "$t"
done

echo ""
echo "全部完成，产物在 $OUT_DIR/"
