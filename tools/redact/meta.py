#!/usr/bin/env python3
"""扫描元数据：读每份 Word 开头的「制度信息表」，连同文号、发文日期、施行日期、附件数，汇总成一个 Excel。

用法：
    python3 meta.py --input 原件目录 [--output 某目录或某文件.xlsx]

输出（默认在原件目录旁边）：<原件目录名>-元数据-<时间>.xlsx，三张表：
    元数据     一份制度一行。常用字段在前；信息表里有的其他格子（如「废止日期」）自动加列，不会漏。
               找不到的字段空着。日期统一成 2025-05-26，原文写法另留一列。
    问题       没有信息表、制度编码重复、日期认不出、同一个意思写法不同（如「归口部门」写成了「责任部门」以外的叫法）。
    字段统计   每个字段名在多少份文件里出现：一眼看出各部门的信息表格式统一不统一。

读的是原件，表里是真实名称：这个 Excel 和原件一样只留在本地，不外发。
"""
from __future__ import annotations

import argparse
import datetime as _dt
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from docx2md import document_markdown  # noqa: E402
from package import EFFECTIVE, date_iso, metadata, sections  # noqa: E402

# 常用字段：列名 → 同一个意思的其他写法（第一种写法之外的都记进「问题」）
STANDARD: List[Tuple[str, Tuple[str, ...]]] = [
    ('制度名称', ('文件名称',)),
    ('制度编码', ('制度编号', '文件编号', '制度代码')),
    ('制度类别', ('制度分类', '类别')),
    ('制度层级', ('层级', '制度级别')),
    ('生效日期', ('施行日期', '实施日期')),
    ('审议主体', ()),
    ('决议主体', ()),
    ('责任部门', ('归口部门', '主责部门', '归口管理部门')),
    ('协同部门', ('配合部门',)),
    ('关联制度/文件', ('关联制度', '关联文件', '相关制度')),
]
ALIAS = {alias: std for std, aliases in STANDARD for alias in aliases}
DATE_FIELDS = {'生效日期'}
EMPTY = re.compile(r'^[\s/／\\—\-–_无空]*$')
TAIL = ['发文文号', '发文日期', '正文「自××起施行」', '附件数']


def clean(value: str) -> str:
    v = re.sub(r'\s+', ' ', (value or '').replace('<br>', ' ')).strip()
    return '' if EMPTY.match(v) else v


LABEL = re.compile(r'^[\u4e00-\u9fff/／（）()、]{2,10}$')   # 字段名：两到十个汉字（可带 / 括号），不含数字


def label_pairs(text: str) -> Dict[str, str]:
    """信息表每一行按「名称｜值｜名称｜值」两两成对；合并单元格在 Markdown 里会重复同一个值，跳过重复的。"""
    pairs: Dict[str, str] = {}
    for line in text.splitlines():
        if not line.startswith('|') or set(line) <= set('|-: '):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        i = 0
        while i < len(cells) - 1:
            key = re.sub(r'\s', '', cells[i])
            if LABEL.match(key) and key not in pairs:
                j = i + 1
                value = cells[j]
                while j + 1 < len(cells) and cells[j + 1] == value:   # 合并单元格
                    j += 1
                pairs[key] = value
                i = j + 1
            else:
                i += 1
    return pairs


def scan_one(path: Path) -> Tuple[Dict[str, str], Dict[str, str], List[str]]:
    """返回（按常用列归好的值, 信息表原样的「字段名→值」, 问题）。"""
    with zipfile.ZipFile(path) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    md, attachments = document_markdown(parts)
    sec = sections(md)
    raw = {k: clean(v) for k, v in label_pairs(sec.get('制度信息', '')).items()}
    problems: List[str] = []
    if not sec.get('制度信息'):
        problems.append('没有制度信息表')
    row: Dict[str, str] = {}
    for key, value in raw.items():
        std = ALIAS.get(key, key)
        if std != key:
            problems.append(f'写法不同：「{key}」（常用写法「{std}」）')
        if not row.get(std):
            row[std] = value          # 空值也占列：「有这个字段但没填」
    for f in DATE_FIELDS:
        if row.get(f):
            row[f + '（原文）'] = row[f]
            iso = date_iso(row[f])
            if iso:
                row[f] = iso
            else:
                problems.append(f'{f}「{row[f]}」认不出')
                row[f] = ''
    meta, _missing = metadata(md, path.stem)
    row['发文文号'] = meta.get('version_no', '')
    # 发文日期只从发文通知、版记里取；文件里没有这两部分就空着（不拿信息表或正文里的日期顶替）
    row['发文日期'] = meta.get('issued_date', '') if (sec.get('发文通知') or sec.get('版记')) else ''
    e = EFFECTIVE.search(sec.get('正文', md))
    row['正文「自××起施行」'] = date_iso(e.group(1)) if e else ''
    row['附件数'] = str(len(attachments)) if attachments else ''
    return row, raw, problems


