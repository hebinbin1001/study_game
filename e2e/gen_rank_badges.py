#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_rank_badges.py —— 生成 8 个大段位的徽章图（开发期工具）

为什么是脚本生成而不是找素材：徽章是纯几何图形（盾/星/宝石/皇冠），
用代码画出来的好处是**风格统一、任意尺寸可重出、没有版权问题**。

产物：miniprogram/assets/ranks/<key>.png（96×96，透明底）
用法：python e2e/gen_rank_badges.py
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

SIZE = 96
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "miniprogram", "assets", "ranks")

# key, 主色, 深色, 图形
RANKS = [
    ("bronze",   (184, 115, 51),  (120, 72, 26),  "shield"),
    ("silver",   (192, 198, 207), (124, 132, 146), "shield_bar"),
    ("gold",     (255, 209, 102), (201, 148, 0),  "star5"),
    ("platinum", (142, 227, 208), (32, 150, 128), "hexagon"),
    ("diamond",  (126, 196, 255), (32, 118, 208), "gem"),
    ("star",     (179, 136, 255), (98, 53, 205),  "star4"),
    ("king",     (255, 159, 28),  (198, 60, 30),  "crown"),
    ("glory",    (255, 93, 143),  (176, 0, 100),  "crown_star"),
]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def polygon(cx, cy, r, n, rotate=-math.pi / 2):
    """正 n 边形顶点"""
    return [(cx + r * math.cos(rotate + 2 * math.pi * i / n),
             cy + r * math.sin(rotate + 2 * math.pi * i / n)) for i in range(n)]


def star(cx, cy, outer, inner, points):
    pts = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = -math.pi / 2 + math.pi * i / points
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def emblem(draw, kind, cx, cy):
    """在 (cx,cy) 处画白色徽记图形"""
    W = (255, 255, 255, 240)
    if kind == "shield":
        pts = [(cx - 20, cy - 22), (cx + 20, cy - 22), (cx + 20, cy + 4),
               (cx, cy + 26), (cx - 20, cy + 4)]
        draw.polygon(pts, fill=W)
    elif kind == "shield_bar":
        pts = [(cx - 20, cy - 22), (cx + 20, cy - 22), (cx + 20, cy + 4),
               (cx, cy + 26), (cx - 20, cy + 4)]
        draw.polygon(pts, fill=W)
        draw.rectangle([cx - 12, cy - 12, cx + 12, cy - 5], fill=(0, 0, 0, 0))
    elif kind == "star5":
        draw.polygon(star(cx, cy + 2, 26, 11, 5), fill=W)
    elif kind == "hexagon":
        draw.polygon(polygon(cx, cy + 1, 25, 6), fill=W)
    elif kind == "gem":
        # 宝石：上半梯形 + 下半倒三角
        draw.polygon([(cx - 24, cy - 8), (cx - 12, cy - 22), (cx + 12, cy - 22), (cx + 24, cy - 8)], fill=W)
        draw.polygon([(cx - 24, cy - 8), (cx + 24, cy - 8), (cx, cy + 24)], fill=W)
        draw.line([(cx - 12, cy - 22), (cx - 8, cy - 8)], fill=(0, 0, 0, 40), width=2)
        draw.line([(cx + 12, cy - 22), (cx + 8, cy - 8)], fill=(0, 0, 0, 40), width=2)
    elif kind == "star4":
        draw.polygon(star(cx, cy, 27, 8, 4), fill=W)
    elif kind == "crown":
        pts = [(cx - 26, cy + 16), (cx - 26, cy - 8), (cx - 13, cy + 2),
               (cx, cy - 16), (cx + 13, cy + 2), (cx + 26, cy - 8), (cx + 26, cy + 16)]
        draw.polygon(pts, fill=W)
        draw.rectangle([cx - 26, cy + 16, cx + 26, cy + 22], fill=W)
    elif kind == "crown_star":
        pts = [(cx - 26, cy + 14), (cx - 26, cy - 6), (cx - 13, cy + 4),
               (cx, cy - 14), (cx + 13, cy + 4), (cx + 26, cy - 6), (cx + 26, cy + 14)]
        draw.polygon(pts, fill=W)
        draw.rectangle([cx - 26, cy + 14, cx + 26, cy + 20], fill=W)
        draw.polygon(star(cx, cy - 22, 12, 5, 5), fill=(255, 255, 255, 250))


def make_badge(key, c1, c2, kind):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = 6

    # 底座阴影
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([pad, pad + 4, SIZE - pad, SIZE - pad + 4], fill=(20, 40, 70, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(4))
    img.alpha_composite(shadow)

    # 圆形底座（竖向渐变的近似：逐行填色 + 圆形遮罩）
    grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(SIZE):
        gd.line([(0, y), (SIZE, y)], fill=lerp(c1, c2, y / SIZE) + (255,))
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=255)
    img.paste(grad, (0, 0), mask)

    # 外圈高光环
    draw.ellipse([pad, pad, SIZE - pad, SIZE - pad], outline=(255, 255, 255, 200), width=3)
    draw.ellipse([pad + 5, pad + 5, SIZE - pad - 5, SIZE - pad - 5], outline=(255, 255, 255, 70), width=2)

    # 徽记
    emblem(draw, kind, SIZE / 2, SIZE / 2)

    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    path = os.path.join(OUT, key + ".png")
    img.save(path)
    return path


if __name__ == "__main__":
    for key, c1, c2, kind in RANKS:
        p = make_badge(key, c1, c2, kind)
        print("[badge] %s -> %s" % (kind, p))
    print("[badge] 共生成 %d 枚段位徽章" % len(RANKS))
