#!/usr/bin/env python3
"""打包：把一次脱敏的结果整理成导入包，交给 import.py 写进系统（brightrule#11）。

用法：
    python3 package.py --run 脱敏结果/<时间> [--output 导入包]                      # 默认：正文、附件都只进 Markdown
    python3 package.py --run 脱敏结果/<时间> --files attachments                     # 附件另带脱敏后的 docx
    python3 package.py --run 脱敏结果/<时间> --files redacted                        # 正文也带脱敏后的 docx
    python3 package.py --run 脱敏结果/<时间> --originals 原件目录 --files original   # 上传原件

读：
    <run>/脱敏文件/             脱敏后的正文 .md 与附件 .md
    <run>/内部留存-勿外发/文件清单.json   原件与脱敏文件的对应、复查是否通过（脱敏工具写的）
    原件目录（可选）            --files original 或 --meta original 时才读
写 <output>/<时间>/：
    批次清单.csv     每份制度一行：制度编号、名称、文号、生效日期、制度信息表的各栏……人工核对后导入以它为准
    检查报告.md      条号缺漏、重复、「之一」，附件，含图片，取不到的字段，被拒绝的文件
    <每份制度>/       manifest.json、正文.md、附件N.md（按 --files 还有 附件N.docx、正文.docx）

--files 决定哪些文件上传到系统的「原件」字段：
    none（默认）         都不传文件，正文、附件只进脱敏 Markdown；只有图片、没有文字的附件不导入（报告里列出）；
    attachments          正文不传文件；附件（附表、表单）传脱敏后的 docx，员工可下载填写；
    redacted             正文、附件都传脱敏后的 docx；
    original             都传原件：导入包含原文，和「内部留存-勿外发」一样不能外发、不能进 Git。

条号索引、字数、token 估算、内容哈希的口径与应用一致（src/data/document-text.ts、src/objects/policy.object.ts）：
- 字数 = 脱敏正文的 Unicode 码点数（含 Markdown 标记）；token = ⌈字数 ÷ 1.5⌉；
- 条号索引每条 {article, chapter, redacted: [起, 止)}，偏移按码点计，起点在 **第X条** 标记处，
  终点在下一条或下一个标题之前，不含末尾空行；没有章时 chapter 为 null；
- 内容哈希 = 上传的那个文件字节的 SHA-256（十六进制小写）；不传文件的取脱敏 Markdown（UTF-8）的 SHA-256。
- 图片、图表、SmartArt、公式、嵌入对象的内容不在 Markdown 里（只留标记），按份统计写进批次清单「问题」一栏和检查报告；
  正文、每个附件各记一个「含图片」（has_images），导入时写进系统的「含图片」字段。
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import hashlib
import json
import math
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from docx2md import (DOC_NO_RX, NON_TEXT_MARKERS, attachment_docx, document_markdown, non_text_counts,  # noqa: E402
                     split_document, _parse)

CHARS_PER_TOKEN = 1.5
ARTICLE = re.compile(r'^\*\*(第[零〇一二三四五六七八九十百千0-9]+条(?:之[一二三四五六七八九十]+)?)\*\*', re.M)
HEADING = re.compile(r'^(?:#{1,6} |附\s*[件表]\s*\d*\s*[:：])', re.M)   # 标题，或正文末尾的「附件：…」「附表：…」清单
# 写成标题样式的条（「### 第一条 目的」）：统一改成「**第一条** 目的」，和其余条文一个写法
ARTICLE_HEADING = re.compile(r'^#{3,6} +(第[零〇一二三四五六七八九十百千0-9]+条(?:之[一二三四五六七八九十]+)?)[ \t　]*', re.M)
# 附件标题前面原文自带的序号：「1.」「1、」「（一）」
TITLE_ENUM = re.compile(r'^\s*(?:[0-9０-９]+\s*[.．、]|[（(][一二三四五六七八九十0-9]+[)）])\s*')
ATT_HEAD = re.compile(r'^# (附[件表][0-9]+)(?:[:：]\s*(.*))?$')
CHAPTER = re.compile(r'^## (.+)$', re.M)
SECTION = re.compile(r'^# (.+)$', re.M)
DATE_CN = re.compile(r'((?:19|20)\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日')
EFFECTIVE = re.compile(r'自\s*((?:19|20)\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)\s*起\s*(?:施行|实行|执行|生效)')
# 制度信息表的栏目 → 元数据键。栏目名比较时去掉空白和「/」「／」「、」，「关联制度 / 文件」「关联制度/文件」都认
INFO_KEYS = {
    'title': ('制度名称', '文件名称'),
    'policy_no': ('制度编码', '制度编号', '文件编号', '制度代码'),
    'doc_no': ('文号', '发文字号', '发文文号', '制度文号'),
    'category': ('制度类别', '制度分类', '类别'),
    'policy_level': ('制度层级', '层级', '制度级别'),
    'effective_date': ('生效日期', '施行日期', '实施日期'),
    'department': ('责任部门', '归口部门', '主责部门', '归口管理部门'),
    'co_departments': ('协同部门', '配合部门'),
    'review_body': ('审议主体', '审议机构'),
    'decision_body': ('决议主体', '决策主体', '审批主体'),
    'related_documents': ('关联制度文件', '关联制度', '关联文件', '相关制度', '相关制度文件'),
}
ATTACH_LISTING = re.compile(r'\n# 附件（已拆分为单独文件）\n.*\Z', re.S)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def text_stats(text: str) -> Dict[str, object]:
    if not text or not text.strip():
        return {'has_text': False, 'text_chars': 0, 'text_tokens': 0}
    return {'has_text': True, 'text_chars': len(text), 'text_tokens': math.ceil(len(text) / CHARS_PER_TOKEN)}


def cn2int(s: str) -> Optional[int]:
    """「十四」→ 14，「一百零五」→ 105，「23」→ 23；认不出返回 None。"""
    s = s.strip()
    if s.isdigit():
        return int(s)
    digits = {c: i for i, c in enumerate('零一二三四五六七八九')}
    digits['〇'] = 0
    units = {'十': 10, '百': 100, '千': 1000}
    total, num = 0, 0
    for ch in s:
        if ch in digits:
            num = digits[ch]
        elif ch in units:
            total += (num or 1) * units[ch]
            num = 0
        else:
            return None
    return total + num


def date_iso(s: str) -> str:
    m = DATE_CN.search(s or '')
    if m:
        return f'{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
    m = re.search(r'((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})', s or '')
    return f'{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}' if m else ''


# ── 正文：条号索引、检查 ──────────────────────────────────────────────────
def normalize_articles(body: str) -> str:
    """「### 第一条 目的」→「**第一条** 目的」：条文一律以 **第X条** 开头，条号索引和 AI 都按这一种写法认。"""
    return ARTICLE_HEADING.sub(lambda m: f'**{m.group(1)}** ', body)


