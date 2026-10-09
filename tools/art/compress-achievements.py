# -*- coding: utf-8 -*-
"""
tools/art/compress-achievements.py - 成就图标压缩入库（构建期工具）

背景（2026-10-09）：新出的 11 张玩法成就图标是 512x512 的大图（约 350KB/张），
直接进 CDN 目录会拖慢加载。项目里已有图标统一是 128x128、调色板模式（约 2-5KB/张），
这里按同一规格处理：按 alpha 裁边 -> 等比缩到 116 -> 居中贴到 128 透明画布
（留 8% 安全边距）-> 量化成 128 色调色板 PNG。

用法：
  python tools/art/compress-achievements.py           # 处理下面的固定清单
  python tools/art/compress-achievements.py --dry     # 只报告不写文件
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_DIR = os.path.join(ROOT, 'assets-src', 'achievements')
DST_DIR = os.path.join(ROOT, 'art', 'achievements')

# 2026-10-09 新增的 11 张（文件名与 server/achievements.js 的 achievementId 一一对应）
FILES = [
    'word_warrior_master.png',
    'word_build_master.png',
    'link_master.png',
    'match_master.png',
    'idiom_master.png',
    'quiz_master.png',
    'klotski_master.png',
    'onestroke_master.png',
    'g2048_master.png',
    'sprint_master.png',
    'balance_master.png',
]

SIZE = 128
INNER = 116
COLORS = 128

DRY = '--dry' in sys.argv


def strip_specks(img, faint=8, max_cells=12, max_avg_alpha=60):
    """清掉边缘的极淡小残影（豆包抠图的常见残留）。

    为什么不用「全局 alpha 阈值」砍：那会连同主体柔边一起啃掉。
    这里分两步、都很保守：
      ① 清 `alpha < faint`（默认 8）的像素 —— 这个不透明度肉眼几乎不可见，
         而主体柔边通常在 30 以上，砍不到；
      ② 清「像素数很少 且 平均不透明度很低」的孤立连通域 —— 处理抠图留下的虚线残影。
    实测豆包这批图的残留是「整片 alpha=1~7 的极淡底」，第 ① 步就够；
    第 ② 步是给「孤立小碎块」这类残留兜底。
    """
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            a = px[x, y][3]
            if 0 < a < faint:
                px[x, y] = (0, 0, 0, 0)
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or px[x0, y0][3] == 0:
                continue
            stack = [(x0, y0)]
            seen[y0][x0] = True
            cells = []
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] > 0:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            comps.append(cells)

    if not comps:
        return 0
    removed = 0
    for cells in comps:
        if len(cells) > max_cells:
            continue
        avg = sum(px[x, y][3] for x, y in cells) / float(len(cells))
        if avg >= max_avg_alpha:
            continue
        for x, y in cells:
            px[x, y] = (0, 0, 0, 0)
            removed += len(cells)
    return removed


def convert(src_path, dst_path):
    im = Image.open(src_path).convert('RGBA')
    bbox = im.getchannel('A').getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    scale = min(INNER / float(w), INNER / float(h))
    im = im.resize((max(1, int(round(w * scale))), max(1, int(round(h * scale)))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.size[0]) // 2, (SIZE - im.size[1]) // 2), im)
    strip_specks(canvas)
    # ⚠️ 不再做调色板量化（2026-10-09 实测）：quantize 会把 alpha 通道一起近似，
    # 角落的 0 被"造"成 1~7 的淡影，而 P 模式 PNG 的透明度信息存在 info['transparency']，
    # 改调色板清不掉（试了两轮）。128px 的 RGBA 每张也只有 8~15KB，走 CDN 完全够用，
    # 于是直接存 RGBA —— 与已交付旧图标的**显示效果一致**，只是色彩精度更高一点。
    out = canvas
    if not DRY:
        out.save(dst_path, optimize=True)
    return im.size


def main():
    if not os.path.isdir(SRC_DIR):
        print('源目录不存在：' + SRC_DIR)
        return
    os.makedirs(DST_DIR, exist_ok=True)
    total_before = 0
    total_after = 0
    for name in FILES:
        src = os.path.join(SRC_DIR, name)
        dst = os.path.join(DST_DIR, name)
        if not os.path.exists(src):
            print('  跳过（源图缺失）：' + name)
            continue
        inner = convert(src, dst)
        before = os.path.getsize(src)
        after = os.path.getsize(dst) if (not DRY and os.path.exists(dst)) else 0
        total_before += before
        total_after += after
        print('  %-24s 512x512 -> %dx%d   %dKB -> %dKB' % (
            name, inner[0], inner[1], before // 1024, after // 1024))
    print('合计：%dKB -> %dKB%s' % (total_before // 1024, total_after // 1024, '（dry run 未写文件）' if DRY else ''))


if __name__ == '__main__':
    main()
