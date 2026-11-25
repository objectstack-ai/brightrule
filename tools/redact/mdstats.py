#!/usr/bin/env python3
"""统计脱敏后 Markdown 的大小：每份制度（正文 + 附件）的字数、字节数、token 估算，以及全部合计。

用法：
    python3 mdstats.py --input 脱敏结果/<时间>            （或直接给 …/脱敏文件 目录）

输出到该次结果目录下（文件名、内容都是脱敏后的，可随结果一起交出去）：
    Markdown统计.csv   每份制度一行（正文 + 附件合计），按 token 从大到小排好，第一列是排名
    Markdown统计.md    同样的排名，加上合计和阈值说明
    Markdown明细.csv   每个 .md 一行，也按大小排

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


def ranked(policies: List[Policy]) -> List[Policy]:
    return sorted(policies, key=lambda p: (-p.tokens, p.name))


def write_outputs(out_dir: Path, policies: List[Policy]) -> Tuple[Path, Path]:
    """Markdown统计.csv：每份制度一行，按 token 从大到小排好；Markdown统计.md：同样的排名加合计。
    每个 .md 的明细另存 Markdown明细.csv，也按大小排。"""
    csv_path, md_path = out_dir / 'Markdown统计.csv', out_dir / 'Markdown统计.md'
    rows = ranked(policies)
    with csv_path.open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['排名', '制度', 'token估算', '合计字数', '大小KB', '正文字数', '附件数', '超过单份阈值'])
        for i, p in enumerate(rows, start=1):
            wr.writerow([i, p.name, p.tokens, p.chars, round(p.bytes / 1024, 1),
                         p.body.chars if p.body else 0, len(p.attachments), '是' if p.tokens > PER_POLICY_TOKENS else ''])
    files = sorted(((p, m) for p in policies for m in ([p.body] if p.body else []) + p.attachments),
                   key=lambda pm: (-pm[1].tokens, str(pm[1].path)))
    with (out_dir / 'Markdown明细.csv').open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['排名', '文件', '类型', '所属制度', 'token估算', '字数', '大小KB'])
        for i, (p, m) in enumerate(files, start=1):
            wr.writerow([i, str(m.path), m.kind, p.name, m.tokens, m.chars, round(m.bytes / 1024, 1)])
    total_tokens = sum(p.tokens for p in policies)
    big = [p for p in policies if p.tokens > PER_POLICY_TOKENS]
    lines = ['# Markdown 统计（按大小从大到小）', '',
             f'- 制度 {len(policies)} 份（附件 {sum(len(p.attachments) for p in policies)} 个），'
             f'合计 {sum(p.chars for p in policies):,} 字、{kb(sum(p.bytes for p in policies))}、约 {total_tokens:,} token',
             f'- 最大：{rows[0].name}，约 {rows[0].tokens:,} token' if rows else '- 无',
             f'- 超过单份阈值 {PER_POLICY_TOKENS:,} token 的：{len(big)} 份（问这份制度时改为段落检索）',
             f'- 全部合计{"不超过" if total_tokens <= ALL_POLICIES_TOKENS else "超过"} {ALL_POLICIES_TOKENS:,} token'
             f'（{"通用问可以全部放入" if total_tokens <= ALL_POLICIES_TOKENS else "通用问需要先定位制度"}）', '',
             '| 排名 | 制度 | token 估算 | 合计字数 | 大小 | 附件 | |', '|---:|---|---:|---:|---:|---:|---|']
    for i, p in enumerate(rows, start=1):
        flag = '⚠ 超过单份阈值' if p.tokens > PER_POLICY_TOKENS else ''
        lines.append(f'| {i} | {p.name} | {p.tokens:,} | {p.chars:,} | {kb(p.bytes)} | {len(p.attachments)} | {flag} |')
    lines += ['', 'token 为估算（汉字每个计 1.5，其余每 4 个字符计 1，再加 10%），正文和全部附件都计入。'
              '每个 .md 文件的明细见 `Markdown明细.csv`。']
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
    rows = ranked(policies)
    print(f'按大小排名（前 {min(10, len(rows))} 份，共 {len(rows)} 份）：')
    print(f'  {"排名":>4}  {"token":>8}  {"字数":>8}  {"大小":>9}  制度')
    for i, p in enumerate(rows[:10], start=1):
        flag = '  ⚠ 超过单份阈值' if p.tokens > PER_POLICY_TOKENS else ''
        print(f'  {i:>4}  {p.tokens:>8,}  {p.chars:>8,}  {kb(p.bytes):>9}  {p.name}{flag}')
    print(f'完整排名：{csv_path}（Excel 打开即是排好的；每个 .md 的明细在 Markdown明细.csv）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