def collect(root: Path) -> Tuple[List[Tuple[str, Dict[str, str], Dict[str, str], List[str]]], List[str]]:
    rows, skipped = [], []
    for p in sorted(root.rglob('*')):
        if not p.is_file() or p.name.startswith(('~$', '.')):
            continue
        rel = str(p.relative_to(root))
        if p.suffix.lower() != '.docx':
            if p.suffix.lower() in ('.doc', '.wps', '.rtf') and not p.with_suffix('.docx').exists():
                skipped.append(f'{rel}：旧格式，先运行 ./run.sh convert 转成 .docx')
            continue
        try:
            row, raw, problems = scan_one(p)
        except (zipfile.BadZipFile, KeyError, ValueError) as e:
            skipped.append(f'{rel}：读不了（{type(e).__name__}），不是有效的 .docx')
            continue
        rows.append((rel, row, raw, problems))
    return rows, skipped


def write_xlsx(out: Path, rows, skipped: List[str]) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    std_cols = [s for s, _ in STANDARD]
    extra = Counter(k for _, row, _, _ in rows for k in row if k not in std_cols and k not in TAIL
                    and not k.endswith('（原文）'))
    cols = (['文件'] + std_cols + [c for c, _ in extra.most_common()]
            + [f + '（原文）' for f in DATE_FIELDS] + TAIL)

    # 制度编码重复
    by_code = defaultdict(list)
    for rel, row, _, _ in rows:
        if row.get('制度编码'):
            by_code[row['制度编码']].append(rel)
    issues = [(rel, p) for rel, _, _, problems in rows for p in problems]
    issues += [(rel, f'制度编码「{code}」重复（共 {len(files)} 份）') for code, files in by_code.items() if len(files) > 1
               for rel in files]
    issues += [(s.split('：', 1)[0], s.split('：', 1)[1]) for s in skipped]

    wb = Workbook()
    head = Font(bold=True)
    fill = PatternFill('solid', fgColor='E8EEF7')

    def sheet(ws, header, data, widths):
        ws.append(header)
        for c in ws[1]:
            c.font, c.fill = head, fill
        for r in data:
            ws.append(r)
        ws.freeze_panes = 'B2'
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
        for row in ws.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(vertical='top', wrap_text=True)

    ws = wb.active
    ws.title = '元数据'
    sheet(ws, cols, [[rel] + [row.get(c, '') for c in cols[1:]] for rel, row, _, _ in rows],
          [48] + [16] * (len(cols) - 1))
    sheet(wb.create_sheet('问题'), ['文件', '问题'], [list(i) for i in issues], [60, 60])
    label_count = Counter(k for _, _, raw, _ in rows for k in raw)
    stats = [[k, n, ALIAS.get(k, k) if k in ALIAS or k in std_cols else '（其他字段，单独成列）']
             for k, n in label_count.most_common()]
    sheet(wb.create_sheet('字段统计'), ['信息表里的字段名', '出现在几份文件', '归入哪一列'], stats, [24, 16, 24])
    wb.save(out)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='扫描制度信息表等元数据，汇总成 Excel')
    ap.add_argument('--input', required=True, type=Path, help='原件目录（可有子目录）')
    ap.add_argument('--output', type=Path, help='输出的 .xlsx 文件或目录；默认放在原件目录旁边')
    args = ap.parse_args(argv)
    root = args.input.resolve()
    if not root.is_dir():
        raise SystemExit(f'目录不存在：{args.input}')
    rows, skipped = collect(root)
    if not rows:
        raise SystemExit(f'{root} 里没有可读的 .docx')
    name = f'{root.name}-元数据-{_dt.datetime.now().strftime("%Y%m%d-%H%M")}.xlsx'
    out = args.output or root.parent / name
    if out.suffix.lower() != '.xlsx':
        out.mkdir(parents=True, exist_ok=True)
        out = out / name
    write_xlsx(out, rows, skipped)
    no_table = sum(1 for _, _, _, p in rows if '没有制度信息表' in p)
    print(f'扫描 {len(rows)} 份：有制度信息表 {len(rows) - no_table} 份，没有 {no_table} 份；跳过 {len(skipped)} 个文件。')
    print(f'元数据：{out}')
    print('这个 Excel 里是原文的名称，和原件一样只留在本地，不要外发。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
