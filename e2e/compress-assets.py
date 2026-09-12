#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
e2e/compress-assets.py —— 把美术原图压成「端上展示尺寸」，原图留在 assets-src/（不进包）

为什么必须做（2026-09-12 素材到货实测）：
    微信小程序**主包上限 2MB**，而原图直接进包是 31.4MB（成就 4.7 + 段位 17.5 + 皮肤 9.6），
    真机预览/上传会被包体卡住。端上实际展示尺寸很小（徽章 ~48px、成就图标 ~48px、皮肤 ~96px），
    原图尺寸纯属浪费 —— 本脚本按展示尺寸重采样，图标用调色板 PNG（扁平图能压到几 KB）。

约定（与 docs/美术素材需求与豆包提示词.md 的「先读」一致）：
    assets-src/<kind>/xxx.png   原图（**不参与打包**，.gitignore 已忽略）
        ↓ 本脚本
    miniprogram/assets/<kind>/xxx.png   展示尺寸（进包）

用法：
    python e2e/compress-assets.py            # 全量压缩并打印体积报告
    python e2e/compress-assets.py --report   # 只报体积，不写文件

尺寸/编码策略（改这里就能调整画质与体积的平衡）：
    achievements 128px + 96 色调色板 PNG   界面上 ~48px 显示，2x 屏也够锐
    ranks        128px + 96 色调色板 PNG   我的页徽章 ~32px 显示
    skins        256px + 128 色调色板 PNG  对局内立绘（未来接入时用）
说明：实测调色板 PNG 比同尺寸 RGBA PNG 小 3~5 倍，扁平/卡通素材观感几乎无差；
      若哪套图出现明显色带，把那类改成 (size, colors=None) 走 RGBA 即可。
"""

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow：pip install pillow")
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_ROOT = os.path.join(ROOT, "assets-src")
OUT_ROOT = os.path.join(ROOT, "miniprogram", "assets")

# kind -> (源目录, 目标目录, 展示尺寸, 是否用调色板量化)
# 输出位置说明（2026-09-12 改）：
#   微信的「图片和音频资源大小超过 200K」判的是**代码包内图片/音频的总量**，
#   官方建议把非必要静态资源放 CDN、用 URL 引入。所以成就图标与段位徽章**不再进包**，
#   改输出到仓库根 `art/`（由云托管静态托管，端上按 URL 加载）；
#   代码包里只留「对局立绘 + tabbar 图标」这几样必要资源。
ART_ROOT = os.path.join(ROOT, "art")
KINDS = {
    "achievements": (os.path.join(SRC_ROOT, "achievements"), os.path.join(ART_ROOT, "achievements"), 128, 96),
    # 皮肤仍在包内（对局里 canvas 直接绘制，走网络会有加载/失败风险），但要压到 192px
    # 才能让「包内图片总量」稳在 200KB 以内。
    "skins": (os.path.join(SRC_ROOT, "skins"), os.path.join(OUT_ROOT, "skins"), 192, 96),
    # 段位：端上用 -256 命名的文件，这里统一从 512 原图重采样到 128 覆盖同名文件
    "ranks": (os.path.join(SRC_ROOT, "ranks"), os.path.join(ART_ROOT, "ranks"), 128, 96),
}


def target_name(kind, name):
    """段位原图叫 rank-gold-3.png，端上读的是 rank-gold-3-256.png —— 保持端上文件名不变。"""
    if kind == "ranks":
        return name.replace(".png", "-256.png")
    return name


def convert(src, dst, size, colors):
    img = Image.open(src).convert("RGBA")
    img.thumbnail((size, size), Image.LANCZOS)
    if colors:
        # 调色板 PNG（保留透明）：convert('P', ADAPTIVE) 会把 alpha 存成透明索引，
        # 体积比 RGBA 小 3~5 倍；注意不能用 quantize()+putalpha（会得到 PA 模式，PNG 存不了）。
        img.convert("P", palette=Image.ADAPTIVE, colors=colors).save(dst, "PNG", optimize=True)
        return
    img.save(dst, "PNG", optimize=True)


def human(nbytes):
    return "%.1f KB" % (nbytes / 1024.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="只报体积，不写文件")
    args = ap.parse_args()

    total_out = 0
    total_src = 0
    rows = []

    for kind, (src_dir, out_dir, size, colors) in KINDS.items():
        if not os.path.isdir(src_dir):
            print("跳过 %s：源目录不存在 %s" % (kind, src_dir))
            continue
        os.makedirs(out_dir, exist_ok=True)
        names = sorted(f for f in os.listdir(src_dir) if f.lower().endswith(".png"))
        for name in names:
            src = os.path.join(src_dir, name)
            dst = os.path.join(out_dir, target_name(kind, name))
            total_src += os.path.getsize(src)
            if not args.report:
                convert(src, dst, size, colors)
            total_out += os.path.getsize(dst) if os.path.exists(dst) else 0
        rows.append((kind, len(names), size, colors))

    print("压缩结果：")
    for kind, n, size, colors in rows:
        print("  %-13s %3d 张 → %dpx%s" % (kind, n, size, (" / %d 色" % colors) if colors else ""))
    print("  原图合计 %s → 端上合计 %s" % (human(total_src), human(total_out)))
    if args.report:
        print("（--report 模式，未写文件）")


if __name__ == "__main__":
    main()
