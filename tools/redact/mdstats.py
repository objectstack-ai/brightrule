#!/usr/bin/env python3
"""统计脱敏后 Markdown 的大小：每份制度（正文 + 附件）的字数、字节数、token 估算，以及全部合计。

用法：
    python3 mdstats.py --input 脱敏结果/<时间>            （或直接给 …/脱敏文件 目录）

输出到该次结果目录下（文件名、内容都是脱敏后的，可随结果一起交出去）：
    Markdown统计.csv   每个 .md 一行
    Markdown统计.md    按制度汇总，标出超过阈值的

token 估算用设计文档 P3.3 的统一公式：汉字每个计 1.5，其余每 4 个字符计 1，再加 10%。
阈值（设计文档场景 B、C）：单份制度超过 1.2 万 token 不再整份交给模型，改为段落检索；
全部制度合计不超过 2.4 万 token 时，通用问可以全部放入。
"""
from __future__ import annotations

import argparse
import csv
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

PER_POLICY_TOKENS = 12000
ALL_POLICIES_TOKENS = 24000
CJK = re.compile(r'[㐀-鿿豈-﫿　-〿＀-￯]')


def estimate_tokens(text: str) -> int:
    cjk = len(CJK.findall(text))
    other = len(text) - cjk
    return math.ceil((cjk * 1.5 + other / 4) * 1.1)


def count_chars(text: str) -> int:
    """字数：不计空白和 Markdown 表格竖线、标题井号等标记。"""
    return len(re.sub(r'[\s|#*>\-]', '', text))


@dataclass
class MdFile:
    path: Path
    kind: str          # 正文 / 附件
    chars: int
    bytes: int
    tokens: int


@dataclass
class Policy:
    name: str          # 相对路径（不含 .md）
    body: Optional[MdFile] = None
    attachments: List[MdFile] = field(default_factory=list)

    @property
    def tokens(self) -> int:
        return (self.body.tokens if self.body else 0) + sum(a.tokens for a in self.attachments)

    @property
    def chars(self) -> int:
        return (self.body.chars if self.body else 0) + sum(a.chars for a in self.attachments)

    @property
    def bytes(self) -> int:
        return (self.body.bytes if self.body else 0) + sum(a.bytes for a in self.attachments)


def docs_dir_of(path: Path) -> Path:
    return path / '脱敏文件' if (path / '脱敏文件').is_dir() else path


def collect(docs: Path) -> List[Policy]:
    policies: Dict[str, Policy] = {}
    for md in sorted(docs.rglob('*.md')):
        rel = md.relative_to(docs)
        text = md.read_text(encoding='utf-8', errors='replace')
        parent = rel.parent.name
        if parent.endswith('-附件'):
            key = str(rel.parent.parent / parent[:-len('-附件')])
            kind = '附件'
        else:
            key = str(rel.with_suffix(''))
            kind = '正文'
        f = MdFile(rel, kind, count_chars(text), md.stat().st_size, estimate_tokens(text))
        p = policies.setdefault(key, Policy(key))
        if kind == '正文':
            p.body = f
        else:
            p.attachments.append(f)
    return sorted(policies.values(), key=lambda p: p.name)


def kb(n: int) -> str:
    return f'{n / 1024:.1f} KB'


def write_outputs(out_dir: Path, policies: List[Policy]) -> Tuple[Path, Path]:
    csv_path, md_path = out_dir / 'Markdown统计.csv', out_dir / 'Markdown统计.md'
    with csv_path.open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['制度', '文件', '类型', '字数', '字节', 'token估算'])
        for p in policies:
            for m in ([p.body] if p.body else []) + p.attachments:
                wr.writerow([p.name, str(m.path), m.kind, m.chars, m.bytes, m.tokens])
    total_tokens = sum(p.tokens for p in policies)
    big = [p for p in policies if p.tokens > PER_POLICY_TOKENS]
    lines = ['# Markdown 统计', '',
             f'- 制度 {len(policies)} 份，Markdown 文件 {sum((1 if p.body else 0) + len(p.attachments) for p in policies)} 个'
             f'（附件 {sum(len(p.attachments) for p in policies)} 个）',
             f'- 合计 {sum(p.chars for p in policies):,} 字，{kb(sum(p.bytes for p in policies))}，约 {total_tokens:,} token',
             f'- 单份最大约 {max((p.tokens for p in policies), default=0):,} token；'
             f'中位约 {sorted(p.tokens for p in policies)[len(policies) // 2] if policies else 0:,} token',
             f'- 超过单份阈值 {PER_POLICY_TOKENS:,} token（问这份制度时改为段落检索）：{len(big)} 份',
             f'- 全部合计{"不超过" if total_tokens <= ALL_POLICIES_TOKENS else "超过"} {ALL_POLICIES_TOKENS:,} token'
             f'（{"通用问可以全部放入" if total_tokens <= ALL_POLICIES_TOKENS else "通用问需要先定位制度"}）', '',
             'token 为估算（汉字每个计 1.5，其余每 4 个字符计 1，再加 10%）；正文 + 全部附件计入，表单附件实际不一定交给模型。', '',
             '| 制度 | 正文字数 | 附件 | 合计字数 | 大小 | token 估算 | |', '|---|---:|---:|---:|---:|---:|---|']
    for p in sorted(policies, key=lambda p: -p.tokens):
        flag = '超过单份阈值' if p.tokens > PER_POLICY_TOKENS else ''
        lines.append(f'| {p.name} | {p.body.chars if p.body else 0:,} | {len(p.attachments)} | {p.chars:,} | {kb(p.bytes)} '
                     f'| {p.tokens:,} | {flag} |')
    md_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return csv_path, md_path


def summary_lines(policies: List[Policy]) -> List[str]:
    total = sum(p.tokens for p in policies)
    big = sum(1 for p in policies if p.tokens > PER_POLICY_TOKENS)
    return [f'Markdown：{len(policies)} 份制度，合计 {sum(p.chars for p in policies):,} 字、'
            f'{kb(sum(p.bytes for p in policies))}、约 {total:,} token；'
            f'单份最大约 {max((p.tokens for p in policies), default=0):,} token，超过 {PER_POLICY_TOKENS:,} 的 {big} 份。']


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='统计脱敏后 Markdown 的字数、大小和 token 估算')
    ap.add_argument('--input', required=True, type=Path, help='一次脱敏的结果目录（脱敏结果/<时间>），或其中的「脱敏文件」目录')
    args = ap.parse_args(argv)
    docs = docs_dir_of(args.input)
    if not docs.is_dir():
        raise SystemExit(f'目录不存在：{args.input}')
    policies = collect(docs)
    if not policies:
        raise SystemExit(f'{docs} 里没有 .md 文件（脱敏时用了 --no-md？）')
    out_dir = docs.parent if docs.name == '脱敏文件' else docs
    csv_path, md_path = write_outputs(out_dir, policies)
    for line in summary_lines(policies):
        print(line)
    print('最大的 5 份：')
    for p in sorted(policies, key=lambda p: -p.tokens)[:5]:
        print(f'  {p.tokens:>8,} token  {p.chars:>8,} 字  {kb(p.bytes):>9}  {p.name}' + (f'（含附件 {len(p.attachments)} 个）' if p.attachments else ''))
    print(f'明细：{csv_path}')
    print(f'汇总：{md_path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
