# -*- coding: utf-8 -*-
"""UI 布局全量扫描器（一次性审查工具，不属于打包目录）。

输出七个维度的统计，供人工按审查清单逐项判定：
  1 字号档位  2 间距档位  3 圆角档位  4 色值漂移
  5 触控热区（wxml 可点元素 -> wxss 尺寸）  6 安全区  7 页面骨架
"""
import os, re, json, collections

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram')
ROOT = os.path.normpath(ROOT)

TOKENS = {
    'ink': {'#3a3a5c', '#2c4a6b', '#2f5470', '#2f4a6b', '#4a6b8a', '#3a5a80'},
    'sub': {'#5c7f9e', '#8a9bb5', '#7b93ad', '#93a9bd', '#6d8aa5', '#8899aa'},
    'gold': {'#ffd166'}, 'orange': {'#ffb703', '#ff8f00', '#ff9a1f', '#ff9800'},
    'green': {'#7bd389', '#2e8b57', '#2fa96b', '#1b8f4b', '#3fbf5f', '#12a08c'},
    'blue': {'#4cc9f0', '#4a9fe8', '#5aa9e6', '#4a90d9', '#4285f4', '#7dbdf2', '#8fd0ff'},
    'danger': {'#ff5a5a', '#e62e2e', '#d64545'},
}
KNOWN = set()
for v in TOKENS.values():
    KNOWN |= v


def read(p):
    try:
        return open(p, encoding='utf-8').read()
    except Exception:
        return ''


def walk(ext):
    for dp, dn, fn in os.walk(ROOT):
        if 'node_modules' in dp:
            continue
        for f in fn:
            if f.endswith(ext):
                yield os.path.join(dp, f)


# ---------- 1/2/3 档位分布 ----------
def counters():
    fs, sp, rd = collections.Counter(), collections.Counter(), collections.Counter()
    for p in walk('.wxss'):
        t = read(p)
        for m in re.finditer(r'font-size:\s*(\d+)rpx', t):
            fs[int(m.group(1))] += 1
        for m in re.finditer(r'(?:margin|padding)(?:-(?:top|bottom|left|right))?:\s*([^;]+);', t):
            for n in re.findall(r'(\d+)rpx', m.group(1)):
                sp[int(n)] += 1
        for m in re.finditer(r'border-radius:\s*(\d+)rpx', t):
            rd[int(m.group(1))] += 1
    return fs, sp, rd


# ---------- 4 色值漂移 ----------
def colors():
    per = {}
    allc = collections.Counter()
    for p in walk('.wxss'):
        t = read(p)
        cs = [c.lower() for c in re.findall(r'#[0-9a-fA-F]{3,8}\b', t)]
        for a, b in [('#fff', '#ffffff'), ('#f00', '#ff0000')]:
            cs = [b if c == a else c for c in cs]
        per[os.path.relpath(p, ROOT)] = collections.Counter(cs)
        allc.update(cs)
    return per, allc


# ---------- 5 触控热区 ----------
def tap_targets():
    """wxml 里带 bind/catch tap 的元素 class -> 该 class 在 wxss 里的 height/width/min-height"""
    out = []
    for p in walk('.wxml'):
        page = os.path.basename(os.path.dirname(p))
        t = read(p)
        # 逐标签抽取
        for m in re.finditer(r'<([a-z\-]+)([^>]*bind(?:tap|touchstart|longtap)[^>]*)>', t):
            attrs = m.group(2)
            cls = re.search(r'class="([^"]*)"', attrs)
            if not cls:
                continue
            classes = [c for c in re.split(r'[\s]+', cls.group(1)) if c and '{{' not in c]
            out.append((page, m.group(1), classes))
    # 汇总每个页面 wxss 的 class 尺寸
    sizes = {}
    for p in walk('.wxss'):
        t = read(p)
        page = os.path.basename(os.path.dirname(p))
        for m in re.finditer(r'\.([A-Za-z0-9_\-]+)\s*\{([^}]*)\}', t):
            cls, body = m.group(1), m.group(2)
            h = re.search(r'(?:^|[; ])height:\s*(\d+)rpx', body)
            w = re.search(r'(?:^|[; ])width:\s*(\d+)rpx', body)
            mh = re.search(r'min-height:\s*(\d+)rpx', body)
            pt = re.findall(r'padding(?:-(?:top|bottom))?:\s*(\d+)rpx', body)
            fs = re.search(r'font-size:\s*(\d+)rpx', body)
            if h or w or mh or fs:
                sizes.setdefault(page, {})[cls] = {
                    'h': int(h.group(1)) if h else None,
                    'w': int(w.group(1)) if w else None,
                    'minh': int(mh.group(1)) if mh else None,
                    'pad': max([int(x) for x in pt], default=0),
                    'fs': int(fs.group(1)) if fs else None,
                }
    return out, sizes