def attachment_title(title: str) -> str:
    """附件自己的标题，去掉原文自带的序号：「1.本集团内训师申报表」→「本集团内训师申报表」。"""
    return TITLE_ENUM.sub('', title or '').strip()


def article_index(body: str) -> List[Dict[str, object]]:
    marks = [m.start() for m in HEADING.finditer(body)]
    out = []
    arts = list(ARTICLE.finditer(body))
    for i, m in enumerate(arts):
        start = m.start()
        nxt = [x for x in marks if x > start]
        if i + 1 < len(arts):
            nxt.append(arts[i + 1].start())
        end = min(nxt) if nxt else len(body)
        while end > start and body[end - 1] in ' \t\n　':
            end -= 1
        chap = None
        for c in CHAPTER.finditer(body, 0, start):
            chap = c.group(1).strip()
        out.append({'article': m.group(1), 'chapter': chap, 'redacted': [start, end]})
    return out


def article_problems(index: List[Dict[str, object]]) -> List[str]:
    problems: List[str] = []
    seen: Dict[int, int] = {}
    nums: List[int] = []
    for e in index:
        name = str(e['article'])
        if '之' in name:
            problems.append(f'有「{name}」，请确认')
            continue
        n = cn2int(name[1:name.index('条')])
        if n is None:
            problems.append(f'认不出条号「{name}」')
            continue
        seen[n] = seen.get(n, 0) + 1
        nums.append(n)
    dups = [n for n, c in seen.items() if c > 1]
    if dups:
        problems.append('条号重复：' + '、'.join(f'第{n}条' for n in sorted(dups)) + '（可能是正文里引用了其他制度的条款，或合订了多份制度）')
    if nums:
        missing = [n for n in range(1, max(nums) + 1) if n not in seen]
        if missing:
            problems.append('缺条：' + '、'.join(f'第{n}条' for n in missing[:20]) + ('……' if len(missing) > 20 else ''))
        if nums != sorted(nums):
            problems.append('条号顺序不是递增的')
    return problems


