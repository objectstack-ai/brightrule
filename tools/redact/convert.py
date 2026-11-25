#!/usr/bin/env python3
"""把一个文件夹里的 .doc / .rtf / .wps 等旧格式批量转成 .docx（脱敏前的准备步骤，单独运行）。

用法：
    python3 convert.py --input 原件目录              就地转换：a.doc 旁边生成 a.docx，a.doc 保留不动
    python3 convert.py --input 原件目录 --output 目录  另存到别的目录：全是 .docx，结构与原件一致（.docx 原样复制）

- .doc / .dot / .rtf / .wps / .odt / .docm / .dotx：转成 .docx（装了 LibreOffice 用它；否则用 Mac 自带的 textutil，
  textutil 会丢页眉页脚，且不支持 .wps）。扩展名是 .doc、其实是 .docx 的文件直接更正扩展名。
- 已经有同名 .docx 的不再转换、也不覆盖（那可能是人工另存的版本）；加 --overwrite 才覆盖。
- 其他文件（PDF、图片、Excel 等）不处理，在终端和报告里列出。

旧格式原件只读，不会被修改或删除。转换结果含原文，属于内部资料。
"""
from __future__ import annotations

import argparse
import datetime as _dt
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

CONVERTIBLE = ('.doc', '.dot', '.rtf', '.wps', '.odt', '.docm', '.dotx')


def find_soffice() -> Optional[str]:
    for c in (shutil.which('soffice'), shutil.which('libreoffice'),
              '/Applications/LibreOffice.app/Contents/MacOS/soffice'):
        if c and Path(c).exists():
            return c
    return None


