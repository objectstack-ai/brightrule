#!/usr/bin/env python3
"""扫描版 PDF → Markdown：逐页用 macOS 自带的文字识别（Vision，与「实况文本」同一套）识别，再整理成
和 Word 转出来一样结构的 Markdown（## 章、### 节、**第X条**），交给 redact.py 按词典脱敏。

只在 Mac 上可用（需要 pyobjc 的 Vision、Quartz，run.sh 在 Mac 上自动安装）。识别出的文字可能有错字：
错字会让词典匹配不上，所以这些文件在报告和批次清单里都标「OCR 识别，需人工核对」。
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
from docx2md import label_sections  # noqa: E402


@dataclass
class Line:
    text: str
    x: float       # 左边，页宽的比例（0–1）
    right: float   # 右边，页宽的比例


def unavailable_reason() -> Optional[str]:
    """不能识别时返回原因（不是 Mac、或缺组件）；能识别返回 None。"""
    if sys.platform != 'darwin':
        return '扫描版 PDF 需要在 Mac 上运行（用 macOS 自带的文字识别）'
    try:
        import Quartz  # noqa: F401
        import Vision  # noqa: F401
    except ImportError:
        return '缺少 macOS 文字识别组件：重新运行 ./run.sh 会自动安装（pyobjc-framework-Vision）'
    return None


def ocr_pdf(path: Path, scale: float = 3.0) -> List[List[Line]]:
    """逐页识别，返回每页的文字行（从上到下、从左到右）。scale 3 ≈ 216 dpi。"""
    import Quartz
    import Vision
    from Foundation import NSURL

    doc = Quartz.CGPDFDocumentCreateWithURL(NSURL.fileURLWithPath_(str(path)))
    if doc is None:
        raise ValueError('打不开这个 PDF')
    pages: List[List[Line]] = []
    for i in range(1, Quartz.CGPDFDocumentGetNumberOfPages(doc) + 1):
        page = Quartz.CGPDFDocumentGetPage(doc, i)
        box = Quartz.CGPDFPageGetBoxRect(page, Quartz.kCGPDFMediaBox)
        w, h = int(box.size.width * scale), int(box.size.height * scale)
        ctx = Quartz.CGBitmapContextCreate(None, w, h, 8, 0, Quartz.CGColorSpaceCreateDeviceRGB(),
                                           Quartz.kCGImageAlphaPremultipliedLast)
        Quartz.CGContextSetRGBFillColor(ctx, 1, 1, 1, 1)
        Quartz.CGContextFillRect(ctx, Quartz.CGRectMake(0, 0, w, h))
        Quartz.CGContextScaleCTM(ctx, scale, scale)
        Quartz.CGContextDrawPDFPage(ctx, page)
        image = Quartz.CGBitmapContextCreateImage(ctx)
        request = Vision.VNRecognizeTextRequest.alloc().init()
        request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
        request.setRecognitionLanguages_(['zh-Hans', 'en-US'])
        request.setUsesLanguageCorrection_(True)
        handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(image, None)
        handler.performRequests_error_([request], None)
        found = []
        for obs in request.results() or []:
            cand = obs.topCandidates_(1)
            if not cand:
                continue
            b = obs.boundingBox()   # 归一化坐标，原点在左下
            top = 1 - b.origin.y - b.size.height
            found.append((round(top, 3), b.origin.x, Line(str(cand[0].string()), b.origin.x, b.origin.x + b.size.width)))
        found.sort(key=lambda t: (t[0], t[1]))
        pages.append([t[2] for t in found])
    return pages


# ── 识别出的行 → Markdown ─────────────────────────────────────────────────
NUM = '零〇一二三四五六七八九十百千0-9'
CHAPTER = re.compile(rf'^第\s*([{NUM}]+)\s*章\s*(.*)$')
SECTION = re.compile(rf'^第\s*([{NUM}]+)\s*节\s*(.*)$')
CLAUSE = re.compile(rf'^第\s*([{NUM}]+)\s*条(之[一二三四五六七八九十]+)?\s*(.*)$')
STARTS_BLOCK = re.compile(r'^(?:[一二三四五六七八九十]+、|[（(][一二三四五六七八九十0-9]+[)）]|\d+[.、．]\s*\S|附\s*[件表])')
PAGE_FURNITURE = re.compile(r'^(?:[-—–\s]*\d{1,3}[-—–\s]*|第\s*\d+\s*页.*|共\s*\d+\s*页.*|\d+\s*/\s*\d+)$')
ENDS_SENTENCE = re.compile(r'[。；：！？」』）)]$')


def _block_of(text: str) -> str:
    """一段文字按章、节、条套上和 Word 转出来一样的写法。"""
    m = CHAPTER.match(text)
    if m:
        return f'## 第{m.group(1)}章' + (f' {m.group(2).strip()}' if m.group(2).strip() else '')
    m = SECTION.match(text)
    if m:
        return f'### 第{m.group(1)}节' + (f' {m.group(2).strip()}' if m.group(2).strip() else '')
    m = CLAUSE.match(text)
    if m:
        return f'**第{m.group(1)}条{m.group(2) or ""}** {m.group(3).strip()}'.rstrip()
    return text


def lines_to_markdown(pages: List[List[Line]]) -> str:
    """把逐行识别的文字拼回段落：一行顶到右边、没以句号等收尾，就和下一行是同一段；章、节、条、序号开头的行另起一段。
    页码、「第 X 页」之类去掉。"""
    paragraphs: List[str] = []
    current = ''
    current_short = False
    for lines in pages:
        lines = [ln for ln in lines if ln.text.strip() and not PAGE_FURNITURE.match(ln.text.strip())]
        if not lines:
            continue
        right_edge = max(ln.right for ln in lines)
        for ln in lines:
            text = re.sub(r'\s+', ' ', ln.text).strip()
            new_block = bool(CHAPTER.match(text) or SECTION.match(text) or CLAUSE.match(text) or STARTS_BLOCK.match(text))
            if current and (new_block or ENDS_SENTENCE.search(current) or current_short):
                paragraphs.append(current)
                current = ''
            current = f'{current}{text}' if current else text
            # 这一行没写到右边（离右边超过一成），说明这一段在这一行结束了
            current_short = ln.right < right_edge - 0.1
    if current:
        paragraphs.append(current)
    blocks = [_block_of(p) for p in paragraphs]
    return '\n\n'.join(label_sections(blocks)).strip() + '\n'