# ── 元数据 ────────────────────────────────────────────────────────────────
def sections(md: str) -> Dict[str, str]:
    """按一级标题切开：{'发文通知': …, '制度信息': …, '正文': …, '版记': …}；正文标题另存 '正文标题'。"""
    out: Dict[str, str] = {}
    heads = list(SECTION.finditer(md))
    for i, h in enumerate(heads):
        name = h.group(1).strip()
        body = md[h.end():heads[i + 1].start() if i + 1 < len(heads) else len(md)].strip()
        if name.startswith('正文'):
            out['正文标题'] = name.split('：', 1)[1].strip() if '：' in name else ''
            name = '正文'
        out.setdefault(name, body)
    return out


def info_key(name: str) -> str:
    """制度信息表的栏目名，去掉空白、「/」「／」「、」和末尾的冒号后再比。"""
    return re.sub(r'[\s/／、]', '', name or '').rstrip(':：')


def info_table(text: str) -> Dict[str, str]:
    """Markdown 表格里「字段名 | 值」成对出现的格子。"""
    pairs: Dict[str, str] = {}
    for line in text.splitlines():
        if not line.startswith('|') or set(line) <= set('|-: '):
            continue
        cells = [c.strip().replace('<br>', ' ') for c in line.strip().strip('|').split('|')]
        for i in range(len(cells) - 1):
            key = info_key(cells[i])
            if key and cells[i + 1] and key not in pairs and len(key) <= 8:
                pairs[key] = cells[i + 1]
    return pairs


NOTICE_TITLE = re.compile(r'关于(?:印发|下发|颁布|发布|修订|修改)?\s*《(.+)》\s*的?(?:通知|决定)')
BRACKET_TITLE = re.compile(r'《([^《》]+)》')
FROM_ISSUE = re.compile(r'自\s*(?:印发|发布|下发|颁布|公布)\s*之日\s*起\s*(?:施行|实行|执行|生效)')


def title_from_text(text: str) -> str:
    """「关于印发《××》的通知」→ ××（书名号里再套书名号时取最外层）。"""
    m = NOTICE_TITLE.search(text)
    if m:
        return m.group(1).strip()
    m = BRACKET_TITLE.search(text)
    return m.group(1).strip() if m else ''


def metadata(md: str, stem: str = '') -> Tuple[Dict[str, str], List[str]]:
    """元数据。制度信息表优先；取不到时用备用来源，并把备用来源记进 meta['_from']，提醒人工核对。"""
    sec = sections(md)
    table = info_table(sec.get('制度信息', ''))
    meta: Dict[str, str] = {}
    for key, names in INFO_KEYS.items():
        for n in names:
            if table.get(info_key(n)):
                meta[key] = table[info_key(n)]
                break
    fallbacks: List[str] = []
    if not meta.get('title') and sec.get('正文标题'):
        meta['title'] = sec['正文标题']
    head = '\n'.join(md.splitlines()[:40])
    notice = sec.get('发文通知', '') or sec.get('文件开头', '') or head
    if not meta.get('title'):
        t = title_from_text(notice) or title_from_text(stem)
        if t:
            meta['title'] = t
            fallbacks.append('制度名称取自通知标题或文件名')
    # 文号：制度信息表 →「发文通知」里的文号 → 文件名
    if meta.get('doc_no'):
        meta['doc_no'] = re.sub(r'\s', '', meta['doc_no'])
    else:
        m = DOC_NO_RX.search(notice)
        meta['doc_no'] = re.sub(r'\s', '', m.group(0)) if m else ''
    if not meta['doc_no']:
        m = DOC_NO_RX.search(stem)
        if m:
            meta['doc_no'] = re.sub(r'\s', '', m.group(0))
            fallbacks.append('文号取自文件名')
    colophon = sec.get('版记', '')
    dates = DATE_CN.findall(colophon) or DATE_CN.findall(notice)
    if dates:
        y, mo, d = dates[-1]
        meta['issued_date'] = f'{int(y):04d}-{int(mo):02d}-{int(d):02d}'
    unit = DATE_CN.split(colophon.split('\n')[0])[0] if colophon else ''
    unit = re.sub(r'[\s　]+', '', unit).strip()
    if unit:
        meta['issuing_unit'] = unit
    if meta.get('effective_date'):
        meta['effective_date'] = date_iso(meta['effective_date']) or meta['effective_date']
    else:
        e = EFFECTIVE.search(sec.get('正文', md))
        if e:
            meta['effective_date'] = date_iso(e.group(1))
        elif FROM_ISSUE.search(md) and meta.get('issued_date'):
            meta['effective_date'] = meta['issued_date']
            fallbacks.append('「自印发之日起施行」，生效日期取发文日期')
    if fallbacks:
        meta['_from'] = '；'.join(fallbacks)
    missing = [label for key, label in (('policy_no', '制度编号'), ('title', '制度名称'), ('doc_no', '文号'),
                                        ('effective_date', '生效日期')) if not meta.get(key)]
    return meta, missing