def convert_to_docx(src: Path, dst: Path) -> Tuple[Optional[str], str]:
    """把 .doc 等转成 .docx。返回（用的转换工具，失败原因）。原件只读。"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    with src.open('rb') as f:
        magic = f.read(2)
    if magic == b'PK' and src.suffix.lower() in ('.doc', '.docm', '.dotx'):
        shutil.copyfile(src, dst)  # 其实就是 .docx，只是扩展名不对
        return '扩展名更正', ''
    soffice = find_soffice()
    if soffice:
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp, 'profile').as_uri()  # 独立配置，不和正在打开的 LibreOffice 冲突
            try:
                subprocess.run([soffice, f'-env:UserInstallation={profile}', '--headless', '--convert-to', 'docx',
                                '--outdir', tmp, str(src)], capture_output=True, timeout=300, check=False)
            except subprocess.TimeoutExpired:
                return None, 'LibreOffice 转换超时（文件可能加了密码或已损坏）'
            out = Path(tmp, src.stem + '.docx')
            if out.exists():
                shutil.move(str(out), dst)
                return 'LibreOffice', ''
            return None, 'LibreOffice 转换失败（文件可能加了密码或已损坏）'
    textutil = shutil.which('textutil')
    if textutil and src.suffix.lower() in ('.doc', '.dot', '.rtf', '.odt', '.docm'):
        r = subprocess.run([textutil, '-convert', 'docx', '-output', str(dst), str(src)],
                           capture_output=True, text=True, timeout=300, check=False)
        if r.returncode == 0 and dst.exists():
            return 'Mac textutil', ''
        return None, f'textutil 转换失败：{(r.stderr or "").strip()[:80]}'
    return None, '没有可用的转换工具：请安装 LibreOffice（.wps 只能用 LibreOffice 转），或在 WPS / Word 里另存为 .docx'


def has_docx_sibling(p: Path) -> bool:
    """旧格式文件旁边已有同名 .docx（通常就是它的转换结果）：扫描和脱敏时只处理那份 .docx。"""
    return p.suffix.lower() in CONVERTIBLE and p.with_suffix('.docx').exists()


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='把 .doc / .rtf / .wps 等批量转成 .docx（脱敏前的准备步骤）')
    ap.add_argument('--input', required=True, type=Path, help='原件目录（含子目录）')
    ap.add_argument('--output', type=Path, help='不填：就地转换，a.doc 旁边生成 a.docx；填了：转到这个目录，.docx 原样复制过去')
    ap.add_argument('--overwrite', action='store_true', help='同名 .docx 已存在时也重新转换并覆盖')
    args = ap.parse_args(argv)
    src_root = args.input.resolve()
    if not src_root.is_dir():
        raise SystemExit(f'原件目录不存在：{args.input}')
    in_place = args.output is None
    out_root = src_root if in_place else args.output.resolve()
    if not in_place and (out_root == src_root or src_root in out_root.parents):
        raise SystemExit('--output 不能是原件目录，也不能放在原件目录里面；要在原位置转换，去掉 --output。')

    files = sorted(p for p in src_root.rglob('*') if p.is_file() and not p.name.startswith(('~$', '.')))
    old = [p for p in files if p.suffix.lower() in CONVERTIBLE]
    docx = [p for p in files if p.suffix.lower() == '.docx']
    others = [p for p in files if p not in old and p not in docx]
    # 同一目录下 a.doc 和 a.rtf 都要转成 a.docx
    seen = {}
    clashes = []
    for p in old:
        t = p.with_suffix('.docx').relative_to(src_root)
        if t in seen:
            clashes.append((seen[t], p))
        seen[t] = p
    if clashes:
        raise SystemExit('以下文件转换后会重名（同一目录下有同名的旧格式文件），请先改名：\n'
                         + '\n'.join(f'  {a.relative_to(src_root)}  和  {b.relative_to(src_root)}' for a, b in clashes))

    tool = find_soffice()
    print(f'原件：{len(old)} 个旧格式、{len(docx)} 个 .docx、{len(others)} 个其他文件。'
          f'转换工具：{"LibreOffice" if tool else ("Mac textutil（会丢页眉页脚，建议安装 LibreOffice）" if shutil.which("textutil") else "无")}')
    converted: List[Tuple[Path, str]] = []
    failed: List[Tuple[Path, str]] = []
    exists: List[Path] = []
    for n, p in enumerate(old, start=1):
        dst = out_root / p.relative_to(src_root).with_suffix('.docx')
        rel = p.relative_to(src_root)
        if dst.exists() and not args.overwrite:
            exists.append(p)
            continue
        how, why = convert_to_docx(p, dst)
        if how:
            converted.append((p, how))
            print(f'  [{n}/{len(old)}] 已转换  {rel}  →  {dst.name}', flush=True)
        else:
            failed.append((p, why))
            print(f'  [{n}/{len(old)}] 失败    {rel}  ← {why}', flush=True)
    copied = 0
    if not in_place:
        for p in docx:
            dst = out_root / p.relative_to(src_root)
            if dst.exists() and not args.overwrite and dst.stat().st_mtime >= p.stat().st_mtime:
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dst)
            copied += 1

    stamp = _dt.datetime.now().strftime('%Y%m%d-%H%M')
    report = (src_root.parent / f'{src_root.name}-转换报告-{stamp}.md' if in_place
              else out_root.parent / f'{out_root.name}-转换报告-{stamp}.md')
    lines = ['# 转换报告（内部留存，勿外发）', '',
             f'- 时间：{_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
             f'- 原件目录：{src_root}', f'- 转换到：{"原位置（与旧格式文件同一文件夹）" if in_place else out_root}',
             f'- 转换 {len(converted)} 个，失败 {len(failed)} 个，已有同名 .docx 跳过 {len(exists)} 个'
             + ('' if in_place else f'，复制 .docx {copied} 个') + f'，未处理的其他文件 {len(others)} 个', '',
             '转换后的文件请抽查：红头、表格、自动编号（第X条）、落款和印章的位置。', '']
    if converted:
        lines += ['## 已转换', ''] + [f'- {p.relative_to(src_root)}（{how}）' for p, how in converted] + ['']
    if failed:
        lines += ['## 转换失败（请在 WPS / Word 里手动另存为同名 .docx）', '']
        lines += [f'- {p.relative_to(src_root)}：{why}' for p, why in failed] + ['']
    if exists:
        lines += ['## 已有同名 .docx，没有转换（要重新转换加 --overwrite，会覆盖那份 .docx）', '']
        lines += [f'- {p.relative_to(src_root)}' for p in exists] + ['']
    if others:
        lines += ['## 没有处理的其他文件（PDF、图片、Excel 等，脱敏工具不处理）', '']
        lines += [f'- {p.relative_to(src_root)}' for p in others] + ['']
    out_root.mkdir(parents=True, exist_ok=True)
    report.write_text('\n'.join(lines), encoding='utf-8')

    print(f'转换 {len(converted)} 个，失败 {len(failed)} 个'
          + (f'，已有同名 .docx 跳过 {len(exists)} 个' if exists else '')
          + ('' if in_place else f'，复制 .docx {copied} 个') + '。')
    if others:
        print(f'没有处理的其他文件 {len(others)} 个（PDF、图片等），见转换报告。')
    print(f'扫描和脱敏的 --input 用：{out_root}')
    print(f'转换报告：{report}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
