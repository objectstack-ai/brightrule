#!/usr/bin/env python3
"""制度文档脱敏工具 — 直接修改 Word（.docx），输出新的 .docx，源文件只读。

用法：
    python3 redact.py --input 原件目录 --dict 词典.csv [--patterns patterns.csv] [--output 脱敏结果] [--no-md]

每次运行写入 <output>/<年月日-小时>/：
    脱敏文件/            脱敏后的 .docx 与同名 .md，目录结构与输入一致 —— 只有这一目录可以外发
                         有附件的文件另有「<文件名>-附件/」，每个附件一个 .docx 和 .md
    内部留存-勿外发/      原件md/（原件的 .md）、对照表.csv、替换汇总.csv、报告.md —— 含原文，必须留在内部

词典与规则的写法见 DICTIONARY.md。兼容 macOS 自带的 Python 3.9+，只依赖 lxml。
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import hashlib
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import zipfile
from collections import Counter, OrderedDict
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from lxml import etree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from docx2md import attachment_docx, document_markdown, split_document  # noqa: E402

# ── Word XML 命名空间 ──────────────────────────────────────────────────────
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
V = 'urn:schemas-microsoft-com:vml'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
CP = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
DC = 'http://purl.org/dc/elements/1.1/'
EP = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'


def w(tag: str) -> str:
    return f'{{{W}}}{tag}'


# 正文类部件：逐段替换文字
TEXT_PARTS = re.compile(r'^word/(document|header\d*|footer\d*|footnotes|endnotes|glossary/document)\.xml$')
# 图表、SmartArt、自定义 XML 数据：逐个文字节点替换
DATA_PARTS = re.compile(r'^(word/(charts|diagrams)/[^/]+\.xml|customXml/item\d+\.xml)$')
# 带文字的属性：图片说明、艺术字、VML 形状说明、简单域代码
TEXT_ATTRS = ((f'{{{WP}}}docPr', ('descr', 'title', 'name')),
              (f'{{{V}}}textpath', ('string',)),
              (f'{{{V}}}shape', ('alt', 'title')),
              (f'{{{W}}}fldSimple', (f'{{{W}}}instr',)))
# 批注部件：整体删除
COMMENT_PARTS = re.compile(r'^word/comments(Extended|Ids|Extensible)?\.xml$')
# 修订：删除的内容整体移除；插入的内容保留（去掉外壳）；格式修订记录移除
REVISION_DROP = ('del', 'moveFrom')
REVISION_UNWRAP = ('ins', 'moveTo')
REVISION_MARKERS = (
    'rPrChange', 'pPrChange', 'sectPrChange', 'tblPrChange', 'trPrChange', 'tcPrChange',
    'tblGridChange', 'tblPrExChange', 'numberingChange', 'moveFromRangeStart', 'moveFromRangeEnd',
    'moveToRangeStart', 'moveToRangeEnd', 'customXmlInsRangeStart', 'customXmlInsRangeEnd',
    'customXmlDelRangeStart', 'customXmlDelRangeEnd',
)
# 可能残留机构名的写法，用于“疑似遗漏”提示（只提示，不替换）
SUSPECT_ORG = re.compile(
    r'[一-龥A-Za-z0-9（）()]{1,20}?'
    r'(?:集团(?:股份有限公司|有限责任公司|有限公司)?|股份有限公司|有限责任公司|有限公司|分公司|子公司|银行|研究院|事务所|律师所)'
)
# 机构名前面常连着的普通词：从最后一个这样的词之后才算名称。
# 「员工外出参加非集团」→「集团」、「根据各子公司」→「子公司」，剩下的只是通用称呼，不提示；
# 「已经C集团」→「C集团」、「B市C集团」保持不变，照常提示。
SUSPECT_LEAD = re.compile(
    r'.*(?:按照|根据|依据|参照|参加|参与|经过|通过|对于|关于|以及|已经|严格|所属|下属|直属|办法|规定|制度|'
    r'申请单|部门|员工|人员|单位|全体|报送|上报|报|按|经|由|向|对|在|从|与|和|及|或|的|为|是|给|至|各|本|该|此|其|非|全|总|我|贵)'
)
# 机构名前面常连着的动词、副词等（「切实加强集团」「进一步规范集团」）
EXTRA_LEAD = re.compile(
    r'.*(?:适用于|用于|位于|基于|鉴于|由于|属于|对于|关于|如|若|即|系|属|指|含|包括|例如|比如|其中|以及|同时|分别|不得|应当|应|须|可|并|且|向|及|'
    r'加强|履行|形成|结合|规范|使用|落实|执行|遵守|维护|代表|损害|制定|实际|管理|服务|支持|建立|完善|推进|提升|保障|实现|'
    r'开展|组织|参照|适用|涉及|视为|作为|成为|属于|设立|成立|委托|授权|聘请|选择|具有|采购|提供|产生|发生|承担|实施|促进|推动|'
    r'进一步|切实|严格|认真|贯彻|坚持|加快|深化|强化|优化|统筹|协调|配合|联合|下发|印发|转发|发布|颁布|出台|修订|废止|'
    r'原则|统一|共同|全面|有效|合理|必须|需要|能够|以上|以下|之间|之内|期间|委|党)')
GENERIC_ORG = re.compile(r'^(股份有限公司|有限责任公司|有限公司|分公司|子公司|集团|银行|研究院|事务所|律师所)$')
TIANGAN = '甲乙丙丁戊己庚辛壬癸'


# ── 词典与规则 ────────────────────────────────────────────────────────────
@dataclass
class Term:
    category: str
    original: str
    replacement: str


@dataclass
class Pattern:
    name: str
    regex: 're.Pattern[str]'
    replacement: str


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    """读取 UTF-8（含 Excel 的 BOM）或 GBK 编码的 CSV。"""
    raw = path.read_bytes()
    for enc in ('utf-8-sig', 'gbk'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise SystemExit(f'无法识别 {path} 的编码，请另存为 UTF-8 编码的 CSV。')
    return [{(k or '').strip(): (v or '').strip() for k, v in row.items()}
            for row in csv.DictReader(io.StringIO(text))]


def auto_code(category: str, index: int) -> str:
    """替换为留空时的自动代号：同一类别按词典中的出现顺序编号，稳定可复现。"""
    if category in ('公司', '单位', '机构'):
        return (TIANGAN[index] + '公司') if index < len(TIANGAN) else f'公司{index + 1}'
    if category == '集团':
        return (TIANGAN[index] + '集团') if index < len(TIANGAN) else f'集团{index + 1}'
    if category in ('人名', '人员'):
        return f'人员{_letters(index)}'
    return f'{category or "信息"}{_letters(index)}'


def _letters(index: int) -> str:
    s, n = '', index
    while True:
        s = chr(ord('A') + n % 26) + s
        n = n // 26 - 1
        if n < 0:
            return s


def load_dictionary(path: Path) -> List[Term]:
    rows = read_csv_rows(path)
    if rows and '原文' not in rows[0]:
        raise SystemExit(f'{path} 缺少表头「原文」。表头应为：类别,原文,替换为,备注（见 DICTIONARY.md）。')
    terms: 'OrderedDict[str, Term]' = OrderedDict()
    seen_per_category: Counter = Counter()
    auto_by_key: Dict[Tuple[str, str], str] = {}
    for n, row in enumerate(rows, start=2):
        category = row.get('类别', '')
        original = row.get('原文', '')
        if category.startswith('#') or not original:
            continue  # 注释行、空行
        replacement = row.get('替换为', '')
        if not replacement:
            # 同类别下「原文」相同的行共用一个自动代号
            key = (category, original)
            if key not in auto_by_key:
                auto_by_key[key] = auto_code(category, seen_per_category[category])
                seen_per_category[category] += 1
            replacement = auto_by_key[key]
        if original in terms and terms[original].replacement != replacement:
            raise SystemExit(f'{path} 第 {n} 行：「{original}」已出现过，且替换值不同。同一原文只能对应一个替换值。')
        terms[original] = Term(category or '其他', original, replacement)
    return list(terms.values())


def load_patterns(path: Optional[Path]) -> List[Pattern]:
    if path is None or not path.exists():
        return []
    out: List[Pattern] = []
    for n, row in enumerate(read_csv_rows(path), start=2):
        if row.get('名称', '').startswith('#') or row.get('启用', '是') in ('否', 'no', 'false', '0'):
            continue
        try:
            rx = re.compile(row['正则'])
        except (KeyError, re.error) as e:
            raise SystemExit(f'{path} 第 {n} 行的正则无效：{e}')
        out.append(Pattern(row.get('名称', f'规则{n}'), rx, row.get('替换为', '【已脱敏】')))
    return out


# ── 替换引擎 ──────────────────────────────────────────────────────────────
@dataclass
class Hit:
    category: str
    original: str      # 文件里的实际写法（可能带空格，如「张 三 丰」）
    replacement: str
    term: str = ''     # 对应的词典原文；格式规则的命中为空


# 排版时常在中文字之间加空格对齐（「签发人：张 三 丰」），词典原文按不带空格写，匹配时忽略这些空格
SPACING = '[ \t\u3000\u00a0]'
CJK = '[\u3400-\u9fff\uf900-\ufaff]'
_SPACING_RX = re.compile(f'(?<={CJK}){SPACING}+|{SPACING}+(?={CJK})')


def squash(text: str) -> str:
    """去掉中文字前后的排版空格并转小写，作为词典查找的键。"""
    return _SPACING_RX.sub('', text).lower()


def term_regex(original: str) -> str:
    """原文的正则：相邻两个字只要有一个是中文，中间允许出现排版空格。"""
    core = _SPACING_RX.sub('', original)
    out = []
    for i, ch in enumerate(core):
        if i and (re.match(CJK, ch) or re.match(CJK, core[i - 1])):
            out.append(SPACING + '*')
        out.append(re.escape(ch))
    return ''.join(out)


class Redactor:
    def __init__(self, terms: Sequence[Term], patterns: Sequence[Pattern]):
        self.terms = list(terms)
        self.patterns = list(patterns)
        # 长的原文优先，避免「华东某某」先于「华东某某有限公司」命中
        ordered = sorted(self.terms, key=lambda t: len(t.original), reverse=True)
        self.by_original = {squash(t.original): t for t in ordered}
        self.term_rx = (
            re.compile('|'.join(term_regex(t.original) for t in ordered), re.IGNORECASE)
            if ordered else None
        )

    def leaked_terms(self, text: str) -> List[Term]:
        """文字里仍出现的词典原文（含带排版空格的写法）。"""
        if self.term_rx is None:
            return []
        found: 'OrderedDict[str, Term]' = OrderedDict()
        for m in self.term_rx.finditer(text):
            t = self.by_original.get(squash(m.group(0)))
            if t is not None:
                found.setdefault(t.original, t)
        return list(found.values())

    def find(self, text: str) -> List[Tuple[int, int, Hit]]:
        """返回不重叠的命中区间：词典优先于规则，靠前、较长者优先。"""
        spans: List[Tuple[int, int, int, Hit]] = []  # (start, end, priority, hit)
        if self.term_rx is not None:
            for m in self.term_rx.finditer(text):
                t = self.by_original[squash(m.group(0))]
                spans.append((m.start(), m.end(), 0, Hit(t.category, m.group(0), t.replacement, t.original)))
        for p in self.patterns:
            for m in p.regex.finditer(text):
                if m.end() > m.start():
                    spans.append((m.start(), m.end(), 1, Hit(p.name, m.group(0), p.replacement)))
        spans.sort(key=lambda s: (s[0], s[2], -(s[1] - s[0])))
        chosen: List[Tuple[int, int, Hit]] = []
        cursor = -1
        for start, end, _prio, hit in spans:
            if start >= cursor:
                chosen.append((start, end, hit))
                cursor = end
        return chosen

    def redact_string(self, text: str) -> Tuple[str, List[Hit]]:
        hits = self.find(text)
        if not hits:
            return text, []
        out, last = [], 0
        for start, end, hit in hits:
            out.append(text[last:start])
            out.append(hit.replacement)
            last = end
        out.append(text[last:])
        return ''.join(out), [h for _s, _e, h in hits]


# ── DOCX 处理 ─────────────────────────────────────────────────────────────
@dataclass
class FileResult:
    source: Path
    output: Optional[Path] = None
    hits: List[Tuple[str, Hit]] = field(default_factory=list)  # (部件, 命中)
    revisions_accepted: int = 0
    comments_removed: int = 0
    properties_cleared: List[str] = field(default_factory=list)
    media: List[str] = field(default_factory=list)
    embeddings: List[str] = field(default_factory=list)
    suspects: List[str] = field(default_factory=list)
    attachments: List[str] = field(default_factory=list)  # 拆出的附件：「附件1-标题（表格 1 个）」
    leaks: List[str] = field(default_factory=list)
    error: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


def _parse(data: bytes) -> etree._Element:
    return etree.fromstring(data, etree.XMLParser(remove_blank_text=False, resolve_entities=False, huge_tree=True))


def _serialize(root: etree._Element) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)


def accept_revisions(root: etree._Element) -> int:
    count = 0
    for tag in REVISION_DROP:
        for el in list(root.iter(w(tag))):
            parent = el.getparent()
            if parent is None:
                continue
            # 段落标记上的 <w:del/>（在 rPr 里）只是标记，移除标记即可
            parent.remove(el)
            count += 1
    for tag in REVISION_UNWRAP:
        for el in list(root.iter(w(tag))):
            parent = el.getparent()
            if parent is None:
                continue
            if len(el) == 0:  # rPr 里的插入标记
                parent.remove(el)
                count += 1
                continue
            idx = parent.index(el)
            for child in list(el):
                parent.insert(idx, child)
                idx += 1
            parent.remove(el)
            count += 1
    for tag in REVISION_MARKERS:
        for el in list(root.iter(w(tag))):
            el.getparent().remove(el)
            count += 1
    return count


def strip_comment_anchors(root: etree._Element) -> int:
    count = 0
    for tag in ('commentRangeStart', 'commentRangeEnd'):
        for el in list(root.iter(w(tag))):
            el.getparent().remove(el)
    for ref in list(root.iter(w('commentReference'))):
        run = ref.getparent()
        holder = run.getparent() if run is not None else None
        if run is not None and run.tag == w('r') and holder is not None:
            holder.remove(run)
        elif run is not None:
            run.remove(ref)
        count += 1
    return count


def _nearest(el: etree._Element, tag: str) -> Optional[etree._Element]:
    for anc in el.iterancestors(tag):
        return anc
    return None


def redact_paragraphs(root: etree._Element, red: Redactor, part: str, result: FileResult) -> None:
    """跨格式片段替换：一个段落里的文字可能被拆成多个 <w:t>，先拼起来匹配，再写回。"""
    for p in root.iter(w('p')):
        nodes = [t for t in p.iter(w('t')) if _nearest(t, w('p')) is p]
        if not nodes:
            continue
        texts = [t.text or '' for t in nodes]
        joined = ''.join(texts)
        hits = red.find(joined)
        if not hits:
            continue
        # 兼容旧版 Word 的副本（mc:Fallback）同样替换，但不重复计数
        counted = _nearest(p, f'{{{MC}}}Fallback') is None
        # 每个节点在拼接文本中的起点
        starts, pos = [], 0
        for s in texts:
            starts.append(pos)
            pos += len(s)
        new_texts = list(texts)
        for start, end, hit in reversed(hits):  # 从后往前改，前面的位置不受影响
            first = max(i for i, s in enumerate(starts) if s <= start) if start < pos else len(texts) - 1
            last = max(i for i, s in enumerate(starts) if s < end)
            for i in range(first, last + 1):
                seg_start = starts[i]
                lo = max(start - seg_start, 0)
                hi = min(end - seg_start, len(texts[i]))
                cur = new_texts[i]
                # 位置基于原始文本；同一节点内从后往前替换，前段偏移不变
                if i == first:
                    new_texts[i] = cur[:lo] + hit.replacement + cur[hi:] if i == last else cur[:lo] + hit.replacement
                elif i == last:
                    new_texts[i] = cur[hi:]
                else:
                    new_texts[i] = ''
            if counted:
                result.hits.append((part, hit))
        for t, old, new in zip(nodes, texts, new_texts):
            if new != old:
                t.text = new
                t.set(XML_SPACE, 'preserve')


def redact_isolated_text(root: etree._Element, red: Redactor, part: str, result: FileResult) -> None:
    """域代码（如 HYPERLINK "mailto:…"）和图片说明文字单独处理。"""
    for el in root.iter(w('instrText')):
        if el.text:
            el.text, hits = red.redact_string(el.text)
            result.hits.extend((part, h) for h in hits)
    for tag, attrs in TEXT_ATTRS:
        for el in root.iter(tag):
            counted = _nearest(el, f'{{{MC}}}Fallback') is None
            for attr in attrs:
                if el.get(attr):
                    new, hits = red.redact_string(el.get(attr))
                    el.set(attr, new)
                    if counted:
                        result.hits.extend((part, h) for h in hits)


def redact_data_part(root: etree._Element, red: Redactor, part: str, result: FileResult) -> None:
    """图表标签、SmartArt 文字、自定义 XML：每个文字节点单独替换。"""
    for el in root.iter():
        if isinstance(el.tag, str) and el.text and el.text.strip():
            el.text, hits = red.redact_string(el.text)
            result.hits.extend((part, h) for h in hits)


def redact_core_props(root: etree._Element, red: Redactor, result: FileResult) -> None:
    clear = [(DC, 'creator'), (CP, 'lastModifiedBy'), (CP, 'keywords'), (DC, 'description'),
             (DC, 'subject'), (CP, 'category'), (CP, 'contentStatus')]
    for ns, tag in clear:
        for el in root.iter(f'{{{ns}}}{tag}'):
            if el.text:
                el.text = ''
                result.properties_cleared.append(tag)
    for el in root.iter(f'{{{DC}}}title'):
        if el.text:
            el.text, hits = red.redact_string(el.text)
            result.hits.extend(('docProps/core.xml', h) for h in hits)


def redact_app_props(root: etree._Element, result: FileResult) -> None:
    for tag in ('Company', 'Manager', 'Template', 'HyperlinkBase'):
        for el in root.iter(f'{{{EP}}}{tag}'):
            if el.text:
                el.text = ''
                result.properties_cleared.append(tag)


def redact_rels(root: etree._Element, red: Redactor, part: str, result: FileResult, drop_types: Iterable[str]) -> None:
    drop = tuple(drop_types)
    for rel in list(root.iter(f'{{{REL}}}Relationship')):
        if rel.get('Type', '').endswith(drop) and drop:
            root.remove(rel)
            continue
        if rel.get('TargetMode') == 'External' and rel.get('Target'):
            new, hits = red.redact_string(rel.get('Target'))
            rel.set('Target', new)
            result.hits.extend((part, h) for h in hits)


def all_text(data: Dict[str, bytes]) -> Dict[str, str]:
    """输出文件里所有能读到的内容（用于泄漏复查）：各部件的文字、外部链接地址、图片说明。

    不含 XML 命名空间和关系类型这类 Word 自身的结构标识，否则网址规则会误报。
    """
    out = {}
    for name, blob in data.items():
        if not name.endswith(('.xml', '.rels')):
            continue
        try:
            root = _parse(blob)
        except etree.XMLSyntaxError:
            continue
        texts = [t for t in root.itertext()]
        attrs = [rel.get('Target', '') for rel in root.iter(f'{{{REL}}}Relationship')
                 if rel.get('TargetMode') == 'External']
        attrs += [el.get(a, '') for tag, names in TEXT_ATTRS for el in root.iter(tag) for a in names]
        if TEXT_PARTS.match(name):
            # 正文按段落拼接，才能查出跨格式片段残留的原文
            paras = [''.join(t.text or '' for t in p.iter(w('t')) if _nearest(t, w('p')) is p) for p in root.iter(w('p'))]
            texts.extend(paras)
        out[name] = '\n'.join(texts + attrs)
    return out


def suspects_in(text: str, replacements: Iterable[str]) -> List[str]:
    """形如「××有限公司」「××集团」、但不在词典里的写法。"""
    out: List[str] = []
    for m in SUSPECT_ORG.finditer(text):
        s = m.group(0)
        for rx in (SUSPECT_LEAD, EXTRA_LEAD):
            lead = rx.match(s[:-1])  # 至少留下后缀的第一个字之前的部分来判断
            if lead:
                s = s[lead.end():]
        if not s or GENERIC_ORG.match(s) or any(r and r in s for r in replacements):
            continue
        if s not in out:
            out.append(s)
    return out


def attachment_dir(path: Path) -> Path:
    return path.parent / f'{path.stem}-附件'


def process_docx(src: Path, dst: Path, red: Redactor, orig_md: Optional[Path] = None,
                 split: bool = True) -> FileResult:
    result = FileResult(source=src)
    with zipfile.ZipFile(src) as zin:
        infos = zin.infolist()
        parts = {i.filename: zin.read(i.filename) for i in infos}

    removed = {n for n in parts if COMMENT_PARTS.match(n) or n == 'docProps/custom.xml'}
    comment_rel_types = ('/comments', '/commentsExtended', '/commentsIds', '/commentsExtensible', '/custom-properties')
    out: Dict[str, bytes] = {}
    for name, blob in parts.items():
        if name in removed:
            if COMMENT_PARTS.match(name) and name == 'word/comments.xml':
                result.comments_removed += len(_parse(blob).findall(w('comment')))
            continue
        if name.startswith('word/media/'):
            result.media.append(name)
        if name.startswith('word/embeddings/'):
            result.embeddings.append(name)
        if TEXT_PARTS.match(name):
            root = _parse(blob)
            result.revisions_accepted += accept_revisions(root)
            strip_comment_anchors(root)
            redact_paragraphs(root, red, name, result)
            redact_isolated_text(root, red, name, result)
            blob = _serialize(root)
        elif DATA_PARTS.match(name):
            root = _parse(blob)
            redact_data_part(root, red, name, result)
            blob = _serialize(root)
        elif name == 'word/settings.xml':
            root = _parse(blob)
            for el in list(root.iter(w('trackRevisions'))):  # 不再记录修订
                el.getparent().remove(el)
            blob = _serialize(root)
        elif name == 'docProps/core.xml':
            root = _parse(blob)
            redact_core_props(root, red, result)
            blob = _serialize(root)
        elif name == 'docProps/app.xml':
            root = _parse(blob)
            redact_app_props(root, result)
            blob = _serialize(root)
        elif name.endswith('.rels'):
            root = _parse(blob)
            redact_rels(root, red, name, result, comment_rel_types)
            blob = _serialize(root)
        elif name == '[Content_Types].xml':
            root = _parse(blob)
            for ov in list(root.iter(f'{{{CT}}}Override')):
                if ov.get('PartName', '').lstrip('/') in removed:
                    root.remove(ov)
            blob = _serialize(root)
        out[name] = blob

    # 疑似遗漏：形如“××有限公司”但不在词典里的写法（已替换成代号的不算）
    replacements = {t.replacement for t in red.terms}
    for name in out:
        if TEXT_PARTS.match(name):
            for text in all_text({name: out[name]}).values():
                for s in suspects_in(text, replacements):
                    if s not in result.suspects:
                        result.suspects.append(s)

    # Markdown：原件一份（内部留存），脱敏后一份（与 .docx 同名、同目录）；附件各自单独成文件
    texts = all_text(out)
    md_out, att_md = None, []
    if orig_md is not None:
        try:
            md_out, att_md = document_markdown(out, split)
        except Exception as e:  # Markdown 只是附带产物：失败不影响脱敏后的 .docx
            md_out, att_md = None, []
            result.warnings.append(f'Markdown 生成失败（{_where(e)}），只输出了 .docx')
        if md_out is not None:
            texts[dst.with_suffix('.md').name] = md_out
            texts.update((f'{a.name}.md', md) for a, md in att_md)
    try:
        attachments = split_document(_parse(out['word/document.xml']))[1] if split and 'word/document.xml' in out else []
    except Exception as e:
        attachments = []
        result.warnings.append(f'附件拆分失败（{_where(e)}），附件留在完整的 .docx 里')
    result.attachments = [f'{a.name}（表格 {a.tables} 个）' for a in attachments]

    # 泄漏复查：输出文件里不得再出现任何词典原文或规则命中
    for name, text in texts.items():
        for t in red.leaked_terms(text):
            result.leaks.append(f'{name}: 词典原文「{t.original}」')
        for p in red.patterns:
            m = p.regex.search(text)
            if m:
                result.leaks.append(f'{name}: 规则「{p.name}」命中 {m.group(0)}')

    dst.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dst, 'w') as zout:
        for info in infos:
            if info.filename in out:
                # 字体、图片等二进制部件原样保留，用最快的压缩级别（压缩率几乎一样，耗时少很多）
                level = 1 if not info.filename.endswith(('.xml', '.rels')) else None
                zout.writestr(info, out[info.filename], compress_type=info.compress_type, compresslevel=level)
    result.output = dst
    if attachments:
        adir = attachment_dir(dst)
        adir.mkdir(parents=True, exist_ok=True)
        for a in attachments:
            (adir / f'{a.name}.docx').write_bytes(attachment_docx(out, a))
    if orig_md is not None and md_out is not None:
        dst.with_suffix('.md').write_text(md_out, encoding='utf-8')
        for a, md in att_md:
            (attachment_dir(dst) / f'{a.name}.md').write_text(md, encoding='utf-8')
        orig_md.parent.mkdir(parents=True, exist_ok=True)
        try:
            orig_main, orig_att = document_markdown(parts, split)
        except Exception as e:
            result.warnings.append(f'原件 Markdown 生成失败（{_where(e)}）')
            return result
        orig_md.write_text(orig_main, encoding='utf-8')
        if orig_att:
            attachment_dir(orig_md).mkdir(parents=True, exist_ok=True)
            for a, md in orig_att:
                (attachment_dir(orig_md) / f'{a.name}.md').write_text(md, encoding='utf-8')
    return result


# ── 旧格式转换 ────────────────────────────────────────────────────────────
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
    if src.read_bytes()[:2] == b'PK' and src.suffix.lower() in ('.doc', '.docm', '.dotx'):
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
                return None, 'LibreOffice 转换超时'
            out = Path(tmp, src.stem + '.docx')
            if out.exists():
                shutil.move(str(out), dst)
                return 'LibreOffice', ''
    textutil = shutil.which('textutil')
    if textutil and src.suffix.lower() in ('.doc', '.dot', '.rtf', '.odt', '.docm'):
        r = subprocess.run([textutil, '-convert', 'docx', '-output', str(dst), str(src)],
                           capture_output=True, text=True, timeout=300, check=False)
        if r.returncode == 0 and dst.exists():
            return 'Mac textutil', ''
        return None, f'textutil 转换失败：{(r.stderr or "").strip()[:80]}'
    return None, '没有可用的转换工具（Mac 自带 textutil 不支持 .wps；可安装 LibreOffice，或在 WPS / Word 里另存为 .docx）'


# ── 运行一批文件 ──────────────────────────────────────────────────────────
def run_dir(base: Path, now: _dt.datetime) -> Path:
    stamp = now.strftime('%Y%m%d-%H')
    target = base / stamp
    n = 2
    while target.exists():
        target = base / f'{stamp}-{n}'
        n += 1
    return target


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


_RED: Optional['Redactor'] = None


_SPLIT = True


def _init_worker(red: 'Redactor', split: bool = True) -> None:
    global _RED, _SPLIT
    _RED, _SPLIT = red, split


def _where(e: BaseException) -> str:
    """错误类型和出错的代码位置（不含文档内容），方便反馈问题。"""
    tb = traceback.extract_tb(e.__traceback__)
    loc = f' @ {Path(tb[-1].filename).name}:{tb[-1].lineno}' if tb else ''
    return f'{type(e).__name__}{loc}'


def _worker(src: Path, dst: Path, orig_md: Optional[Path] = None) -> FileResult:
    before = sha256(src)
    try:
        res = process_docx(src, dst, _RED, orig_md, _SPLIT)
    except zipfile.BadZipFile:
        res = FileResult(source=src, error='不是有效的 .docx（可能是改了扩展名的 .doc，或文件已损坏）')
    except Exception as e:  # 一个文件出错不影响其他文件
        res = FileResult(source=src, error=f'处理失败：{_where(e)}')
    if sha256(src) != before:  # 源文件只读的保证
        res.error = '源文件在处理过程中被修改（不应发生）'
    return res


def _progress(done: int, total: int, started: float) -> None:
    if done == total or done % 50 == 0:
        spent = time.monotonic() - started
        left = spent / done * (total - done)
        print(f'  {done}/{total}  已用 {spent:.0f} 秒，预计还需 {left:.0f} 秒', flush=True)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='制度文档（.docx）脱敏')
    ap.add_argument('--input', required=True, type=Path, help='原件目录（只读，含子目录）')
    ap.add_argument('--dict', required=True, type=Path, help='替换词典 CSV（见 DICTIONARY.md）')
    ap.add_argument('--patterns', type=Path, default=Path(__file__).with_name('patterns.csv'),
                    help='格式规则 CSV，默认使用工具自带的 patterns.csv')
    ap.add_argument('--output', type=Path, default=Path('脱敏结果'), help='结果根目录，默认 ./脱敏结果')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 1,
                    help='同时处理的文件数，默认等于 CPU 核数；设为 1 则逐个处理')
    ap.add_argument('--no-md', action='store_true', help='不生成 Markdown（默认生成原件与脱敏后各一份 .md）')
    ap.add_argument('--no-split', action='store_true', help='不拆分附件（默认每个附件另存一个 .docx 和 .md）')
    ap.add_argument('--convert-doc', action='store_true',
                    help='把 .doc / .rtf / .wps 等先自动转成 .docx 再脱敏（有 LibreOffice 用它，否则用 Mac 自带的 textutil）')
    args = ap.parse_args(argv)

    if not args.input.is_dir():
        raise SystemExit(f'原件目录不存在：{args.input}')
    terms = load_dictionary(args.dict)
    patterns = load_patterns(args.patterns)
    red = Redactor(terms, patterns)

    now = _dt.datetime.now()
    out_root = run_dir(args.output, now)
    docs_dir = out_root / '脱敏文件'
    internal = out_root / '内部留存-勿外发'
    internal.mkdir(parents=True)

    sources = sorted(p for p in args.input.rglob('*') if p.is_file() and not p.name.startswith(('~$', '.')))
    skipped = [p for p in sources if p.suffix.lower() != '.docx']
    conversions: Dict[Path, Tuple[Path, str]] = {}   # 转换出的 .docx → (原件, 转换工具)
    conv_failed: List[Tuple[Path, str]] = []
    convertible = [p for p in skipped if p.suffix.lower() in CONVERTIBLE]
    if args.convert_doc and convertible:
        conv_dir = internal / '转换后的docx'
        print(f'先把 {len(convertible)} 个旧格式文件转成 .docx（转换结果含原文，放在「内部留存-勿外发/转换后的docx」）……', flush=True)
        for n, p in enumerate(convertible, start=1):
            target = conv_dir / p.relative_to(args.input).with_suffix('.docx')
            how, why = convert_to_docx(p, target)
            if how:
                conversions[target] = (p, how)
            else:
                conv_failed.append((p, why))
            print(f'  转换 {n}/{len(convertible)}', flush=True)
        done = {orig for orig, _h in conversions.values()}
        skipped = [p for p in skipped if p not in done]
    jobs = []
    docx_sources = [p for p in sources if p.suffix.lower() == '.docx'] + list(conversions)
    for src in docx_sources:
        rel = (conversions[src][0].relative_to(args.input).with_suffix('.docx') if src in conversions
               else src.relative_to(args.input))
        new_stem, _ = red.redact_string(rel.stem)
        new_parent = Path(*[red.redact_string(part)[0] for part in rel.parent.parts]) if rel.parent.parts else Path()
        orig_md = None if args.no_md else internal / '原件md' / rel.with_suffix('.md')
        jobs.append((src, docs_dir / new_parent / (new_stem + '.docx'), orig_md))
    clashes = [d for d, n in Counter(d for _s, d, _m in jobs).items() if n > 1]
    if clashes:
        raise SystemExit('以下输出文件名在脱敏后重名（不同原件被替换成同一个名字），请调整词典后重试：\n'
                         + '\n'.join(f'  {c}' for c in clashes))

    started = time.monotonic()
    results: List[FileResult] = []
    if args.jobs > 1 and len(jobs) > 1:
        with ProcessPoolExecutor(max_workers=args.jobs, initializer=_init_worker, initargs=(red, not args.no_split)) as pool:
            futures = [pool.submit(_worker, *job) for job in jobs]
            for n, fut in enumerate(as_completed(futures), start=1):
                results.append(fut.result())
                _progress(n, len(jobs), started)
    else:
        _init_worker(red, not args.no_split)
        for n, job in enumerate(jobs, start=1):
            results.append(_worker(*job))
            _progress(n, len(jobs), started)
    for r in results:
        if r.source in conversions:
            orig, how = conversions[r.source]
            r.source = orig
            r.warnings.append(f'由 {orig.suffix} 自动转换（{how}），版式可能与原件有差异，请打开核对')
    results.sort(key=lambda r: str(r.source))
    elapsed = time.monotonic() - started

    summary = summarize(results, terms, patterns)
    write_mapping(internal / '对照表.csv', results, args.input)
    write_summary(internal / '替换汇总.csv', summary)
    write_report(internal / '报告.md', results, skipped, args, out_root, now, len(terms), len(patterns), summary,
                 conv_failed)

    failed = [r for r in results if r.error or r.leaks]
    n_att = sum(len(r.attachments) for r in results)
    dict_rows = [s for s in summary if s.source == '词典']
    dict_hits = sum(s.count for s in dict_rows)
    rule_hits = sum(s.count for s in summary if s.source == '规则')
    unused = [s for s in dict_rows if s.count == 0]
    print(f'处理 {len(results)} 个 .docx（{elapsed:.1f} 秒）'
          + (f'，其中 {len(conversions)} 个由旧格式自动转换' if conversions else '')
          + f'，跳过 {len(skipped)} 个其他文件，{len(failed)} 个需处理。')
    print(f'共替换 {dict_hits + rule_hits} 处：词典 {dict_hits} 处（{len(dict_rows) - len(unused)}/{len(dict_rows)} 个词条命中），'
          f'格式规则 {rule_hits} 处。' + (f'{len(unused)} 个词条未命中，见报告。' if unused else ''))
    if n_att:
        print(f'拆出附件 {n_att} 个（{sum(1 for r in results if r.attachments)} 个文件有附件），在各文件旁的「…-附件」文件夹里。')
    print(f'脱敏文件：{docs_dir}' + ('' if args.no_md else '（.docx 与同名 .md）'))
    if not args.no_md:
        print(f'原件 Markdown：{internal / "原件md"}')
    print(f'报告：{internal / "报告.md"}')
    if skipped:
        by_ext = Counter(p.suffix.lower() or '（无扩展名）' for p in skipped)
        print('\n跳过的文件（' + '，'.join(f'{e} {n} 个' for e, n in by_ext.most_common()) + '）：')
        for p in skipped[:15]:
            reason = dict(conv_failed).get(p)
            print(f'  {p.relative_to(args.input)}' + (f'  ← 转换失败：{reason}' if reason else ''))
        if len(skipped) > 15:
            print(f'  ……共 {len(skipped)} 个，完整列表见报告')
        if not args.convert_doc and any(p.suffix.lower() in CONVERTIBLE for p in skipped):
            print('  .doc / .rtf / .wps 等旧格式：加 --convert-doc 自动转成 .docx 再脱敏，或在 Word / WPS 里另存为 .docx。')
    if failed:
        print('\n需处理的文件：')
        for r in failed[:15]:
            print(f'  {r.source.relative_to(args.input)}  ← ' + (r.error or '泄漏复查未通过，见报告'))
    warned = [r for r in results if r.warnings]
    if warned:
        print(f'\n{len(warned)} 个文件有提示（如自动转换、Markdown 未生成），见报告。')
    return 1 if failed else 0


@dataclass
class SummaryRow:
    source: str        # 词典 / 规则
    category: str
    original: str      # 词典原文；规则行为规则名
    replacement: str
    count: int = 0
    files: set = field(default_factory=set)


def summarize(results: List[FileResult], terms: Sequence[Term], patterns: Sequence[Pattern]) -> List[SummaryRow]:
    """整批统计：每个词典词条、每条格式规则各替换了多少处、涉及几个文件；未命中的词条也列出（次数 0）。"""
    by_term = OrderedDict((t.original.lower(), SummaryRow('词典', t.category, t.original, t.replacement)) for t in terms)
    by_rule = OrderedDict((p.name, SummaryRow('规则', p.name, p.name, p.replacement)) for p in patterns)
    for r in results:
        for _part, h in r.hits:
            row = by_term.get((h.term or h.original).lower())
            if row is None or row.category != h.category:
                row = by_rule.get(h.category)
            if row is None:
                continue
            row.count += 1
            row.files.add(str(r.source))
    return list(by_term.values()) + list(by_rule.values())


def write_summary(path: Path, summary: List[SummaryRow]) -> None:
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['来源', '类别', '原文或规则', '替换为', '替换次数', '涉及文件数'])
        for s in summary:
            wr.writerow([s.source, s.category, s.original, s.replacement, s.count, len(s.files)])


def write_mapping(path: Path, results: List[FileResult], input_dir: Path) -> None:
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['文件', '部件', '类别', '原文', '替换为', '次数'])
        for r in results:
            counts = Counter((part, h.category, h.original, h.replacement) for part, h in r.hits)
            for (part, cat, orig, repl), n in sorted(counts.items()):
                wr.writerow([str(r.source.relative_to(input_dir)), part, cat, orig, repl, n])


def write_report(path: Path, results: List[FileResult], skipped: List[Path], args, out_root: Path,
                 now: _dt.datetime, n_terms: int, n_patterns: int, summary: List[SummaryRow],
                 conv_failed: Sequence[Tuple[Path, str]] = ()) -> None:
    ok = [r for r in results if not r.error and not r.leaks]
    dict_rows = [s for s in summary if s.source == '词典']
    rule_rows = [s for s in summary if s.source == '规则']
    total = sum(s.count for s in summary)
    lines = [
        '# 脱敏报告（内部留存，勿外发）',
        '',
        f'- 时间：{now.strftime("%Y-%m-%d %H:%M:%S")}',
        f'- 原件目录：{args.input}',
        f'- 输出目录：{out_root}',
        f'- 词典：{args.dict}（{n_terms} 条）；规则：{args.patterns}（{n_patterns} 条启用）',
        f'- 结果：{len(results)} 个 .docx，{len(ok)} 个通过复查，{len(results) - len(ok)} 个需处理；跳过 {len(skipped)} 个非 .docx 文件',
        '',
        '只有 `脱敏文件/`（脱敏后的 .docx 与 .md）可以外发。本报告、`原件md/`、`对照表.csv` 与 `替换汇总.csv` 含原文。',
        '',
        '## 替换汇总',
        '',
        f'共替换 **{total}** 处：词典 {sum(s.count for s in dict_rows)} 处，格式规则 {sum(s.count for s in rule_rows)} 处。'
        '明细见 `替换汇总.csv`（每个词条一行）和 `对照表.csv`（每个文件每处一行）。',
        '',
        '| 来源 | 类别 | 原文或规则 | 替换为 | 替换次数 | 涉及文件数 |',
        '|---|---|---|---|---:|---:|',
    ]
    lines += [f'| {s.source} | {s.category} | {s.original} | {s.replacement} | {s.count} | {len(s.files)} |'
              for s in summary if s.count]
    unused = [s for s in dict_rows if s.count == 0]
    if unused:
        lines += ['', f'**未命中的词典条目（{len(unused)} 个）**：这些原文在所有文件里都没出现。'
                  '可能是写法和文件里不一致（错字、全半角、空格），请核对：', '']
        lines += [f'- {s.category}：{s.original}' for s in unused]
    lines.append('')
    if skipped:
        reasons = dict(conv_failed)
        lines += ['## 跳过的文件', '', '不是 .docx。.doc / .rtf / .wps 等旧格式：运行时加 `--convert-doc` 自动转换，'
                  '或在 Word / WPS 中「另存为」.docx 后重新运行。', '']
        lines += [f'- {p.relative_to(args.input)}' + (f'（转换失败：{reasons[p]}）' if p in reasons else '')
                  for p in skipped] + ['']
    for r in results:
        rel = r.source.relative_to(args.input)
        status = '❌ 需处理' if (r.error or r.leaks) else '✅ 通过复查'
        lines += [f'## {rel} — {status}', '']
        if r.error:
            lines += [f'- 错误：{r.error}', '']
            continue
        for wmsg in r.warnings:
            lines.append(f'- **提示**：{wmsg}')
        lines.append(f'- 输出：{r.output.relative_to(out_root) if r.output else "-"}')
        cats = Counter(h.category for _p, h in r.hits)
        lines.append('- 替换：' + ('，'.join(f'{c} {n} 处' for c, n in cats.most_common()) if cats else '无'))
        lines.append(f'- 接受修订：{r.revisions_accepted} 处；删除批注：{r.comments_removed} 条')
        if r.properties_cleared:
            lines.append('- 清空文档属性：' + '、'.join(sorted(set(r.properties_cleared))))
        if r.leaks:
            lines.append('- **泄漏复查未通过**：')
            lines += [f'  - {x}' for x in r.leaks]
        if r.media or r.embeddings:
            lines.append(f'- **需人工检查**：图片 {len(r.media)} 个、嵌入对象 {len(r.embeddings)} 个（工具不处理图片和嵌入文件里的文字）')
        if r.attachments:
            lines.append(f'- 拆出附件 {len(r.attachments)} 个（在「{Path(r.output.stem + "-附件") if r.output else ""}」）：'
                         + '、'.join(r.attachments))
        if r.suspects:
            lines.append('- **疑似遗漏**（像机构名但不在词典里，确认后加入词典重跑）：' + '、'.join(r.suspects[:30]))
        lines.append('')
    path.write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