# ---------- 6 安全区 ----------
def safe_area():
    fixed_pages, safe_pages = [], []
    for p in walk('.wxss'):
        page = os.path.basename(os.path.dirname(p))
        t = read(p)
        if 'position: fixed' in t or 'position:fixed' in t:
            fixed_pages.append(page)
        if 'safe-area-inset-bottom' in t:
            safe_pages.append(page)
    return sorted(set(fixed_pages)), sorted(set(safe_pages))


# ---------- 7 骨架：page 是否可滚动 / min-height ----------
def skeleton():
    rows = []
    for p in walk('.wxml'):
        page = os.path.basename(os.path.dirname(p))
        t = read(p)
        wx = read(p.replace('.wxml', '.wxss'))
        rows.append({
            'page': page,
            'scroll': ('scroll-view' in t) or ('scroll-y' in t),
            'root': re.findall(r'class="([^"]*)"', t)[:1],
            'minh': 'min-height: 100vh' in wx or 'height: 100vh' in wx,
        })
    return rows


if __name__ == '__main__':
    fs, sp, rd = counters()
    print('=== 1 字号档位（rpx : 次数） ===')
    print('总声明', sum(fs.values()), '档位数', len(fs))
    for k in sorted(fs):
        print('  %3d x%-4d %s' % (k, fs[k], '#' * min(fs[k], 40)))
    print()
    print('=== 2 间距档位 ===')
    for k in sorted(sp):
        print('  %3d x%-4d %s' % (k, sp[k], '#' * min(sp[k], 40)))
    print()
    print('=== 3 圆角档位 ===')
    for k in sorted(rd):
        print('  %3d x%-4d %s' % (k, rd[k], '#' * min(rd[k], 40)))
    print()
    per, allc = colors()
    print('=== 4 色值总数 ===', len(allc), '（出现总次数', sum(allc.values()), '）')
    print('非标准 token 色值（出现>=3次）：')
    for c, n in allc.most_common():
        if c not in KNOWN and n >= 3:
            print('   %s x%d' % (c, n))
    print()
    print('各页色值档位数（>12 说明配色分散）：')
    for p, c in sorted(per.items(), key=lambda x: -len(x[1]))[:15]:
        print('   %-40s %d 种' % (p, len(c)))
    print()
    out, sizes = tap_targets()
    print('=== 5 触控热区：可点元素且高度 < 88rpx（或完全没设尺寸） ===')
    bad = []
    for page, tag, classes in out:
        sd = sizes.get(page, {})
        hit = [sd[c] for c in classes if c in sd]
        h = max([x['h'] or 0 for x in hit], default=0)
        mh = max([x['minh'] or 0 for x in hit], default=0)
        fs_ = max([x['fs'] or 0 for x in hit], default=0)
        eff = max(h, mh, 0)
        if eff == 0:
            eff = fs_ * 1.4  # 纯文字元素：按字号*行高估算
        if eff < 88:
            bad.append((page, tag, ','.join(classes), eff))
    seen = set()
    for page, tag, cls, eff in sorted(bad):
        k = (page, cls)
        if k in seen:
            continue
        seen.add(k)
        print('   %-16s %-10s .%-30s 有效高度≈%.0frpx' % (page, tag, cls, eff))
    print()
    fx, sf = safe_area()
    print('=== 6 安全区 ===')
    print('有 fixed 定位的页面:', ', '.join(fx))
    print('已处理 safe-area-inset-bottom:', ', '.join(sf) or '（无）')
    print('fixed 但未处理安全区:', ', '.join(sorted(set(fx) - set(sf))) or '（无）')
    print()
    print('=== 7 骨架 ===')
    for r in skeleton():
        print('   %-16s scroll=%-5s minvh=%-5s root=%s' % (r['page'], r['scroll'], r['minh'], r['root']))
