"""把 .docx 转成 Markdown 文本（只依赖 lxml），供脱敏工具输出「原件」与「脱敏后」两份 .md。

转换的是阅读用的正文，不是排版：
- 段落按顺序输出；修订按「全部接受」读取（删除的文字不出现），批注不输出。
- Word 自动编号（如「第一条」「（一）」「1.」）按编号定义算出文字，写进正文。
- 标题样式 → `#`；「第X章」→ `##`，「第X节」→ `###`；「第X条」加粗条号，便于后续逐条拆分。
- 表格 → Markdown 表格（合并单元格展开为空格子）；文本框里的文字单独成段。
- 脚注放在文末；图片写成「（图片）」；页眉页脚不输出。
- 新版 Word 为兼容旧版会把文本框、形状再存一份（mc:Fallback），只读第一份，不重复。

附件拆分（split_document）：正文之后单独一行「附件」「附件1」的位置是附件的起点，下一行是附件标题；
每个附件到下一个附件、或到文末版记（「……印发」「抄送：」）为止。版记归正文。
"""
from __future__ import annotations

import copy
import io
import re
import zipfile
from typing import Dict, List, Optional, Tuple

from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
V = 'urn:schemas-microsoft-com:vml'


def w(tag: str) -> str:
    return f'{{{W}}}{tag}'


# 读正文时整体跳过的子树：删除修订、兼容副本、格式属性、域代码
SKIP = {w('del'), w('moveFrom'), f'{{{MC}}}Fallback', w('pPr'), w('rPr'), w('instrText'),
        w('delText'), w('delInstrText'), w('commentReference'), w('annotationRef')}

CN_DIGITS = '零一二三四五六七八九'
CN_LEGAL = '零壹贰叁肆伍陆柒捌玖'
CHAPTER = re.compile(r'^第[零〇一二三四五六七八九十百千0-9]+章')
SECTION = re.compile(r'^第[零〇一二三四五六七八九十百千0-9]+节')
CLAUSE = re.compile(r'^(第[零〇一二三四五六七八九十百千0-9]+条)[\s\u3000]*')
MD_LEADING = re.compile(r'^([#>*+\-]|\d+[.)])(\s|$)')
ATTACH_START = re.compile(r'^附\s*件\s*([0-9０-９]{1,2}|[一二三四五六七八九十]{1,2})?\s*[:：]?$')
COLOPHON = re.compile(r'(印发|印制)$|^抄\s*送\s*[:：]')
BAD_NAME = re.compile(r'[\\/:*?"<>|\r\n\t]+')


def _parse(blob: Optional[bytes]) -> Optional[etree._Element]:
    if not blob:
        return None
    try:
        return etree.fromstring(blob, etree.XMLParser(resolve_entities=False, huge_tree=True))
    except etree.XMLSyntaxError:
        return None


def _val(el: Optional[etree._Element], tag: str) -> Optional[str]:
    if el is None:
        return None
    child = el.find(w(tag))
    return None if child is None else child.get(w('val'))


# ── 编号格式 ──────────────────────────────────────────────────────────────
def chinese_number(n: int, digits: str = CN_DIGITS, units: str = '十百千') -> str:
    """1 → 一，10 → 十，11 → 十一，21 → 二十一，105 → 一百零五（Word 的 chineseCounting）。"""
    if n <= 0:
        return digits[0]
    if n >= 10000:
        return str(n)
    parts, zero = [], False
    for power, unit in ((1000, units[2]), (100, units[1]), (10, units[0]), (1, '')):
        d = n // power % 10
        if d:
            if zero and parts:
                parts.append(digits[0])
            parts.append(digits[d] + unit)
            zero = False
        elif parts:
            zero = True
    s = ''.join(parts)
    if digits is CN_DIGITS and s.startswith('一十'):
        s = s[1:]  # 十一，而不是一十一
    return s


