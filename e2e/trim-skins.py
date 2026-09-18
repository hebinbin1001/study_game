#!/usr/bin/env python
"""
trim-skins.py —— 对局立绘「裁掉透明边」（2026-09-19）

为什么需要：
  用户反馈「字母射击的战士和 boss 太小了」。量了素材才发现根因不在布局：
    · 怪物图（monster_*.png）角色占画布 94~100% —— 已经贴边，没浪费；
    · **战士图（skin-*.png）角色只占 40%×65%** —— 一大圈透明边，
      于是显示框给到 300rpx，角色实际只有约 120×195rpx，看着就小。
  裁掉透明边后，同样的显示尺寸下角色立刻放大约 2.3 倍。

做法：
  · 按 alpha 通道求包围盒，四周留 2% 安全边距；
  · **保持原调色板模式**（P 模式）直接 crop —— 保留 tRNS 透明信息，且体积不会变大；
  · 原图先备份到 assets-src/skins-orig/（该目录已 gitignore，仅本机留档）。

用法：
  python e2e/trim-skins.py          # 处理并覆盖 miniprogram/assets/skins/*.png
  python e2e/trim-skins.py --dry    # 只报告不写文件
"""

import os
import shutil
import sys
import glob

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIN_DIR = os.path.join(ROOT, "miniprogram", "assets", "skins")
BACKUP_DIR = os.path.join(ROOT, "assets-src", "skins-orig")
PAD_RATIO = 0.02          # 四周留 2% 安全边距，避免贴边被裁


def main():
    dry = "--dry" in sys.argv
    files = sorted(glob.glob(os.path.join(SKIN_DIR, "*.png")))
    if not files:
        print("没找到皮肤图：", SKIN_DIR)
        return 1

    if not dry:
        os.makedirs(BACKUP_DIR, exist_ok=True)

    total_before = 0
    total_after = 0
    changed = 0
    for path in files:
        name = os.path.basename(path)
        size_before = os.path.getsize(path)
        total_before += size_before

        im = Image.open(path)
        alpha = im.convert("RGBA").getchannel("A")
        box = alpha.getbbox()
        if not box:
            print("  跳过（整张透明）：%s" % name)
            total_after += size_before
            continue

        x0, y0, x1, y1 = box
        bw, bh = x1 - x0, y1 - y0
        pad = int(round(max(bw, bh) * PAD_RATIO))
        w, h = im.size
        cx0 = max(0, x0 - pad)
        cy0 = max(0, y0 - pad)
        cx1 = min(w, x1 + pad)
        cy1 = min(h, y1 + pad)

        if (cx0, cy0, cx1, cy1) == (0, 0, w, h):
            print("  已是满幅：%-32s %dx%d" % (name, w, h))
            total_after += size_before
            continue

        cropped = im.crop((cx0, cy0, cx1, cy1))
        if dry:
            print("  [dry] %-32s %dx%d → %dx%d" % (name, w, h, cx1 - cx0, cy1 - cy0))
            continue

        shutil.copyfile(path, os.path.join(BACKUP_DIR, name))
        cropped.save(path, optimize=True)
        size_after = os.path.getsize(path)
        total_after += size_after
        changed += 1
        print("  裁边：%-32s %dx%d → %dx%d  (%.1fKB → %.1fKB)" % (
            name, w, h, cx1 - cx0, cy1 - cy0, size_before / 1024.0, size_after / 1024.0))

    print("")
    print("处理 %d 张 · 包内图片合计 %.1fKB → %.1fKB" % (
        len(files), total_before / 1024.0, total_after / 1024.0))
    if not dry:
        print("原图备份：%s" % BACKUP_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
