#!/usr/bin/env python3
"""Veris 设计 token 对比度复算（WCAG 2.x 相对亮度公式）。

用法:python3 check-contrast.py <tokens.css>
解析 `:root {` 与 `:root.dark {` 两个块里的 #RRGGBB token,按 PAIRS 逐对计算。
任一对低于阈值时退出码为 1。改 token 后必须重跑。
"""
import re
import sys

PAIRS = [  # (前景, 背景, 阈值, 用途)
    ('ink', 'bg', 4.5, '正文 / 画布'),
    ('ink', 'surface', 4.5, '正文 / 面板'),
    ('ink', 'surface-2', 4.5, '正文 / 浅底'),
    ('ink-2', 'bg', 4.5, '次要文字 / 画布'),
    ('ink-2', 'surface', 4.5, '次要文字 / 面板'),
    ('ink-2', 'surface-2', 4.5, '次要文字 / 浅底'),
    ('ink-3', 'bg', 4.5, '辅助小字 / 画布'),
    ('ink-3', 'surface', 4.5, '辅助小字 / 面板'),
    ('ink-3', 'surface-2', 4.5, '表头小字 / 浅底'),
    ('accent', 'surface', 4.5, '链接 / 面板'),
    ('accent', 'bg', 4.5, '链接 / 画布'),
    ('accent', 'accent-soft', 4.5, '当前导航文字 / 选中底'),
    ('accent-ink', 'accent', 4.5, '主按钮文字'),
    ('on-ink', 'ink', 4.5, '「实测」徽章文字'),
    ('on-ink', 'ink-2', 4.5, '「抽样实测」徽章文字'),
    ('ink', 'accent-soft', 4.5, '正文 / 选中底'),
    ('sev-high', 'surface', 4.5, '错误文字'),
    ('sev-mid', 'surface', 4.5, '警告文字'),
    ('ok', 'surface', 4.5, '已接受 / 达标文字'),
    ('ink', 'sev-high-soft', 4.5, '错误提示条正文'),
    ('ink', 'sev-mid-soft', 4.5, '警告提示条正文'),
    ('ink', 'ok-soft', 4.5, '成功提示条正文'),
    ('sev-high', 'sev-high-soft', 3.0, '错误提示条图标'),
    ('sev-mid', 'sev-mid-soft', 3.0, '警告提示条图标'),
    ('sev-low', 'surface', 3.0, '提示级严重度方块（图形）'),
    ('ctl-border', 'surface', 3.0, '输入框边框 / 面板（WCAG 1.4.11）'),
    ('ctl-border', 'surface-2', 3.0, '输入框边框 / 浅底'),
    ('accent', 'surface', 3.0, '焦点环 / 面板（WCAG 1.4.11）'),
]


def parse(css: str, selector: str) -> dict:
    i = css.index(selector + ' {')
    j = css.index('}', i)
    return dict(re.findall(r'--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})', css[i:j]))


def lum(hexv: str) -> float:
    h = hexv.lstrip('#')
    def ch(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(int(h[k:k + 2], 16) / 255) for k in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a: str, b: str) -> float:
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    css = open(sys.argv[1], encoding='utf-8').read()
    light = parse(css, ':root')
    dark = dict(light)
    dark.update(parse(css, ':root.dark'))
    fails = 0
    print(f'{"主题":<4} {"前景":<12} {"背景":<14} {"对比度":>6}  阈值  用途')
    for theme, tokens in (('浅色', light), ('暗色', dark)):
        for fg, bg, need, use in PAIRS:
            v = ratio(tokens[fg], tokens[bg])
            ok = v >= need
            fails += 0 if ok else 1
            mark = '' if ok else '  <-- 不达标'
            print(f'{theme:<4} {fg:<12} {bg:<14} {v:6.2f}  {need:<4}  {use}{mark}')
    print(f'共 {len(PAIRS) * 2} 对，不达标 {fails} 对')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
