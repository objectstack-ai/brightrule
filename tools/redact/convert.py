#!/usr/bin/env python3
"""把一个文件夹里的 .doc / .rtf / .wps 等旧格式批量转成 .docx（脱敏前的准备步骤，单独运行）。

用法：
    python3 convert.py --input 原件目录 --output 转换后目录

结果是一个完整的、全是 .docx 的文件夹，目录结构与原件一致，直接作为扫描和脱敏的 --input：
- .doc / .dot / .rtf / .wps / .odt / .docm / .dotx：转成 .docx（装了 LibreOffice 用它；否则用 Mac 自带的 textutil，
  textutil 会丢页眉页脚，且不支持 .wps）。扩展名是 .doc、其实是 .docx 的文件直接更正扩展名。
- .docx：原样复制过去。
- 其他文件（PDF、图片、Excel 等）：不复制，在终端和报告里列出。

原件只读。转换结果含原文，属于内部资料。再次运行时，已经转换过且原件没改动的文件会跳过；加 --overwrite 全部重转。
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


def up_to_date(src: Path, dst: Path) -> bool:
    return dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='把 .doc / .rtf / .wps 等批量转成 .docx（脱敏前的准备步骤）')
    ap.add_argument('--input', required=True, type=Path, help='原件目录（只读，含子目录）')
    ap.add_argument('--output', required=True, type=Path, help='转换后目录：全是 .docx，结构与原件一致，作为扫描和脱敏的 --input')
    ap.add_argument('--overwrite', action='store_true', help='已经转换过的也重新转换')
    args = ap.parse_args(argv)
    src_root, out_root = args.input.resolve(), args.output.resolve()
    if not src_root.is_dir():
        raise SystemExit(f'原件目录不存在：{args.input}')
    if out_root == src_root or src_root in out_root.parents:
        raise SystemExit('转换后目录不能是原件目录，也不能放在原件目录里面。')

    files = sorted(p for p in src_root.rglob('*') if p.is_file() and not p.name.startswith(('~$', '.')))
    old = [p for p in files if p.suffix.lower() in CONVERTIBLE]
    docx = [p for p in files if p.suffix.lower() == '.docx']
    others = [p for p in files if p not in old and p not in docx]
    # 同一目录下同名的 a.doc 和 a.docx 会落到同一个输出文件上
    targets = {}
    clashes = []
    for p in docx + old:
        t = out_root / p.relative_to(src_root).with_suffix('.docx')
        if t in targets:
            clashes.append((targets[t], p))
        targets[t] = p
    if clashes:
        raise SystemExit('以下文件转换后会重名（同一目录下有同名的 .doc 和 .docx），请先改名或删掉旧版本：\n'
                         + '\n'.join(f'  {a.relative_to(src_root)}  和  {b.relative_to(src_root)}' for a, b in clashes))

    tool = find_soffice()
    print(f'原件：{len(old)} 个旧格式、{len(docx)} 个 .docx、{len(others)} 个其他文件。'
          f'转换工具：{"LibreOffice" if tool else ("Mac textutil（会丢页眉页脚，建议安装 LibreOffice）" if shutil.which("textutil") else "无")}')
    converted: List[Tuple[Path, str]] = []
    failed: List[Tuple[Path, str]] = []
    skipped_same = 0
    for n, p in enumerate(old, start=1):
        dst = out_root / p.relative_to(src_root).with_suffix('.docx')
        if not args.overwrite and up_to_date(p, dst):
            skipped_same += 1
            continue
        how, why = convert_to_docx(p, dst)
        rel = p.relative_to(src_root)
        if how:
            converted.append((p, how))
            print(f'  [{n}/{len(old)}] 已转换  {rel}', flush=True)
        else:
            failed.append((p, why))
            print(f'  [{n}/{len(old)}] 失败    {rel}  ← {why}', flush=True)
    copied = 0
    for p in docx:
        dst = out_root / p.relative_to(src_root)
        if not args.overwrite and up_to_date(p, dst):
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dst)
        copied += 1

    report = out_root.parent / f'{out_root.name}-转换报告.md'
    lines = ['# 转换报告（内部留存，勿外发）', '',
             f'- 时间：{_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
             f'- 原件目录：{src_root}', f'- 转换后目录：{out_root}',
             f'- 转换 {len(converted)} 个，失败 {len(failed)} 个，复制 .docx {copied} 个，'
             f'已是最新跳过 {skipped_same} 个，未处理的其他文件 {len(others)} 个', '',
             '转换后的文件请抽查：红头、表格、自动编号（第X条）、落款和印章的位置。', '']
    if converted:
        lines += ['## 已转换', ''] + [f'- {p.relative_to(src_root)}（{how}）' for p, how in converted] + ['']
    if failed:
        lines += ['## 转换失败（请在 WPS / Word 里手动另存为 .docx，放进转换后目录的同一位置）', '']
        lines += [f'- {p.relative_to(src_root)}：{why}' for p, why in failed] + ['']
    if others:
        lines += ['## 没有处理的其他文件（PDF、图片、Excel 等，脱敏工具不处理）', '']
        lines += [f'- {p.relative_to(src_root)}' for p in others] + ['']
    out_root.mkdir(parents=True, exist_ok=True)
    report.write_text('\n'.join(lines), encoding='utf-8')

    print(f'转换 {len(converted)} 个，失败 {len(failed)} 个，复制 .docx {copied} 个'
          + (f'，已是最新跳过 {skipped_same} 个' if skipped_same else '') + '。')
    if others:
        print(f'没有处理的其他文件 {len(others)} 个（PDF、图片等），见转换报告。')
    print(f'转换后目录：{out_root}  ← 扫描和脱敏的 --input 用这个目录')
    print(f'转换报告：{report}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