# ── 附件 ──────────────────────────────────────────────────────────────────
def has_images(md: str) -> bool:
    """Markdown 里有没有图片、图表、SmartArt、公式、嵌入对象（转换时写成的「（图片）」等标记）。
    和脱敏时的「非文字内容统计」同一个口径（docx2md.non_text_counts）：统计里有这个文件（正文或附件），这里就是含图片。"""
    return bool(non_text_counts(md))


def has_words(md: str) -> bool:
    """标题行之外有没有文字：只有图片等标记的附件没有。系统里不再分「规范性 / 表单 / 仅原件」（brightrule#45）。"""
    body = '\n'.join(l for l in md.splitlines() if not l.startswith('# '))
    for mark in NON_TEXT_MARKERS:
        body = body.replace(mark, '')
    return bool(re.search(r'[\w一-鿿]', body))


ATT_FILE = re.compile(r'^附件(\d+)')


# ── 打包一份 ──────────────────────────────────────────────────────────────
@dataclass
class Packed:
    folder: str
    source: str
    meta: Dict[str, str] = field(default_factory=dict)
    missing: List[str] = field(default_factory=list)
    problems: List[str] = field(default_factory=list)
    body_tokens: int = 0
    attachments: List[Dict[str, object]] = field(default_factory=list)
    images: Dict[str, int] = field(default_factory=dict)   # 图片、图表……各几处（内容不在 Markdown 里）
    rejected: Optional[str] = None


