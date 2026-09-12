#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
e2e/prepare-monsters.py —— 怪兽皮肤：切图 + 抠白底 + 压缩

为什么需要它：
  豆包/Seedream 出的「四只怪兽拼图」有两个必须机器处理的问题：
    1. 导出来是**白底 RGB**（没有透明通道），直接进包会在游戏里显示一块白板；
    2. 是一张 1024×4096 的长图，游戏要的是四张独立的透明 PNG。

它做四件事：
  ① 按等分切成 4 张（默认 1024×1024/张，可用 --rows 调）；
  ② **从四边泛洪抠白底**（只删「和画布边缘连通的白」，怪物内部的眼白/雪花不会被误删）；
  ③ 裁到「头 + 上半身」（默认保留不透明区域上方 62%）—— 游戏里下半身会被题目卡片挡住；
  ④ 按展示尺寸缩放 + 调色板 PNG 压缩，保证单文件远小于 200KB 上限。

用法：
  python e2e/prepare-monsters.py                       # 用默认路径与参数
  python e2e/prepare-monsters.py --report              # 只看体积，不写文件
  python e2e/prepare-monsters.py --keep 0.75           # 保留更多身体（默认 0.62）

输入：assets-src/monsters/monster-sheet.png（原图，不打包不入库）
输出：assets-src/monsters/monster_0N.png（切好的原图，留档）
      miniprogram/assets/skins/monster_0N.png（端上用的压缩图）
"""

import argparse
import os
import sys
from collections import deque

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.stderr.write("需要 Pillow：pip install Pillow\n")
    sys.exit(1)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_SHEET = os.path.join(ROOT, "assets-src", "monsters", "monster-sheet.png")
SRC_DIR = os.path.join(ROOT, "assets-src", "monsters")
OUT_DIR = os.path.join(ROOT, "miniprogram", "assets", "skins")

# 抠白底的判定：越亮越可能是背景。ANTI 用于把抗锯齿的灰边一起吃掉。
WHITE_MIN = 232      # 三通道都 >= 这个值 → 认为是白底
WHITE_SPREAD = 18    # 且三通道最大差 <= 这个值 → 排除彩色高光


def is_bg(px):
    r, g, b = px[0], px[1], px[2]
    if r < WHITE_MIN or g < WHITE_MIN or b < WHITE_MIN:
        return False
    return (max(r, g, b) - min(r, g, b)) <= WHITE_SPREAD


def cut_background(img):
    """从四边泛洪，把与边缘连通的白色变透明（怪物内部的白色不受影响）。"""
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if seen[i]:
            return
        seen[i] = 1
        if is_bg(px[x, y]):
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    removed = 0
    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        removed += 1
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)
    return removed


def feather_alpha(img, radius=0.6):
    """给 alpha 做极轻的模糊，消掉抠图后的锯齿硬边。"""
    a = img.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    img.putalpha(a)
    return img


def trim_to_head(img, keep):
    """裁到不透明包围盒，再只保留上方 keep 比例（下半身会被卡片挡住）。"""
    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    if keep and keep < 1:
        img = img.crop((0, 0, w, max(1, int(h * keep))))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=4, help="拼图里纵向排列了几只（默认 4）")
    ap.add_argument("--keep", type=float, default=0.62, help="保留身体的比例（默认 0.62 = 头+上半身）")
    ap.add_argument("--width", type=int, default=340, help="端上图片宽度（默认 340）")
    ap.add_argument("--report", action="store_true", help="只报告体积，不写文件")
    ap.add_argument("--keep-bg", action="store_true", help="跳过抠白底（调试用）")
    args = ap.parse_args()

    if not os.path.exists(SRC_SHEET):
        sys.stderr.write("找不到拼图：%s\n" % SRC_SHEET)
        return 1

    sheet = Image.open(SRC_SHEET).convert("RGBA")
    sw, sh = sheet.size
    cell_h = sh // args.rows
    print("拼图 %dx%d → 切成 %d 张，每张约 %dpx 高" % (sw, sh, args.rows, cell_h))

    if not args.report and not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)

    total = 0
    for i in range(args.rows):
        cell = sheet.crop((0, i * cell_h, sw, (i + 1) * cell_h))
        if not args.keep_bg:
            removed = cut_background(cell)
            cell = feather_alpha(cell)
            share = removed / float(sw * cell_h) * 100
            print("  [%d] 抠掉白底 %.1f%%" % (i + 1, share))
        head = trim_to_head(cell, args.keep)

        # 按宽度等比缩放到展示尺寸
        scale = args.width / float(head.size[0])
        head = head.resize((args.width, max(1, int(head.size[1] * scale))), Image.LANCZOS)

        name = "monster_%02d.png" % (i + 1)
        src_out = os.path.join(SRC_DIR, name)

        if args.report:
            print("  %s 尺寸 %s" % (name, head.size))
            continue

        head.save(src_out, "PNG")                      # 原图留档（带 alpha）
        out = os.path.join(OUT_DIR, name)
        # 调色板 PNG 压体积；颜色一旦出现色带就改 None 走 RGBA（见文档）
        pal = head.convert("RGBA").quantize(colors=160, method=Image.FASTOCTREE)
        pal.save(out, "PNG", optimize=True)
        kb = os.path.getsize(out) / 1024.0
        total += kb
        print("  %s  %s  %.1fKB  → %s" % (name, head.size, kb, os.path.relpath(out, ROOT)))

    if not args.report:
        print("\n合计 %.1fKB（单文件上限 200KB、整包 1.8MB）" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