def _roman(n: int) -> str:
    out = ''
    for v, s in ((1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'), (100, 'C'), (90, 'XC'),
                 (50, 'L'), (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')):
        while n >= v:
            out, n = out + s, n - v
    return out


def _letters(n: int) -> str:
    # Word：a … z, aa … zz
    return chr(ord('a') + (n - 1) % 26) * ((n - 1) // 26 + 1)


def format_number(n: int, fmt: str) -> str:
    if fmt in ('chineseCounting', 'chineseCountingThousand', 'japaneseCounting', 'taiwaneseCounting',
               'taiwaneseCountingThousand', 'koreanCounting'):
        return chinese_number(n)
    if fmt == 'chineseLegalSimplified':
        return chinese_number(n, CN_LEGAL, '拾佰仟')
    if fmt in ('ideographDigital', 'japaneseDigitalTenThousand', 'taiwaneseDigital'):
        return ''.join('〇一二三四五六七八九'[int(c)] for c in str(n))
    if fmt == 'ideographTraditional':
        return '甲乙丙丁戊己庚辛壬癸'[(n - 1) % 10]
    if fmt == 'ideographZodiac':
        return '子丑寅卯辰巳午未申酉戌亥'[(n - 1) % 12]
    if fmt in ('decimalEnclosedCircle', 'decimalEnclosedCircleChinese'):
        return chr(0x2460 + n - 1) if 1 <= n <= 20 else str(n)
    if fmt == 'decimalFullWidth':
        return ''.join(chr(0xFF10 + int(c)) for c in str(n))
    if fmt == 'decimalZero':
        return f'{n:02d}'
    if fmt == 'upperRoman':
        return _roman(n)
    if fmt == 'lowerRoman':
        return _roman(n).lower()
    if fmt == 'upperLetter':
        return _letters(n).upper()
    if fmt == 'lowerLetter':
        return _letters(n)
    if fmt == 'none':
        return ''
    return str(n)


class Numbering:
    """按 numbering.xml 计算每个编号段落的编号文字，计数规则与 Word 一致（同一 abstractNum 连续计数，上级出现时下级重新开始）。"""

    def __init__(self, root: Optional[etree._Element]):
        self.levels: Dict[str, Dict[int, Tuple[int, str, str, str]]] = {}
        self.nums: Dict[str, Tuple[str, Dict[int, int]]] = {}
        self.counters: Dict[str, Dict[int, int]] = {}
        self.started: set = set()
        if root is None:
            return
        for an in root.iter(w('abstractNum')):
            lv = {}
            for l in an.iter(w('lvl')):
                ilvl = int(l.get(w('ilvl'), '0'))
                lv[ilvl] = (int(_val(l, 'start') or '1'), _val(l, 'numFmt') or 'decimal',
                            _val(l, 'lvlText') or '', _val(l, 'suff') or 'tab')
            self.levels[an.get(w('abstractNumId'))] = lv
        for num in root.iter(w('num')):
            overrides = {}
            for o in num.iter(w('lvlOverride')):
                start = _val(o, 'startOverride')
                if start is not None:
                    overrides[int(o.get(w('ilvl'), '0'))] = int(start)
            self.nums[num.get(w('numId'))] = (_val(num, 'abstractNumId'), overrides)

    def label(self, num_id: str, ilvl: int) -> str:
        if num_id not in self.nums or num_id == '0':
            return ''
        abs_id, overrides = self.nums[num_id]
        levels = self.levels.get(abs_id, {})
        if ilvl not in levels:
            return ''
        counts = self.counters.setdefault(abs_id, {})
        if num_id not in self.started:  # 带「重新开始编号」的列表从 startOverride 计起
            self.started.add(num_id)
            for lv, start in overrides.items():
                counts[lv] = start - 1
        start, fmt, text, suff = levels[ilvl]
        counts[ilvl] = counts.get(ilvl, start - 1) + 1
        for deeper in [k for k in counts if k > ilvl]:
            del counts[deeper]
        if fmt == 'bullet':
            return '- '

        def sub(m: 're.Match[str]') -> str:
            lv = int(m.group(1)) - 1
            if lv not in levels:
                return ''
            return format_number(counts.get(lv, levels[lv][0]), levels[lv][1])

        out = re.sub(r'%(\d)', sub, text)
        return out + ('' if suff == 'nothing' or not out else ' ')


class Styles:
    def __init__(self, root: Optional[etree._Element]):
        self.info: Dict[str, Tuple[str, Optional[str], Optional[etree._Element], Optional[str]]] = {}
        if root is None:
            return
        for st in root.iter(w('style')):
            sid = st.get(w('styleId'))
            name = (_val(st, 'name') or '').lower()
            ppr = st.find(w('pPr'))
            outline = _val(ppr, 'outlineLvl') if ppr is not None else None
            numpr = ppr.find(w('numPr')) if ppr is not None else None
            self.info[sid] = (name, outline, numpr, _val(st, 'basedOn'))

    def _chain(self, sid: Optional[str]):
        seen = set()
        while sid and sid in self.info and sid not in seen:
            seen.add(sid)
            yield self.info[sid]
            sid = self.info[sid][3]

    def heading_level(self, sid: Optional[str]) -> int:
        for name, outline, _n, _b in self._chain(sid):
            if name == 'title':
                return 1
            m = re.match(r'^(?:heading|标题)\s*(\d)$', name)
            if m:
                return int(m.group(1))
            if outline is not None and outline.isdigit() and int(outline) < 9:
                return int(outline) + 1
        return 0

    def numpr(self, sid: Optional[str]) -> Optional[etree._Element]:
        for _name, _o, numpr, _b in self._chain(sid):
            if numpr is not None:
                return numpr
        return None


# ── 正文 ──────────────────────────────────────────────────────────────────
class Converter:
    def __init__(self, parts: Dict[str, bytes]):
        self.styles = Styles(_parse(parts.get('word/styles.xml')))
        self.numbering = Numbering(_parse(parts.get('word/numbering.xml')))
        self.footnotes = self._notes(_parse(parts.get('word/footnotes.xml')), 'footnote')
        self.used_notes: List[str] = []
        self.doc = _parse(parts.get('word/document.xml'))

    def _notes(self, root: Optional[etree._Element], tag: str) -> Dict[str, str]:
        out = {}
        if root is None:
            return out
        for n in root.iter(w(tag)):
            if n.get(w('type')) in ('separator', 'continuationSeparator', 'continuationNotice'):
                continue
            out[n.get(w('id'))] = ' '.join(self._inline(p, []) for p in n.iter(w('p'))).strip()
        return out

    def _inline(self, el: etree._Element, boxes: List[etree._Element]) -> str:
        out: List[str] = []
        self._walk(el, out, boxes)
        return ''.join(out)

    def _walk(self, el: etree._Element, out: List[str], boxes: List[etree._Element]) -> None:
        for ch in el:
            tag = ch.tag
            if not isinstance(tag, str) or tag in SKIP:
                continue
            if tag == w('t'):
                out.append(ch.text or '')
            elif tag in (w('tab'), w('ptab')):
                out.append(' ')
            elif tag in (w('br'), w('cr')):
                if ch.get(w('type')) != 'page':
                    out.append('\n')
            elif tag in (w('noBreakHyphen'), w('softHyphen')):
                out.append('-' if tag == w('noBreakHyphen') else '')
            elif tag == w('txbxContent'):
                boxes.append(ch)
            elif tag == w('footnoteReference'):
                nid = ch.get(w('id'))
                if nid not in self.used_notes:
                    self.used_notes.append(nid)
                out.append(f'[^{nid}]')
            elif tag in (f'{{{A}}}blip', f'{{{V}}}imagedata'):
                out.append('（图片）')
            elif tag == f'{{{V}}}textpath' and ch.get('string'):
                out.append(ch.get('string'))  # 艺术字
            else:
                self._walk(ch, out, boxes)

    def paragraph(self, p: etree._Element) -> List[str]:
        boxes: List[etree._Element] = []
        text = self._inline(p, boxes)
        ppr = p.find(w('pPr'))
        sid = _val(ppr, 'pStyle') if ppr is not None else None
        numpr = ppr.find(w('numPr')) if ppr is not None else None
        if numpr is None:
            numpr = self.styles.numpr(sid)
        label = ''
        if numpr is not None:
            num_id = _val(numpr, 'numId')
            if num_id is not None:
                label = self.numbering.label(num_id, int(_val(numpr, 'ilvl') or '0'))
        text = re.sub(r'[ \t\u3000]+\n', '\n', text).strip()
        blocks: List[str] = []
        if text:
            blocks.append(self._block(label, text, ppr, sid))
        for box in boxes:
            blocks.extend(self.blocks(box))
        return blocks

    def _block(self, label: str, text: str, ppr: Optional[etree._Element], sid: Optional[str]) -> str:
        level = self.styles.heading_level(sid)
        if ppr is not None and not level:
            ol = _val(ppr, 'outlineLvl')
            if ol is not None and ol.isdigit() and int(ol) < 9:
                level = int(ol) + 1
        if label == '- ':
            return '- ' + text.replace('\n', '  \n  ')
        full = label + text
        if level:
            return '#' * min(level, 6) + ' ' + full.replace('\n', ' ')
        if CHAPTER.match(full):
            return '## ' + full.replace('\n', ' ')
        if SECTION.match(full):
            return '### ' + full.replace('\n', ' ')
        m = CLAUSE.match(full)
        if m:
            rest = full[m.end():]
            return f'**{m.group(1)}**' + (' ' + rest if rest else '')
        if MD_LEADING.match(full):  # 避免正文被当成标题、引用或列表
            full = '\\' + full
        return full.replace('\n', '  \n')

    def table(self, tbl: etree._Element) -> str:
        rows: List[List[str]] = []
        for tr in tbl.findall(w('tr')):
            row: List[str] = []
            for tc in tr.findall(w('tc')):
                tcpr = tc.find(w('tcPr'))
                span = int(_val(tcpr, 'gridSpan') or '1') if tcpr is not None else 1
                vmerge = tcpr.find(w('vMerge')) if tcpr is not None else None
                if vmerge is not None and vmerge.get(w('val')) != 'restart':
                    cell = ''  # 纵向合并的下方格子
                else:
                    cell = '<br>'.join(b for b in self.blocks(tc) if b)
                cell = cell.replace('|', '\\|').replace('\n', '<br>')
                row.append(cell)
                row.extend([''] * (span - 1))
            rows.append(row)
        rows = [r for r in rows if r]
        if not rows:
            return ''
        width = max(len(r) for r in rows)
        rows = [r + [''] * (width - len(r)) for r in rows]
        lines = ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * width]
        lines += ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
        return '\n'.join(lines)

    def blocks(self, container: etree._Element) -> List[str]:
        out: List[str] = []
        for ch in container:
            tag = ch.tag
            if tag == w('p'):
                out.extend(self.paragraph(ch))
            elif tag == w('tbl'):
                t = self.table(ch)
                if t:
                    out.append(t)
            elif tag in (w('sdt'), w('sdtContent'), w('customXml'), w('ins'), w('moveTo'), w('smartTag')):
                out.extend(self.blocks(ch))
            elif tag == f'{{{MC}}}AlternateContent':
                choice = ch.find(f'{{{MC}}}Choice')
                if choice is not None:
                    out.extend(self.blocks(choice))
        return out

    def convert(self) -> str:
        if self.doc is None:
            return ''
        body = self.doc.find(w('body'))
        return self.render(list(body if body is not None else self.doc))

    def render(self, elements: List[etree._Element], notes: bool = True) -> str:
        holder = etree.Element(w('body'))
        holder.extend(copy.deepcopy(e) for e in elements)
        blocks = self.blocks(holder)
        if not notes:
            return '\n\n'.join(blocks) + '\n'
        lines = [f'[^{n}]: {self.footnotes.get(n, "")}' for n in self.used_notes]
        if lines:
            blocks += ['---'] + lines
        return '\n\n'.join(blocks) + '\n'


def docx_to_markdown(parts: Dict[str, bytes]) -> str:
    """parts：docx 包内各部件（文件名 → 字节）。整篇转换，不拆附件。"""
    return Converter(parts).convert()


# ── 附件拆分 ──────────────────────────────────────────────────────────────
class Attachment:
    def __init__(self, number: int, title: str, blocks: List[etree._Element]):
        self.number = number
        self.title = title
        self.blocks = blocks
        self.tables = sum(1 for b in blocks for _ in b.iter(w('tbl')))

    @property
    def name(self) -> str:
        """文件名（不含扩展名），如「附件1-C集团接待审批表」。"""
        title = BAD_NAME.sub('_', self.title).strip(' ._')[:60]
        return f'附件{self.number}' + (f'-{title}' if title else '')


def _plain(el: etree._Element) -> str:
    return ''.join(t.text or '' for t in el.iter(w('t'))
                   if not any(a.tag == f'{{{MC}}}Fallback' for a in t.iterancestors())).strip()


def _cn_int(s: str) -> int:
    s = s.translate(str.maketrans('０１２３４５６７８９', '0123456789'))
    if s.isdigit():
        return int(s)
    n = {c: i for i, c in enumerate(CN_DIGITS)}
    if s == '十':
        return 10
    if s.startswith('十'):
        return 10 + n.get(s[1], 0)
    if s.endswith('十'):
        return n.get(s[0], 1) * 10
    return n.get(s[0], 0) * 10 + n.get(s[-1], 0) if len(s) == 2 else n.get(s, 0)


def split_document(doc: etree._Element) -> Tuple[List[etree._Element], List[Attachment], List[etree._Element]]:
    """把正文的顶层块分成：正文、各附件、文末版记。没有附件时附件列表为空、版记为空。"""
    body = doc.find(w('body'))
    blocks = [b for b in body if b.tag != w('sectPr')] if body is not None else []
    starts: List[Tuple[int, Optional[int]]] = []
    for i, b in enumerate(blocks):
        if b.tag == w('p'):
            m = ATTACH_START.match(_plain(b))
            if m:
                starts.append((i, _cn_int(m.group(1)) if m.group(1) else None))
    if not starts:
        return blocks, [], []
    end_all = len(blocks)
    for i in range(starts[-1][0] + 1, len(blocks)):
        if blocks[i].tag == w('p') and COLOPHON.search(_plain(blocks[i])):
            end_all = i
            break
    # 版记前面成串的空段落（排版用的空行）也归版记
    while end_all > starts[-1][0] + 1 and blocks[end_all - 1].tag == w('p') and not _plain(blocks[end_all - 1]):
        end_all -= 1
    bounds = [s for s, _n in starts[1:]] + [end_all]
    attachments = []
    for k, ((start, number), end) in enumerate(zip(starts, bounds), start=1):
        part = blocks[start:end]  # 含「附件1」这一行，单独打开时也知道是第几个附件
        title = ''
        for b in part[1:]:
            if b.tag == w('tbl'):
                break
            if b.tag == w('p') and _plain(b):
                title = _plain(b)
                break
        attachments.append(Attachment(number or k, title, part))
    return blocks[:starts[0][0]], attachments, blocks[end_all:]


def document_markdown(parts: Dict[str, bytes], split: bool = True) -> Tuple[str, List[Tuple[Attachment, str]]]:
    """正文 Markdown 与每个附件的 Markdown。split=False 或没有附件时，附件列表为空、正文即整篇。"""
    conv = Converter(parts)
    if conv.doc is None:
        return '', []
    main, attachments, colophon = split_document(conv.doc)
    if not split or not attachments:
        return conv.convert(), []
    main_md = conv.render(main + colophon)
    att_md = [(a, conv.render(a.blocks, notes=False)) for a in attachments]
    listing = '\n'.join(f'> - [{a.name}]({a.name}.md)' for a in attachments)
    main_md = main_md.rstrip('\n') + '\n\n> 附件已拆分为单独文件：\n>\n' + listing + '\n'
    return main_md, att_md


def attachment_docx(parts: Dict[str, bytes], att: Attachment) -> bytes:
    """只含这个附件内容的 .docx：样式、编号、页面设置沿用原文件，不带嵌入字体。"""
    root = _parse(parts['word/document.xml'])
    body = root.find(w('body'))
    sect = body.find(w('sectPr'))
    for c in list(body):
        body.remove(c)
    for b in att.blocks:
        body.append(copy.deepcopy(b))
    if sect is not None:
        body.append(sect)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            if name.startswith('word/fonts/') or name == 'word/_rels/fontTable.xml.rels' or name.endswith('/'):
                continue
            if name == 'word/document.xml':
                data = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
            elif name == 'word/fontTable.xml':
                ft = _parse(data)
                if ft is not None:
                    for tag in ('embedRegular', 'embedBold', 'embedItalic', 'embedBoldItalic'):
                        for e in list(ft.iter(w(tag))):
                            e.getparent().remove(e)
                    data = etree.tostring(ft, xml_declaration=True, encoding='UTF-8', standalone=True)
            elif name == 'word/settings.xml':
                st = _parse(data)
                if st is not None:
                    for e in list(st.iter(w('embedTrueTypeFonts'))) + list(st.iter(w('saveSubsetFonts'))):
                        e.getparent().remove(e)
                    data = etree.tostring(st, xml_declaration=True, encoding='UTF-8', standalone=True)
            z.writestr(name, data)
    return buf.getvalue()