def pack_one(entry: Dict[str, object], docs: Path, originals: Optional[Path], out_root: Path,
             meta_from: str, files: str) -> Packed:
    """files = 'none'：都不传文件；'attachments'：正文不传文件，附件传脱敏后的 docx；
    'redacted'：正文、附件都传脱敏后的 docx；'original'：都传原件。"""
    source = str(entry['source'])
    output = str(entry.get('output') or '')
    packed = Packed(folder=str(Path(output).with_suffix('')) if output else '', source=source)
    if not entry.get('passed'):
        packed.rejected = '脱敏复查未通过：' + (str(entry.get('error')) if entry.get('error') else f"{entry.get('leaks')} 处残留")
        return packed
    red_docx = docs / output
    red_md = red_docx.with_suffix('.md')
    if not red_md.exists():
        packed.rejected = '没有脱敏后的 .md（脱敏时用了 --no-md？）'
        return packed
    parts = None
    ocr = bool(entry.get('ocr'))   # 扫描版 PDF：只有脱敏后的 .md，没有 docx
    if originals is not None and not ocr:
        src = originals / source
        if not src.exists():
            packed.rejected = f'原件目录里找不到 {source}'
            return packed
        with zipfile.ZipFile(src) as z:
            parts = {n: z.read(n) for n in z.namelist()}
    red_main = red_md.read_text(encoding='utf-8')
    body = normalize_articles(ATTACH_LISTING.sub('\n', red_main).rstrip('\n') + '\n')

    meta, missing = metadata(document_markdown(parts)[0] if meta_from == 'original' and parts else red_main, red_docx.stem)
    packed.meta, packed.missing = meta, missing
    if meta.get('_from'):
        packed.problems.append('请核对：' + meta.pop('_from'))
    index = article_index(body)
    packed.problems += article_problems(index)
    if ocr:
        packed.problems.insert(0, '扫描件 OCR 识别：可能有错字、漏脱敏，导入前请人工核对正文')
    if not index:
        packed.problems.append('没有识别到「第X条」：作答时只能整份或按段落检索，答复无法引用到条')

    folder = out_root / packed.folder
    folder.mkdir(parents=True, exist_ok=True)
    (folder / '正文.md').write_text(body, encoding='utf-8')
    if files in ('none', 'attachments') or ocr:
        body_file, body_hash = None, sha256(body.encode('utf-8'))
    else:
        body_bytes = (originals / source).read_bytes() if files == 'original' else red_docx.read_bytes()
        (folder / '正文.docx').write_bytes(body_bytes)
        body_file, body_hash = '正文.docx', sha256(body_bytes)
    stats = text_stats(body)
    packed.body_tokens = int(stats['text_tokens'])
    documents = [{'doc_kind': 'body', 'sort_no': 0, 'title': meta.get('title') or red_docx.stem,
                  'md': '正文.md', 'file': body_file, 'article_index': index,
                  'content_hash': body_hash, 'has_images': has_images(body), **stats}]

    # 附件：脱敏件按「附件N-标题.md / .docx」配对；用原件时从原件里按同一规则拆出对应的附件
    att_dir = red_docx.parent / f'{red_docx.stem}-附件'
    red_md_by_no: Dict[int, Path] = {}
    red_docx_by_no: Dict[int, Path] = {}
    if att_dir.is_dir():
        for f in sorted(att_dir.iterdir()):
            m = ATT_FILE.match(f.name)
            if m and f.suffix == '.md':
                red_md_by_no[int(m.group(1))] = f
            elif m and f.suffix == '.docx':
                red_docx_by_no[int(m.group(1))] = f
    orig_by_no = {a.number: a for a in split_document(_parse(parts['word/document.xml']))[1]} if parts else {}
    if red_md_by_no:
        gaps = [n for n in range(1, max(red_md_by_no) + 1) if n not in red_md_by_no]
        if gaps:
            packed.problems.append('附件编号不连续，缺 ' + '、'.join(f'附件{n}' for n in gaps) +
                                   '：可能写法不同没拆出来（留在了正文里），请对照原件')
    if parts and set(red_md_by_no) != set(orig_by_no):
        packed.problems.append(f'附件对不上：脱敏件 {sorted(red_md_by_no)}，原件 {sorted(orig_by_no)}')
    images = non_text_counts(body)
    for no in sorted(red_md_by_no):
        md = red_md_by_no[no].read_text(encoding='utf-8')
        for k, v in non_text_counts(md).items():
            images[k] = images.get(k, 0) + v
        words = has_words(md)
        if files == 'none':
            if not words:
                packed.problems.append(f'附件{no} 只有图片等、没有文字：不导入，需要时请把内容写成文字')
                continue
            data = None
        elif files == 'original':
            if no not in orig_by_no:
                continue
            data = attachment_docx(parts, orig_by_no[no])
        else:
            if no not in red_docx_by_no:
                packed.problems.append(f'附件{no} 没有脱敏后的 .docx')
                continue
            data = red_docx_by_no[no].read_bytes()
        (folder / f'附件{no}.md').write_text(md, encoding='utf-8')
        if data is not None:
            (folder / f'附件{no}.docx').write_bytes(data)
        head = ATT_HEAD.match(md.splitlines()[0] if md else '')
        label = head.group(1) if head else f'附件{no}'
        if meta_from == 'original' and no in orig_by_no:
            a_title = attachment_title(orig_by_no[no].title)
            label = orig_by_no[no].label
        else:
            a_title = attachment_title(head.group(2) or '') if head else ''
        # 标题只写附件自己的名称（原文怎么叫就怎么叫），不再拼制度全名：所属制度由主从关系带出，
        # 拼上制度名会让按制度名查找时命中附件
        att = {'doc_kind': 'attachment', 'sort_no': no, 'label': label,
               'title': a_title or label,
               'md': f'附件{no}.md' if words else None,
               'file': f'附件{no}.docx' if data is not None else None,
               'article_index': None, 'content_hash': sha256(data if data is not None else md.encode('utf-8')),
               # 只有标题、没有文字的附件，内容只能是图片等（转换时标记可能落在正文里），也算含图片
               'has_images': has_images(md) or not words, **(text_stats(md) if words else text_stats(''))}
        documents.append(att)
        packed.attachments.append({'no': no, 'label': label, 'title': a_title, 'has_text': words,
                                   'has_images': att['has_images'], 'tokens': att['text_tokens']})
    if images:
        packed.problems.append('含' + '、'.join(f'{k} {v} 处' for k, v in images.items()) +
                               '：这些内容不在 Markdown 里，问询时模型看不到；重要的请对照原件写成文字')
    packed.images = images
    manifest = {'source': source if files == 'original' else None, 'redacted': output, 'files': files,
                'meta_from': meta_from, 'meta': meta, 'documents': documents,
                'packaged_at': _dt.datetime.now().isoformat(timespec='seconds')}
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    return packed


FILES_LABEL = {'none': '不传文件，正文、附件只进脱敏 Markdown',
               'attachments': '正文不传文件（只进脱敏 Markdown），附件传脱敏后的 docx',
               'redacted': '正文、附件都传脱敏后的 docx（不含原文）', 'original': '原件'}
# 「协同部门」「审议主体」「决议主体」「关联制度/文件」照录制度信息表；导入时写进制度，「关联制度/文件」里与库内制度同名的再自动关联
SHEET_COLUMNS = ['导入', '包内目录', '制度编号', '制度名称', '文号', '生效日期', '发文日期', '制度类别', '制度层级',
                 '发文单位', '归口部门', '协同部门', '审议主体', '决议主体', '关联制度/文件', '正文token', '附件', '问题']


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='把一次脱敏的结果整理成导入包')
    ap.add_argument('--run', required=True, type=Path, help='一次脱敏的结果目录：脱敏结果/<时间>')
    ap.add_argument('--originals', type=Path,
                    help='原件目录（脱敏时的 --input）。只在 --files original 或 --meta original 时需要')
    ap.add_argument('--files', choices=('none', 'attachments', 'redacted', 'original'), default='none',
                    help='上传到系统的文件：none（默认）都不传，只进 Markdown；attachments 附件传脱敏后的 docx；'
                         'redacted 正文、附件都传脱敏后的 docx；original 都传原件')
    ap.add_argument('--output', type=Path, default=Path('导入包'), help='导入包根目录，默认 ./导入包')
    ap.add_argument('--meta', choices=('original', 'redacted'),
                    help='制度名称、文号等元数据取原文还是脱敏后的写法；默认：给了 --originals 取原文，否则取脱敏后的')
    args = ap.parse_args(argv)
    if args.run.name in ('脱敏文件', '内部留存-勿外发'):   # 填到了结果目录里面一层：退回结果目录
        args.run = args.run.parent
    docs = args.run / '脱敏文件'
    listing = args.run / '内部留存-勿外发' / '文件清单.json'
    if not docs.is_dir():
        raise SystemExit(f'不是一次脱敏的结果目录（没有「脱敏文件」）：{args.run}')
    if not listing.exists():
        raise SystemExit(f'没有 {listing}：请用最新版的脱敏工具重新运行一次脱敏，再打包。')
    args.meta = args.meta or ('original' if args.originals else 'redacted')
    if (args.files == 'original' or args.meta == 'original') and not args.originals:
        raise SystemExit('用原件（--files original）或原文元数据（--meta original）时，要给 --originals 原件目录。')
    if args.originals and not args.originals.is_dir():
        raise SystemExit(f'原件目录不存在：{args.originals}')
    entries = json.loads(listing.read_text(encoding='utf-8'))['files']
    out_root, n = args.output / args.run.name, 2
    while out_root.exists():
        out_root, n = args.output / f'{args.run.name}-{n}', n + 1
    out_root.mkdir(parents=True)

    packed = [pack_one(e, docs, args.originals, out_root, args.meta, args.files) for e in entries]
    ok = [p for p in packed if not p.rejected]
    with (out_root / '批次清单.csv').open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(SHEET_COLUMNS)
        for p in ok:
            m = p.meta
            issues = ([f'缺{x}' for x in p.missing] + p.problems)
            wr.writerow(['是', p.folder, m.get('policy_no', ''), m.get('title', ''), m.get('doc_no', ''),
                         m.get('effective_date', ''), m.get('issued_date', ''), m.get('category', ''),
                         m.get('policy_level', ''), m.get('issuing_unit', ''), m.get('department', ''),
                         m.get('co_departments', ''), m.get('review_body', ''), m.get('decision_body', ''),
                         m.get('related_documents', ''), p.body_tokens, len(p.attachments), '；'.join(issues)])
    write_report(out_root / '检查报告.md', packed, args)
    print(f'打包 {len(ok)} 份制度，拒绝 {len(packed) - len(ok)} 份；附件 {sum(len(p.attachments) for p in ok)} 个。')
    with_images = [p for p in ok if p.images]
    if with_images:
        total = {}
        for p in with_images:
            for k, v in p.images.items():
                total[k] = total.get(k, 0) + v
        print(f'{len(with_images)} 份含图片等非文字内容（' + '、'.join(f'{k} {v} 处' for k, v in total.items()) +
              '）：这些内容不进系统，见检查报告「含图片等非文字内容」。')
    need = [p for p in ok if p.missing or p.problems]
    if need:
        print(f'{len(need)} 份需要人工确认（缺字段、缺条、条号重复等），见检查报告。')
    for p in packed:
        if p.rejected:
            print(f'  拒绝  {p.folder or p.source}  ← {p.rejected}')
    print(f'批次清单：{out_root / "批次清单.csv"}  ← 核对、补齐后再导入')
    print(f'检查报告：{out_root / "检查报告.md"}')
    print('导入包含原件，不要外发、不要放进 Git。' if args.files == 'original' or args.meta == 'original'
          else '导入包只含脱敏后的文件和元数据，不含原件。')
    return 0


def write_report(path: Path, packed: List[Packed], args) -> None:
    ok = [p for p in packed if not p.rejected]
    lines = ['# 打包检查报告（内部留存，勿外发）', '',
             f'- 时间：{_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
             f'- 脱敏结果：{args.run}', f'- 原件目录：{args.originals or "（未使用）"}',
             f'- 上传的文件：{FILES_LABEL[args.files]}',
             f'- 元数据取自：{"原文" if args.meta == "original" else "脱敏后的文字"}',
             f'- 打包 {len(ok)} 份，拒绝 {len(packed) - len(ok)} 份', '',
             '批次清单里「问题」一栏不为空的，请对照原件确认；制度名称必须有才能导入；制度编号、文号、生效日期原文没有的可以留空。', '']
    rej = [p for p in packed if p.rejected]
    if rej:
        lines += ['## 拒绝打包', ''] + [f'- {p.folder or p.source}：{p.rejected}' for p in rej] + ['']
    imgs = sorted((p for p in ok if p.images), key=lambda p: -sum(p.images.values()))
    if imgs:
        lines += ['## 含图片等非文字内容', '',
                  '下面这些制度里有图片、图表、SmartArt、公式或嵌入对象。它们的内容不在 Markdown 里（原位置只留「（图片）」等标记），'
                  '问询时模型看不到。流程图、扫描的表格、带数字的图表等重要内容，请对照原件写成文字。', '',
                  '| 制度 | 非文字内容 |', '|---|---|']
        lines += [f'| {p.folder} | ' + '、'.join(f'{k} {v} 处' for k, v in p.images.items()) + ' |' for p in imgs] + ['']
    for p in ok:
        flag = '⚠ 需确认' if (p.missing or p.problems) else '✓'
        lines += [f'## {p.folder} — {flag}', '',
                  f'- 制度名称：{p.meta.get("title", "（未取到）")}；编号：{p.meta.get("policy_no", "（未取到）")}；'
                  f'文号：{p.meta.get("doc_no") or "（未取到）"}；生效日期：{p.meta.get("effective_date", "（未取到）")}',
                  f'- 正文约 {p.body_tokens:,} token' + ('（超过 1.2 万，问这份制度时会改为段落检索）' if p.body_tokens > 12000 else '')]
        if p.missing:
            lines.append('- 缺字段：' + '、'.join(p.missing))
        for pr in p.problems:
            lines.append(f'- {pr}')
        for a in p.attachments:
            lines.append(f"- {a.get('label') or '附件' + str(a['no'])}：{a['title'] or '（无标题）'}，"
                         + (f"约 {a['tokens']:,} token" if a['has_text'] else '没有文字（只传文件）')
                         + ('，含图片' if a['has_images'] else ''))
        lines.append('')
    path.write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
