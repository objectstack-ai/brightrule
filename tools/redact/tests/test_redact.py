"""脱敏工具测试：用代码生成的 .docx 覆盖各种容易漏的位置，不依赖任何真实文件。

运行：python3 -m unittest discover -s tests   （在 tools/redact 目录下）
"""
from __future__ import annotations

import csv
import os
import hashlib
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import redact  # noqa: E402

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''

ROOT_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''

DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="mailto:wangmm@huadong-demo.com" TargetMode="External"/>
<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>'''

W = f'xmlns:w="{W_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

DOCUMENT = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document {W}><w:body>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>华东</w:t></w:r><w:r><w:t>示例物流有限公司差旅费报销管理办法</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">一线城市住宿标准为每晚不超过 600 元。</w:t></w:r></w:p>
<w:p><w:r><w:t>本办法由</w:t></w:r><w:ins w:id="1" w:author="王某某"><w:r><w:t>财务共享中心</w:t></w:r></w:ins><w:del w:id="2" w:author="王某某"><w:r><w:delText>华东示例科技有限公司财务部</w:delText></w:r></w:del><w:r><w:t>负责解释。</w:t></w:r></w:p>
<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>联系人：李某，电话 13812345678，邮箱 lim@huadong-demo.com。</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>座机</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>021-</w:t></w:r><w:r><w:t>12345678</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t xml:space="preserve">身份证 310101199001011234，账户 6222020200001234567，统一社会信用代码 91310000MA1FL0AB2C。</w:t></w:r></w:p>
<w:p><w:r><w:t>办公地址：上海市浦东新区示例路88号。</w:t></w:r></w:p>
<w:p><w:r><w:t>审批请登录华示OA，详见 https://oa.huadong-demo.com/policy 。</w:t></w:r></w:p>
<w:p><w:r><w:t>本办法参照华东示例集团相关规定执行，由华东示例控股集团有限公司发布。</w:t></w:r></w:p>
<w:p><w:r><w:t>合作单位南方未登记贸易有限公司另行约定。</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="图片 1" descr="华东示例物流有限公司公章"/></wp:inline></w:drawing></w:r></w:p>
<w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>文本框：王某某签发</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>
<w:sectPr><w:headerReference r:id="rId3"/><w:footerReference r:id="rId4"/></w:sectPr>
</w:body></w:document>'''

NUMBERING = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering {W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="chineseCounting"/><w:lvlText w:val="第%1条"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'''

COMMENTS = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments {W}><w:comment w:id="0" w:author="王某某"><w:p><w:r><w:t>内部讨论：华东示例集团董事会意见</w:t></w:r></w:p></w:comment></w:comments>'''

HEADER = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr {W}><w:p><w:r><w:t>华东示例控股集团有限公司 内部资料</w:t></w:r></w:p></w:hdr>'''

FOOTER = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr {W}><w:p><w:r><w:t>华东示例物流有限公司 印发</w:t></w:r></w:p></w:ftr>'''

SETTINGS = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings {W}><w:trackRevisions/></w:settings>'''

CORE = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>华东示例物流有限公司差旅办法</dc:title><dc:creator>王某某</dc:creator><cp:lastModifiedBy>李某</cp:lastModifiedBy></cp:coreProperties>'''

APP = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Company>华东示例控股集团有限公司</Company><Manager>王某某</Manager></Properties>'''

PARTS = {
    '[Content_Types].xml': CONTENT_TYPES, '_rels/.rels': ROOT_RELS, 'word/_rels/document.xml.rels': DOC_RELS,
    'word/document.xml': DOCUMENT, 'word/numbering.xml': NUMBERING, 'word/comments.xml': COMMENTS,
    'word/header1.xml': HEADER, 'word/footer1.xml': FOOTER, 'word/settings.xml': SETTINGS,
    'docProps/core.xml': CORE, 'docProps/app.xml': APP,
}

# 输出里不得出现的原文（含被删除修订、批注、属性、链接、文本框、图片说明里的）
SECRETS = ['华东', '华东示例', '王某某', '李某', '财务共享中心', '华示OA', '示例路88号', '13812345678',
           'lim@huadong-demo.com', 'wangmm@huadong-demo.com', 'huadong-demo', '12345678',
           '310101199001011234', '6222020200001234567', '91310000MA1FL0AB2C', '董事会意见']


def make_docx(path: Path) -> None:
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, text in PARTS.items():
            z.writestr(name, text)
        z.writestr('word/media/image1.png', b'\x89PNG\r\n\x1a\n')


def docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        return '\n'.join(z.read(n).decode('utf-8', 'replace') for n in z.namelist()
                         if n.endswith(('.xml', '.rels')))


class RedactToolTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = Path(tempfile.mkdtemp())
        cls.src = cls.tmp / '原件'
        (cls.src / '华东示例物流有限公司').mkdir(parents=True)
        cls.docx = cls.src / '华东示例物流有限公司' / '华东示例物流有限公司差旅办法.docx'
        make_docx(cls.docx)
        (cls.src / '旧格式制度.doc').write_bytes(b'not a docx')
        (cls.src / '~$临时文件.docx').write_bytes(b'lock')
        cls.dict = cls.tmp / '词典.csv'
        shutil.copy(HERE.parent / '词典示例.csv', cls.dict)
        # 词典里再加一行地址别名，测试“扩展”只需加一行
        with cls.dict.open('a', encoding='utf-8') as f:
            f.write('其他,huadong-demo,demo,域名\n')
            f.write('其他,从未出现的写法,X,用于测试未命中\n')
        cls.src_hash = hashlib.sha256(cls.docx.read_bytes()).hexdigest()
        cls.out = cls.tmp / '脱敏结果'
        cls.code = redact.main(['--input', str(cls.src), '--dict', str(cls.dict), '--output', str(cls.out)])
        cls.run_root = next(cls.out.iterdir())
        cls.result = next((cls.run_root / '脱敏文件').rglob('*.docx'))
        cls.text = docx_text(cls.result)
        with zipfile.ZipFile(cls.result) as z:
            parts = {n: z.read(n) for n in z.namelist()}
        # 按段落拼接后的文字：跨格式片段的内容在这里是连续的
        cls.plain = '\n'.join(redact.all_text(parts).values())

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.tmp)

    def test_run_passes_and_source_untouched(self):
        self.assertEqual(self.code, 0)
        self.assertEqual(hashlib.sha256(self.docx.read_bytes()).hexdigest(), self.src_hash)

    def test_output_dir_is_named_by_hour_and_holds_two_areas(self):
        self.assertRegex(self.run_root.name, r'^\d{8}-\d{2}$')
        self.assertTrue((self.run_root / '内部留存-勿外发' / '对照表.csv').exists())
        self.assertTrue((self.run_root / '内部留存-勿外发' / '报告.md').exists())

    def test_same_hour_second_run_gets_a_suffix(self):
        now = redact._dt.datetime(2026, 11, 24, 15, 5)
        base = self.tmp / 'stamp'
        first = redact.run_dir(base, now)
        first.mkdir(parents=True)
        self.assertEqual(redact.run_dir(base, now).name, '20261124-15-2')

    def test_no_secret_survives_anywhere(self):
        for s in SECRETS:
            self.assertNotIn(s, self.text, f'残留：{s}')
            self.assertNotIn(s, self.plain, f'跨格式片段残留：{s}')

    def test_file_and_folder_names_are_redacted(self):
        rel = self.result.relative_to(self.run_root / '脱敏文件')
        self.assertEqual(str(rel), str(Path('甲公司') / '甲公司差旅办法.docx'))

    def test_replacements_are_consistent_and_longest_first(self):
        self.assertIn('甲公司差旅费报销管理办法', self.plain)        # 跨格式片段的公司名
        self.assertIn('参照甲集团相关规定执行，由甲集团发布', self.plain)  # 简称与全称一致
        self.assertIn('人员B', self.plain)
        self.assertIn('【手机号】', self.plain)
        self.assertIn('【固定电话】', self.plain)                    # 被拆成两段的电话
        self.assertIn('【身份证号】', self.plain)
        self.assertIn('【银行卡号】', self.plain)
        self.assertIn('【统一社会信用代码】', self.plain)
        self.assertIn('【地址】', self.plain)
        self.assertIn('OA系统', self.plain)

    def test_numbers_and_numbering_are_kept(self):
        self.assertIn('每晚不超过 600 元', self.text)
        self.assertIn('<w:numId w:val="1"/>', self.text)
        with zipfile.ZipFile(self.result) as z:
            self.assertEqual(z.read('word/numbering.xml').decode(), NUMBERING)

    def test_revisions_accepted_and_comments_removed(self):
        with zipfile.ZipFile(self.result) as z:
            names = z.namelist()
            doc = z.read('word/document.xml').decode()
            rels = z.read('word/_rels/document.xml.rels').decode()
            ct = z.read('[Content_Types].xml').decode()
            settings = z.read('word/settings.xml').decode()
        self.assertNotIn('word/comments.xml', names)
        self.assertNotIn('comments', rels)
        self.assertNotIn('comments', ct)
        for tag in ('w:del ', 'w:ins ', 'w:delText', 'commentReference', 'commentRangeStart', 'trackRevisions'):
            self.assertNotIn(tag, doc + settings)
        # 插入的内容保留，删除的内容清除（按段落文字比较，不受格式片段拆分影响）
        paragraphs = redact.all_text({'word/document.xml': doc.encode()})['word/document.xml']
        self.assertIn('本办法由财务部门负责解释。', paragraphs)
        self.assertNotIn('科技有限公司财务部', paragraphs)

    def test_properties_cleared(self):
        with zipfile.ZipFile(self.result) as z:
            core = z.read('docProps/core.xml').decode()
            app = z.read('docProps/app.xml').decode()
        self.assertIn('<dc:title>甲公司差旅办法</dc:title>', core)
        self.assertNotIn('王某某', core + app)

    def test_report_flags_what_needs_a_person(self):
        report = (self.run_root / '内部留存-勿外发' / '报告.md').read_text(encoding='utf-8')
        self.assertIn('旧格式制度.doc', report)                  # .doc 跳过并提示另存为
        self.assertNotIn('~$临时文件', report)                   # Word 锁文件忽略
        self.assertIn('图片 1 个', report)
        self.assertIn('南方未登记贸易有限公司', report)           # 词典外的机构名被提示
        self.assertIn('✅ 通过复查', report)

    def test_mapping_lists_originals(self):
        with (self.run_root / '内部留存-勿外发' / '对照表.csv').open(encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))
        pairs = {(r['原文'], r['替换为']) for r in rows}
        self.assertIn(('华东示例物流有限公司', '甲公司'), pairs)
        self.assertIn(('13812345678', '【手机号】'), pairs)

    def test_summary_counts_every_term_and_lists_unused_ones(self):
        internal = self.run_root / '内部留存-勿外发'
        with (internal / '替换汇总.csv').open(encoding='utf-8-sig') as f:
            rows = {r['原文或规则']: r for r in csv.DictReader(f)}
        # 「华东示例物流有限公司」：正文标题、页脚、标题属性、图片说明、文件名不计（文件名不在文档里）
        self.assertEqual(rows['华东示例物流有限公司']['替换次数'], '4')
        self.assertEqual(rows['华东示例物流有限公司']['涉及文件数'], '1')
        self.assertEqual(rows['手机号']['替换次数'], '1')
        self.assertEqual(rows['从未出现的写法']['替换次数'], '0')
        report = (internal / '报告.md').read_text(encoding='utf-8')
        self.assertIn('## 替换汇总', report)
        # 未命中：特意加的词；只出现在被删除修订里的词；总在更长全称里的简称；被邮箱 / 网址规则整体替换的域名
        self.assertIn('未命中的词典条目（4 个）', report)
        for term in ('从未出现的写法', '华东示例科技有限公司', '- 集团：华东示例\n', 'huadong-demo'):
            self.assertIn(term, report)

    def test_leak_check_fails_the_run(self):
        """词典外的敏感词在复查里不会被发现；词典里有但没被替换时，运行必须失败。"""
        terms = redact.load_dictionary(self.dict)
        red = redact.Redactor(terms, [])
        leaked = redact.FileResult(source=self.docx)
        data = {'word/document.xml': DOCUMENT.encode()}
        for name, text in redact.all_text(data).items():
            for t in red.terms:
                if t.original in text:
                    leaked.leaks.append(t.original)
        self.assertTrue(leaked.leaks)

    def test_markdown_for_original_and_redacted(self):
        md = self.result.with_suffix('.md').read_text(encoding='utf-8')
        orig = (self.run_root / '内部留存-勿外发' / '原件md' / '华东示例物流有限公司'
                / '华东示例物流有限公司差旅办法.md').read_text(encoding='utf-8')
        for s in SECRETS:
            self.assertNotIn(s, md, f'脱敏后的 .md 残留：{s}')
        self.assertIn('华东示例物流有限公司差旅费报销管理办法', orig)   # 原件 .md 保留原文
        self.assertIn('本办法由财务共享中心负责解释。', orig)          # 按接受修订读取
        self.assertNotIn('华东示例科技有限公司财务部', orig)
        self.assertNotIn('董事会意见', orig)                         # 批注不输出
        # 自动编号算成文字，条号加粗；表格；文本框
        self.assertIn('**第一条** 一线城市住宿标准为每晚不超过 600 元。', md)
        self.assertIn('| 座机 | 【固定电话】 |', md)
        self.assertIn('文本框：人员A签发', md)

    def test_markdown_stats(self):
        import mdstats
        csv_path = self.run_root / 'Markdown统计.csv'
        self.assertTrue(csv_path.exists())
        self.assertTrue((self.run_root / 'Markdown统计.md').exists())
        policies = mdstats.collect(self.run_root / '脱敏文件')
        self.assertEqual(len(policies), 1)
        self.assertGreater(policies[0].tokens, 0)
        self.assertEqual(mdstats.estimate_tokens('一二三四'), 3)        # 4 ÷ 1.5 = 2.7 → 3
        self.assertEqual(mdstats.estimate_tokens(''), 0)
        self.assertEqual(mdstats.main(['--input', str(self.run_root)]), 0)

    def test_word_can_still_read_it(self):
        if not shutil.which('pandoc'):
            self.skipTest('pandoc 未安装')
        out = subprocess.run(['pandoc', '-f', 'docx', '-t', 'plain', str(self.result)],
                             capture_output=True, text=True, check=True).stdout
        self.assertIn('甲公司差旅费报销管理办法', out)


class MarkdownTest(unittest.TestCase):
    def md(self, body: str, numbering: str = '') -> str:
        import docx2md
        parts = {'word/document.xml': f'<w:document {W}><w:body>{body}</w:body></w:document>'.encode()}
        if numbering:
            parts['word/numbering.xml'] = f'<w:numbering {W}>{numbering}</w:numbering>'.encode()
        return docx2md.docx_to_markdown(parts)

    def test_numbering_levels_and_chinese_counting(self):
        numbering = ('<w:abstractNum w:abstractNumId="0">'
                     '<w:lvl w:ilvl="0"><w:numFmt w:val="chineseCounting"/><w:lvlText w:val="第%1条"/></w:lvl>'
                     '<w:lvl w:ilvl="1"><w:numFmt w:val="chineseCounting"/><w:lvlText w:val="（%2）"/>'
                     '<w:suff w:val="nothing"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>')

        def p(lvl, text):
            return (f'<w:p><w:pPr><w:numPr><w:ilvl w:val="{lvl}"/><w:numId w:val="1"/></w:numPr></w:pPr>'
                    f'<w:r><w:t>{text}</w:t></w:r></w:p>')
        body = ''.join(p(0, f'条{i}') for i in range(1, 11)) + p(1, '甲') + p(1, '乙') + p(0, '十一') + p(1, '丙')
        md = self.md(body, numbering)
        self.assertIn('**第十条** 条10', md)
        self.assertIn('（一）甲', md)
        self.assertIn('（二）乙', md)
        self.assertIn('**第十一条** 十一', md)
        self.assertIn('（一）丙', md)                 # 上级出现后下级重新编号

    def test_chapter_heading_merged_cells_and_compat_copy(self):
        body = ('<w:p><w:r><w:t>第一章 总则</w:t></w:r></w:p>'
                '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>标题</w:t></w:r></w:p></w:tc></w:tr>'
                '<w:tr><w:tc><w:p><w:r><w:t>a|b</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>c</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
                '<w:p><w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
                '<mc:Choice Requires="wps"><w:txbxContent><w:p><w:r><w:t>框内文字</w:t></w:r></w:p></w:txbxContent></mc:Choice>'
                '<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>框内文字</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback>'
                '</mc:AlternateContent></w:r></w:p>'
                '<w:p><w:r><w:t>1. 不是列表</w:t></w:r></w:p>')
        md = self.md(body)
        self.assertIn('## 第一章 总则', md)
        self.assertIn('| 标题 |  |\n|---|---|\n| a\\|b | c |', md)
        self.assertEqual(md.count('框内文字'), 1)     # 兼容副本不重复
        self.assertIn('\\1. 不是列表', md)

    def test_sections_and_table_of_contents_are_marked(self):
        import docx2md

        def p(text, style=None, anchor=None):
            ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ''
            run = f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r>'
            if anchor:
                run = f'<w:hyperlink w:anchor="{anchor}">{run}</w:hyperlink>'
            return f'<w:p>{ppr}{run}</w:p>'
        info = ('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>制度名称</w:t></w:r></w:p></w:tc>'
                '<w:tc><w:p><w:r><w:t>示例办法</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
        body = (p('示〔2025〕1号') + p('关于印发《示例办法》的通知') + p('各部门：现印发给你们。') + info
                + p('目录', ) + p('第一章 总则\t1', 'TOC1', '_Toc1') + p('第二章 附则 3', 'TOC1')
                + p('示例办法') + p('第一章 总则') + p('第一条 为规范管理，制定本办法。') + p('第二章 附则')
                + p('第二条 本办法自印发之日起施行。') + p('示例办公室  2025年1月9日印发'))
        styles = (f'<w:styles {W}><w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style></w:styles>')
        parts = {'word/document.xml': f'<w:document {W}><w:body>{body}</w:body></w:document>'.encode(),
                 'word/styles.xml': styles.encode()}
        md = docx2md.docx_to_markdown(parts)
        heads = [l for l in md.split('\n') if l.startswith('#')]
        self.assertEqual(heads, ['# 发文通知', '# 制度信息', '# 正文：示例办法',
                                 '## 第一章 总则', '## 第二章 附则', '# 版记'])
        self.assertNotIn('目录', md)                                # 目录整体去掉
        self.assertEqual(md.count('第一章 总则'), 1)                # 只剩正文里的那一处

    def test_manual_table_of_contents(self):
        import docx2md
        body = ''.join(f'<w:p><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>' for t in (
            '目　录', '第一章　总则……………1', '第二章　附则……………2', '示例办法', '第一章　总则', '第一条　为规范管理。'))
        md = docx2md.docx_to_markdown({'word/document.xml': f'<w:document {W}><w:body>{body}</w:body></w:document>'.encode()})
        self.assertNotIn('目', md)
        self.assertNotIn('……', md)
        self.assertEqual(md.count('第一章'), 1)
        self.assertIn('# 正文：示例办法', md)

    def test_attachment_tables_split_and_keep_their_own_label(self):
        import docx2md, package

        def p(text):
            return f'<w:p><w:r><w:t>{text}</w:t></w:r></w:p>'
        tbl = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>姓名</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>'
        body = (p('第一条 正文，填写《申报表》（附表1）。') + p('附表：1.示例内训师申报表') + p('附表1：') + p('示例内训师申报表') + tbl
                + p('附表 2：') + p('2.示例评价表') + tbl + '<w:sectPr/>')
        parts = {'word/document.xml': f'<w:document {W}><w:body>{body}</w:body></w:document>'.encode()}
        main, atts = docx2md.document_markdown(parts)
        self.assertEqual([a.label for a, _md in atts], ['附表1', '附表2'])
        self.assertNotIn('| 姓名 |', main)                      # 附表不再留在正文里
        self.assertTrue(atts[0][1].startswith('# 附表1：示例内训师申报表\n'))
        self.assertEqual(package.attachment_title('2.示例评价表'), '示例评价表')
        self.assertEqual(package.attachment_title('（三）示例清单'), '示例清单')

    def test_heading_style_articles_are_normalized(self):
        import package
        body = '## 第一章 总则\n\n### 第一条 目的\n\n为规范。\n\n**第二条** 范围\n\n全体员工。\n'
        text = package.normalize_articles(body)
        self.assertIn('**第一条** 目的', text)
        self.assertNotIn('### 第一条', text)
        self.assertEqual([e['article'] for e in package.article_index(text)], ['第一条', '第二条'])

    def test_attachments_split_from_body(self):
        import docx2md

        def p(text, page_break=False):
            br = '<w:r><w:br w:type="page"/></w:r>' if page_break else ''
            return f'<w:p>{br}<w:r><w:t>{text}</w:t></w:r></w:p>'
        tbl = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>申请人</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>'
        body = (p('第一条 正文。') + p('附件：1.审批表') + p('2.清单') + p('附件1', True) + p('审批表') + tbl
                + p('附件2', True) + p('清单') + tbl + p('备注：报办公室备案。') + '<w:p/><w:p/>'
                + p('某某办公室  2025年1月9日印发') + '<w:sectPr/>')
        parts = {'word/document.xml': f'<w:document {W}><w:body>{body}</w:body></w:document>'.encode()}
        main, atts = docx2md.document_markdown(parts)
        self.assertEqual([a.name for a, _md in atts], ['附件1-审批表', '附件2-清单'])
        self.assertIn('2.清单', main)                          # 「2.」后无空格，不是列表，不转义
        self.assertIn('2025年1月9日印发', main)                 # 版记归正文
        self.assertNotIn('| 申请人 |', main)
        self.assertIn('[附件1-审批表](附件1-审批表.md)', main)
        self.assertIn('| 申请人 |  |', atts[0][1])
        self.assertIn('备注：报办公室备案。', atts[1][1])       # 表后的备注属于附件
        self.assertNotIn('印发', atts[1][1])
        docx = docx2md.attachment_docx(parts, atts[1][0])
        with zipfile.ZipFile(__import__('io').BytesIO(docx)) as z:
            xml = z.read('word/document.xml').decode()
        self.assertIn('附件2', xml)
        self.assertIn('清单', xml)
        self.assertNotIn('审批表', xml)
        self.assertNotIn('正文', xml)
        self.assertIn('sectPr', xml)


class SuspectTest(unittest.TestCase):
    def test_generic_words_before_suffix_are_not_names(self):
        text = ('员工外出参加非集团组织的培训，严格按照集团规定，根据各子公司情况，本办法由集团解释，'
                '出差申请单报集团备案，已经M集团研究，K市M集团有限责任公司印发，合作单位南方未登记贸易有限公司。')
        found = redact.suspects_in(text, [])
        self.assertIn('M集团', found)
        self.assertIn('K市M集团有限责任公司', found)
        self.assertIn('南方未登记贸易有限公司', found)
        for noise in ('非集团', '按照集团', '各子公司', '由集团', '报集团', '集团', '子公司'):
            self.assertNotIn(noise, found)


class DataPartTest(unittest.TestCase):
    def test_chart_labels_and_compat_copies(self):
        red = redact.Redactor([redact.Term('公司', '华东示例物流有限公司', '甲公司')], [])
        res = redact.FileResult(source=Path('x.docx'))
        chart = redact._parse('<c:chartSpace xmlns:c="urn:c"><c:v>华东示例物流有限公司</c:v></c:chartSpace>'.encode())
        redact.redact_data_part(chart, red, 'word/charts/chart1.xml', res)
        self.assertIn('甲公司', redact._serialize(chart).decode())
        doc = redact._parse(
            f'<w:document {W} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body>'
            '<w:p><w:r><w:t>华东示例物流有限公司</w:t></w:r></w:p>'
            '<mc:AlternateContent><mc:Fallback><w:p><w:r><w:t>华东示例物流有限公司</w:t></w:r></w:p></mc:Fallback>'
            '</mc:AlternateContent></w:body></w:document>'.encode())
        redact.redact_paragraphs(doc, red, 'word/document.xml', res)
        self.assertNotIn('华东示例', redact._serialize(doc).decode())   # 副本也替换
        self.assertEqual(len(res.hits), 2)                              # 图表 1 处 + 正文 1 处，副本不计


class SpacedNameTest(unittest.TestCase):
    def test_scan_finds_names_after_role_words_even_when_spaced(self):
        import scan
        cases = {'签发人：张三丰': '张三丰', '签发人：张 三 丰': '张三丰', '签发人: 张  三': '张三',
                 '签发人：\u3000\u3000乜\u3000\u3000强': '乜强', '签发人：亓玉林\u3000\u3000 抄送：': '亓玉林',
                 '经办人：王 某 某（签字）': '王某某', '联系人：张三电话138': '张三',
                 '签发人:张  三': '张三', '签发人 : 张\u00a0\u00a0三': '张三', '签 发 人: 张  三': '张三',
                 '签发人: 张  三      2025年1月9日': '张三', '签发人: 张  三  抄 送：各部门': '张三'}
        for text, name in cases.items():
            self.assertEqual([n for n, _w in scan.person_names(text)], [name], text)
        for text in ('签发人：***', '签发人：见附件', '部门负责人审批'):
            self.assertEqual(scan.person_names(text), [], text)

    def test_redaction_ignores_layout_spaces_between_chinese_characters(self):
        red = redact.Redactor([redact.Term('人名', '张三丰', '人员A'), redact.Term('集团', 'K市M集团', '甲集团')], [])
        self.assertEqual(red.redact_string('签发人：张 三 丰')[0], '签发人：人员A')
        self.assertEqual(red.redact_string('签发人：张\u3000\u3000三\u3000\u3000丰。')[0], '签发人：人员A。')
        self.assertEqual(red.redact_string('K 市 M 集团')[0], '甲集团')
        self.assertEqual([t.original for t in red.leaked_terms('落款：张 三 丰')], ['张三丰'])
        self.assertEqual(red.redact_string('张三 丰收')[1][0].term, '张三丰')   # 命中记到词典原文上


class RobustnessTest(unittest.TestCase):
    def test_bad_file_does_not_stop_the_batch_and_doc_is_listed(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            src = tmp / '原件'
            src.mkdir()
            make_docx(src / '好文件.docx')
            (src / '坏文件.docx').write_bytes(b'not a zip')
            (src / '旧格式.doc').write_bytes(b'\xd0\xcf\x11\xe0 old word')
            out = tmp / '结果'
            code = redact.main(['--input', str(src), '--dict', str(HERE.parent / '词典示例.csv'), '--output', str(out)])
            self.assertEqual(code, 1)                                # 坏文件要处理
            run = next(out.iterdir())
            self.assertEqual([p.name for p in (run / '脱敏文件').glob('*.docx')], ['好文件.docx'])
            report = (run / '内部留存-勿外发' / '报告.md').read_text(encoding='utf-8')
            self.assertIn('不是有效的 .docx', report)
            self.assertIn('旧格式.doc', report)
            self.assertIn('./run.sh convert', report)
        finally:
            shutil.rmtree(tmp)


class ConvertTest(unittest.TestCase):
    def test_convert_in_place_next_to_the_old_file(self):
        import convert
        tmp = Path(tempfile.mkdtemp())
        try:
            src = tmp / '原件'
            (src / '子目录').mkdir(parents=True)
            make_docx(src / '已是docx.docx')
            make_docx(src / '子目录' / '扩展名写错.doc')          # 其实是 .docx：只更正扩展名，不需要转换工具
            make_docx(src / '人工另存过.doc')
            (src / '人工另存过.docx').write_bytes(b'manual version')  # 同名 .docx 已存在：不覆盖
            (src / '说明.pdf').write_bytes(b'%PDF')
            self.assertEqual(convert.main(['--input', str(src)]), 0)
            self.assertTrue((src / '子目录' / '扩展名写错.docx').exists())
            self.assertTrue((src / '子目录' / '扩展名写错.doc').exists())       # 旧文件保留
            self.assertEqual((src / '人工另存过.docx').read_bytes(), b'manual version')
            report = next(tmp.glob('原件-转换报告-*.md')).read_text(encoding='utf-8')
            self.assertIn('扩展名写错.doc（扩展名更正）', report)
            self.assertIn('人工另存过.doc', report)
            self.assertIn('说明.pdf', report)
            # 脱敏：.doc 旁边已有同名 .docx 的，不算跳过；只处理 .docx
            out = tmp / '结果'
            redact.main(['--input', str(src), '--dict', str(HERE.parent / '词典示例.csv'), '--output', str(out)])
            run = next(out.iterdir())
            report = (run / '内部留存-勿外发' / '报告.md').read_text(encoding='utf-8')
            self.assertNotIn('扩展名写错.doc\n', report.split('## 跳过的文件')[-1] if '## 跳过的文件' in report else '')
            self.assertIn('说明.pdf', report)
            self.assertTrue((run / '脱敏文件' / '子目录' / '扩展名写错.docx').exists())
            # --output 不能放在原件目录里
            with self.assertRaises(SystemExit):
                convert.main(['--input', str(src), '--output', str(src / 'x')])
        finally:
            shutil.rmtree(tmp)

    def test_convert_to_another_folder_copies_docx(self):
        import convert
        tmp = Path(tempfile.mkdtemp())
        try:
            src = tmp / '原件'
            src.mkdir()
            make_docx(src / 'a.docx')
            make_docx(src / 'b.doc')
            out = tmp / '原件-docx'
            self.assertEqual(convert.main(['--input', str(src), '--output', str(out)]), 0)
            self.assertEqual(sorted(p.name for p in out.iterdir()), ['a.docx', 'b.docx'])
            self.assertFalse((src / 'b.docx').exists())
        finally:
            shutil.rmtree(tmp)


class ScanTest(unittest.TestCase):
    def test_short_forms_share_the_full_names_code_whatever_the_order(self):
        import scan
        sc = scan.Scan([])
        # 简称先出现、中间写法再出现、全称最后才出现：仍是一组
        for para in ('经M集团研究决定。', '由K市M集团负责。', '本办法适用于华东示例集团。',
                     'K市M集团有限责任公司  2025年1月9日印发', '华东示例集团有限公司文件'):
            sc.scan_paragraph('a.docx', para)
        rows = {c.text: c for c in sc.finish()}
        self.assertEqual({rows[t].replacement for t in ('M集团', 'K市M集团', 'K市M集团有限责任公司')},
                         {rows['K市M集团有限责任公司'].replacement})
        self.assertEqual(rows['M集团'].group, 'K市M集团有限责任公司')
        self.assertEqual(rows['华东示例集团'].replacement, rows['华东示例集团有限公司'].replacement)
        self.assertNotIn('于华东示例集团', rows)

    def test_plain_group_name_is_active_and_properties_are_read(self):
        import scan
        sc = scan.Scan([])
        sc.scan_paragraph('a.docx', '关于印发《青松集团接待管理规定》的通知')
        sc.scan_paragraph('a.docx', '村集团办公室文件')
        rows = {c.text: c for c in sc.finish()}
        self.assertEqual(rows['青松集团'].confidence, '中')        # 默认启用
        self.assertEqual(rows['村集团'].confidence, '低')          # 单字前缀，多半是误切

    def test_scan_proposes_a_usable_dictionary(self):
        import scan
        tmp = Path(tempfile.mkdtemp())
        try:
            src = tmp / '原件'
            src.mkdir()
            cells = ('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>经办人</w:t></w:r></w:p></w:tc>'
                     '<w:tc><w:p><w:r><w:t xml:space="preserve">赵 六</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
            body = cells + ''.join(f'<w:p><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>' for t in (
                '关于印发《M集团差旅费管理办法》的通知', 'HDB字﹝2025﹞3号',
                '各下属企业：经M集团研究，切实加强集团管理，请结合集团实际执行。',
                '制度编码：华集-XZ-GL-03-07-01', '一类地区指北京、上海；三类地区指J省内城市（不含P市）。',
                '参照K市财办﹝2021﹞36号执行，联系人：张建国，电话 13812345678。', '签发人：亓 玉 林',
                '由王小明总经理签发，提高总经理办公会效率。', '办公地址：K市示例区建设路18号3楼。',
                '审批请登录华示OA系统，详见 https://oa.cgroup-demo.com/x 。',
                'K市M集团有限责任公司综合办公室  2025年1月9日印发'))
            doc = f'<w:document {W}><w:body>{body}</w:body></w:document>'
            parts = dict(PARTS, **{'word/document.xml': doc, 'word/comments.xml': COMMENTS})
            with zipfile.ZipFile(src / 'M集团差旅费管理办法.docx', 'w') as z:
                for name, text in parts.items():
                    z.writestr(name, text)
            out = tmp / '结果'
            self.assertEqual(scan.main(['--input', str(src), '--output', str(out)]), 0)
            run = next(out.iterdir())
            self.assertTrue(run.name.endswith('-扫描'))
            with (run / '候选词典.csv').open(encoding='utf-8-sig') as f:
                rows = {r['原文']: r for r in csv.DictReader(f) if r['原文']}
            active = {k for k, r in rows.items() if not r['类别'].startswith('#')}
            # 全称、简称同组同替换值
            for name in ('K市M集团有限责任公司', 'K市M集团', 'M集团'):
                self.assertIn(name, active)
            self.assertEqual({rows[n]['替换为'] for n in ('K市M集团有限责任公司', 'K市M集团', 'M集团')}, {rows['M集团']['替换为']})
            for name in ('K市', 'J省', 'P市', 'HDB字', '亓玉林', '赵六', '华集-XZ-GL-03-07-01', '张建国', '王小明', '王某某', 'cgroup-demo.com'):
                self.assertIn(name, active, name)
            self.assertTrue(any('建设路18号' in k for k in active))
            self.assertIn('华东示例控股集团有限公司', active)      # Word 属性里的单位
            self.assertIn('北京', rows)
            self.assertNotIn('北京', active)                       # 常见省市名默认不启用
            for noise in ('切实加强集团', '结合集团', '一类地区', '三类地区', '提高', '高总', '财办', '13812345678'):
                self.assertFalse(any(noise == k for k in active), noise)
            self.assertEqual(scan.main(['--input', str(src), '--output', str(out)]), 0)   # 同一小时再扫一次
            self.assertTrue(any(d.name.endswith('-扫描-2') for d in out.iterdir()))
            # 候选词典可以直接给脱敏用
            terms = redact.load_dictionary(run / '候选词典.csv')
            self.assertTrue(terms)
        finally:
            shutil.rmtree(tmp)


NS_EXTRA = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" '
            'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"')
IMAGE_P = '<w:p><w:r><w:drawing><a:graphic><a:graphicData><a:blip r:embed="rId9"/></a:graphicData></a:graphic></w:drawing></w:r></w:p>'
CHART_P = '<w:p><w:r><w:drawing><a:graphic><a:graphicData><c:chart r:id="rId8"/></a:graphicData></a:graphic></w:drawing></w:r></w:p>'
MATH_P = '<w:p><m:oMath><m:r><m:t>A=B×C</m:t></m:r></m:oMath></w:p>'


def _policy_docx(path: Path, fee: str = '100', with_images: bool = False) -> None:
    """合成的一份制度：发文通知、制度信息表、两章、缺第三条、一个表单附件、版记。名称全部虚构。"""
    def p(t, brk=False):
        ppr = '<w:pPr><w:pageBreakBefore/></w:pPr>' if brk else ''
        return f'<w:p>{ppr}<w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>'

    def tbl(rows):
        return '<w:tbl>' + ''.join('<w:tr>' + ''.join(f'<w:tc>{p(c)}</w:tc>' for c in r) + '</w:tr>' for r in rows) + '</w:tbl>'
    body = (p('华东示例集团文件') + p('华示字〔2025〕7号　签发人：王某某') + p('关于印发《差旅示例办法》的通知')
            + p('各部门：现印发给你们。') + p('华东示例集团综合办公室') + p('2025年3月1日')
            + tbl([['制度名称', '差旅示例办法', '制度层级', '三级'], ['制度编码', 'HD-CW-001', '生效日期', '2025年3月1日'],
                   ['责任部门', '财务部', '制度类别', '财务类'], ['审议主体', '总经理办公会', '决议主体', '董事会'],
                   ['协同部门', '人力资源部', '关联制度 / 文件', '《费用示例规定》、《考勤示例制度》']])
            + p('差旅示例办法') + p('第一章　总则') + p('第一条　为规范差旅，制定本办法。') + p('第二条　适用于全体员工。')
            + p('第二章　标准') + p(f'第四条　伙食补助每人每天{fee}元。') + p('第五条　本办法自2025年3月1日起施行。')
            + (IMAGE_P + CHART_P + MATH_P if with_images else '')
            + p('附件：出差申请单') + p('附件1', True) + p('出差申请单') + tbl([['出差人', '', '部门', ''], ['事由', '', '审批', '']])
            + (p('附件2', True) + p('审批流程图') + IMAGE_P if with_images else '')
            + p('华东示例集团综合办公室　2025年3月1日印发'))
    parts = dict(PARTS)
    parts['word/document.xml'] = f'<w:document {W} {NS_EXTRA}><w:body>{body}<w:sectPr/></w:body></w:document>'
    parts.pop('word/comments.xml')
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w') as z:
        for name, text in parts.items():
            z.writestr(name, text)


class PackageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = self.tmp / '原件'
        _policy_docx(self.src / '财务' / '差旅示例办法.docx')
        self.dict = self.tmp / '词典.csv'
        self.dict.write_text('类别,原文,替换为,备注\n集团,华东示例控股集团有限公司,本集团,\n集团,华东示例集团,本集团,\n'
                             '公司,华东示例物流有限公司,,\n人名,王某某,,\n', encoding='utf-8')

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def redact_and_pack(self, *extra):
        import package
        out = self.tmp / '结果'
        redact.main(['--input', str(self.src), '--dict', str(self.dict), '--output', str(out)])
        self.run_dir = sorted(out.iterdir())[-1]
        self.assertTrue((self.run_dir / '内部留存-勿外发' / '文件清单.json').exists())
        package.main(['--run', str(self.run_dir), '--output', str(self.tmp / '导入包'), *extra])
        return sorted((self.tmp / '导入包').iterdir())[-1]

    def test_package_builds_manifest_sheet_and_report(self):
        import json
        pkg = self.redact_and_pack()
        folder = pkg / '财务' / '差旅示例办法'
        m = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(m['meta']['policy_no'], 'HD-CW-001')
        self.assertEqual(m['meta']['effective_date'], '2025-03-01')
        # 文号进 doc_no（系统里的「文号」字段），不再当版本号
        self.assertEqual(m['meta']['doc_no'], '华示字〔2025〕7号')
        self.assertNotIn('version_no', m['meta'])
        self.assertEqual((m['meta']['policy_level'], m['meta']['review_body'], m['meta']['decision_body'],
                          m['meta']['co_departments'], m['meta']['related_documents']),
                         ('三级', '总经理办公会', '董事会', '人力资源部', '《费用示例规定》、《考勤示例制度》'))
        body, att = m['documents']
        self.assertFalse(body['has_images'])
        self.assertFalse(att['has_images'])
        text = (folder / '正文.md').read_text(encoding='utf-8')
        self.assertNotIn('华东示例集团', text)
        self.assertNotIn('# 附件（已拆分', text)
        self.assertEqual([e['article'] for e in body['article_index']], ['第一条', '第二条', '第四条', '第五条'])
        first, last = body['article_index'][0], body['article_index'][-1]
        self.assertTrue(text[first['redacted'][0]:].startswith('**第一条**'))
        self.assertEqual(text[last['redacted'][0]:last['redacted'][1]], '**第五条** 本办法自2025年3月1日起施行。')
        self.assertEqual(first['chapter'], '第一章　总则')
        self.assertEqual(body['text_chars'], len(text))
        self.assertEqual(body['text_tokens'], -(-len(text) * 2 // 3))
        # 默认：正文、附件都不传文件，只进脱敏 Markdown（哈希按 Markdown 算）；导入包里没有 docx
        self.assertIsNone(body['file'])
        self.assertIsNone(att['file'])
        self.assertEqual(list(folder.glob('*.docx')), [])
        self.assertEqual(body['content_hash'], hashlib.sha256(text.encode('utf-8')).hexdigest())
        att_md = (folder / '附件1.md').read_text(encoding='utf-8')
        self.assertEqual(att['content_hash'], hashlib.sha256(att_md.encode('utf-8')).hexdigest())
        self.assertNotIn('attachment_class', att)               # 系统里不再分附件类别
        self.assertTrue(att['has_text'])
        self.assertEqual(att['title'], '出差申请单')            # 附件自己的名称，不拼制度名
        self.assertEqual(att['label'], '附件1')
        for f in pkg.rglob('*.docx'):
            self.assertNotIn('华东示例', docx_text(f), f)
        sheet = (pkg / '批次清单.csv').read_text(encoding='utf-8-sig')
        self.assertIn('缺条：第3条', sheet)
        with (pkg / '批次清单.csv').open(encoding='utf-8-sig') as f:
            [row] = list(csv.DictReader(f))
        self.assertNotIn('版本号', row)
        self.assertEqual((row['文号'], row['制度层级'], row['协同部门'], row['审议主体'], row['决议主体'], row['关联制度/文件']),
                         ('华示字〔2025〕7号', '三级', '人力资源部', '总经理办公会', '董事会', '《费用示例规定》、《考勤示例制度》'))
        # 同一份原件再打包一次，附件原件的哈希不变（导入去重靠它）
        pkg2 = self.redact_and_pack()
        m2 = json.loads((pkg2 / '财务' / '差旅示例办法' / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual([d['content_hash'] for d in m2['documents']], [d['content_hash'] for d in m['documents']])

    def test_package_attachments_mode_uploads_attachment_docx_only(self):
        import json
        pkg = self.redact_and_pack('--files', 'attachments')
        folder = pkg / '财务' / '差旅示例办法'
        body, att = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))['documents']
        self.assertIsNone(body['file'])
        self.assertEqual(att['file'], '附件1.docx')
        self.assertEqual(att['content_hash'], hashlib.sha256((folder / '附件1.docx').read_bytes()).hexdigest())

    def test_images_charts_and_formulas_are_marked_and_reported(self):
        import json
        _policy_docx(self.src / '财务' / '差旅示例办法.docx', with_images=True)
        pkg = self.redact_and_pack()
        folder = pkg / '财务' / '差旅示例办法'
        text = (folder / '正文.md').read_text(encoding='utf-8')
        for mark in ('（图片）', '（图表）', '（公式）'):
            self.assertIn(mark, text)
        self.assertNotIn('A=B', text)   # 公式里的文字没有经过脱敏，不输出
        docs = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))['documents']
        self.assertEqual([d['sort_no'] for d in docs], [0, 1])   # 只有图片的附件2 不导入
        self.assertEqual([d['has_images'] for d in docs], [True, False])   # 正文含图片，附件1 不含
        # 附件也传文件时，只有图片的附件2 以文件导入：没有文字，含图片
        pkg_files = self.redact_and_pack('--files', 'attachments')
        docs = json.loads((pkg_files / '财务' / '差旅示例办法' / 'manifest.json').read_text(encoding='utf-8'))['documents']
        self.assertEqual([(d['sort_no'], d['has_text'], d['has_images'], d['md']) for d in docs[1:]],
                         [(1, True, False, '附件1.md'), (2, False, True, None)])
        sheet = (pkg / '批次清单.csv').read_text(encoding='utf-8-sig')
        self.assertIn('含图片 2 处、图表 1 处、公式 1 处', sheet)
        self.assertIn('附件2 只有图片', sheet)
        report = (pkg / '检查报告.md').read_text(encoding='utf-8')
        self.assertIn('## 含图片等非文字内容', report)

    def test_package_can_upload_redacted_body_docx(self):
        import json
        pkg = self.redact_and_pack('--files', 'redacted')
        folder = pkg / '财务' / '差旅示例办法'
        body = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))['documents'][0]
        red_docx = self.run_dir / '脱敏文件' / '财务' / '差旅示例办法.docx'
        self.assertEqual(body['file'], '正文.docx')
        self.assertEqual(body['content_hash'], hashlib.sha256(red_docx.read_bytes()).hexdigest())
        self.assertEqual((folder / '正文.docx').read_bytes(), red_docx.read_bytes())

    def test_package_can_upload_originals(self):
        import json
        pkg = self.redact_and_pack('--originals', str(self.src), '--files', 'original')
        folder = pkg / '财务' / '差旅示例办法'
        m = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        src = self.src / '财务' / '差旅示例办法.docx'
        self.assertEqual(m['documents'][0]['content_hash'], hashlib.sha256(src.read_bytes()).hexdigest())
        self.assertIn('华东示例', docx_text(folder / '附件1.docx') + docx_text(folder / '正文.docx'))

    def fake_api(self):
        import importer

        class FakeApi(importer.Api):
            def __init__(self):
                self.base, self.rows, self.files, self.n = 'http://test', {}, {}, 0

            def _id(self):
                self.n += 1
                return f'id{self.n}'

            def find(self, obj, where, select=None):
                return [dict(r) for r in self.rows.get(obj, []) if all(r.get(k) == v for k, v in where.items())]

            def create(self, obj, row):
                row = {**row, 'id': self._id()}
                self.rows.setdefault(obj, []).append(row)
                return row

            def update(self, obj, rid, row):
                for r in self.rows[obj]:
                    if r['id'] == rid:
                        r.update(row)

            def delete(self, obj, rid):
                self.rows[obj] = [r for r in self.rows[obj] if r['id'] != rid]

            def upload(self, data, filename, mime=importer.DOCX_MIME):
                fid = self._id()
                self.files[fid] = data
                return fid

            def category_options(self):
                return [('finance', '财务')]

        return FakeApi()

    def test_import_writes_body_and_info_table_onto_the_policy_and_attachments_under_it(self):
        import importer
        pkg = self.redact_and_pack()
        api = self.fake_api()
        row = importer.read_sheet(pkg)[0]
        rp = importer.plan_row(api, pkg, row, api.category_options())
        self.assertIsNone(rp.rejected)
        importer.apply_row(api, rp)
        # 没有版本：正文、制度信息表都写在制度上，附件挂在制度下（brightrule#45）
        self.assertEqual(set(api.rows), {'brightrule_policy', 'brightrule_policy_attachment'})
        [policy] = api.rows['brightrule_policy']
        self.assertIn('**第一条**', policy['body_md'])
        self.assertEqual([e['article'] for e in policy['article_index']], ['第一条', '第二条', '第四条', '第五条'])
        self.assertEqual(policy['status'], 'draft')
        self.assertEqual(policy['doc_no'], '华示字〔2025〕7号')        # 文号进「文号」，不进版本号
        self.assertNotIn('version_no', policy)
        self.assertEqual((policy['policy_level'], policy['co_departments'], policy['review_body'], policy['decision_body'],
                          policy['related_documents'], policy['effective_date'], policy['category']),
                         ('三级', '人力资源部', '总经理办公会', '董事会', '《费用示例规定》、《考勤示例制度》', '2025-03-01', 'finance'))
        self.assertFalse(policy['has_images'])
        self.assertNotIn('images_need_review', policy)                 # 人工勾选的，导入不碰
        [att] = api.rows['brightrule_policy_attachment']
        self.assertEqual((att['label'], att['title'], att['sort_no'], att['policy']), ('附件1', '出差申请单', 1, policy['id']))
        for gone in ('policy_version', 'attachment_class', 'is_current'):
            self.assertNotIn(gone, att)
        self.assertNotIn('original_file', policy)          # 默认只进 Markdown，不传文件
        self.assertNotIn('original_file', att)
        self.assertEqual(api.files, {})
        # 再来一次：无事可做
        self.assertEqual(importer.plan_row(api, pkg, row, []).steps, [])
        # Markdown 里有图片语法：拒绝整行
        md_path = pkg / row['包内目录'] / '正文.md'
        saved = md_path.read_text(encoding='utf-8')
        md_path.write_text(saved + '\n![流程](data:image/png;base64,AAAA)\n', encoding='utf-8')
        self.assertIn('图片', importer.plan_row(api, pkg, row, []).rejected)
        md_path.write_text(saved, encoding='utf-8')
        # 早先正文也传了文件：换成默认打包后再导入，去掉正文文件；已发布的也可以
        policy['original_file'], policy['content_hash'], policy['status'] = 'old-file', 'old-hash', 'published'
        rp = importer.plan_row(api, pkg, row, [])
        self.assertIsNone(rp.rejected)
        self.assertIn('去掉文件', ' '.join(rp.actions))
        self.assertFalse(any('覆盖' in n for n in rp.notes))   # 正文没变
        importer.apply_row(api, rp)
        self.assertIsNone(policy['original_file'])
        self.assertEqual(importer.plan_row(api, pkg, row, []).steps, [])
        # 修订：已发布的制度正文变了，直接覆盖（不保留旧正文），提示一句
        _policy_docx(self.src / '财务' / '差旅示例办法.docx', fee='120', with_images=True)
        pkg2 = self.redact_and_pack()
        rp = importer.plan_row(api, pkg2, importer.read_sheet(pkg2)[0], [])
        self.assertIsNone(rp.rejected)
        self.assertTrue(any('覆盖' in n for n in rp.notes))
        importer.apply_row(api, rp)
        self.assertEqual(len(api.rows['brightrule_policy']), 1)
        self.assertIn('120元', policy['body_md'])
        self.assertTrue(policy['has_images'])                 # 含图片：按正文里的「（图片）」等标记
        self.assertEqual(policy['status'], 'published')
        # 没有制度编号、没有生效日期：照样导入，按名称对应，重复导入不变
        row3 = dict(importer.read_sheet(pkg)[0], 制度编号='', 生效日期='', 制度名称='无编号示例办法')
        rp = importer.plan_row(api, pkg, row3, [])
        self.assertIsNone(rp.rejected)
        self.assertIn('新建制度（草稿，含正文）', rp.actions)
        importer.apply_row(api, rp)
        made = [r for r in api.rows['brightrule_policy'] if r['title'] == '无编号示例办法']
        self.assertEqual(len(made), 1)
        self.assertNotIn('policy_no', made[0])
        self.assertNotIn('effective_date', made[0])
        self.assertEqual([a['policy'] for a in api.rows['brightrule_policy_attachment']], [policy['id'], made[0]['id']])
        self.assertEqual(importer.plan_row(api, pkg, row3, []).steps, [])
        # 页面上补了编号和生效日期后再导入：仍对应同一份，补的不被清空
        made[0].update(policy_no='HD-XZ-009', effective_date='2025-03-01')
        rp = importer.plan_row(api, pkg, row3, [])
        self.assertEqual(rp.steps, [])
        self.assertEqual(made[0]['policy_no'], 'HD-XZ-009')
        # 缺名称仍然拒绝；文号可以没有
        self.assertIn('制度名称', importer.plan_row(api, pkg, dict(row3, 制度名称=''), []).rejected)
        self.assertIsNone(importer.plan_row(api, pkg, dict(row3, 文号=''), []).rejected)

    def test_import_links_related_policies_only_on_an_exact_name(self):
        import importer
        pkg = self.redact_and_pack()
        api = self.fake_api()
        other = api.create('brightrule_policy', {'title': '考勤示例制度', 'status': 'published'})
        api.create('brightrule_policy', {'title': '费用示例规定（试行）', 'status': 'published'})   # 名称不完全一致：不关联
        row = importer.read_sheet(pkg)[0]
        rp = importer.plan_row(api, pkg, row, [])
        self.assertEqual(importer.link_related(api, [rp], apply=False), 1)   # 预演：新建的制度写入后才关联
        importer.apply_row(api, rp)
        self.assertEqual(importer.link_related(api, [rp], apply=True), 1)
        policy = next(r for r in api.rows['brightrule_policy'] if r['title'] == '差旅示例办法')
        self.assertEqual(policy['related_policies'], [other['id']])
        self.assertEqual(policy['related_documents'], '《费用示例规定》、《考勤示例制度》')   # 原文照录，含库外的
        self.assertEqual(importer.link_related(api, [rp], apply=True), 0)   # 再来一次：不变
        self.assertEqual(importer.related_titles('《甲办法》、《乙规定》；《甲办法》'), ['甲办法', '乙规定'])
        self.assertEqual(importer.related_titles('甲办法、乙规定\n丙细则'), ['甲办法', '乙规定', '丙细则'])
        self.assertEqual(importer.related_titles('无'), [])
        self.assertEqual(importer.ref_ids([{'id': 'a'}, 'b']), ['a', 'b'])
        self.assertEqual(importer.ref_ids(None), [])

    def test_publish_and_remove_work_on_the_policy(self):
        import importer, publish, remove
        pkg = self.redact_and_pack()
        api = self.fake_api()
        row = importer.read_sheet(pkg)[0]
        importer.apply_row(api, importer.plan_row(api, pkg, row, []))
        [policy] = api.rows['brightrule_policy']
        mark, note, pid = publish.plan(api, pkg, row)
        self.assertEqual((mark, pid), ('✓', policy['id']))
        self.assertIn('草稿 → 已发布', note)
        api.update('brightrule_policy', pid, {'status': 'published'})
        self.assertEqual(publish.plan(api, pkg, row)[0], '·')
        policy['status'] = 'abolished'
        self.assertEqual(publish.plan(api, pkg, row)[:2], ('·', '已废止，不动'))
        policy.update(status='draft', text_chars=0)
        self.assertEqual(publish.plan(api, pkg, row)[0], '✗')        # 没有正文：导入没做完
        api.create('brightrule_clause', {'policy': policy['id'], 'title': 't'})
        steps = remove.plan(api, policy)
        self.assertEqual([s[0] for s in steps], ['brightrule_clause', 'brightrule_policy'])   # 附件随制度删除

    def _fake_system(self):
        """内存里的假系统：import / remove 的 main() 都连它。"""
        import importer, remove

        class Fake:
            mode = 'session'

            def __init__(self):
                self.rows, self.n = {}, 0

            def find(self, obj, where, select=None):
                return [dict(r) for r in self.rows.get(obj, []) if all(r.get(k) == v for k, v in where.items())]

            def create(self, obj, row):
                self.n += 1
                row = {**row, 'id': f'id{self.n}'}
                self.rows.setdefault(obj, []).append(row)
                return row

            def update(self, obj, rid, row):
                for r in self.rows.get(obj, []):
                    if r['id'] == rid:
                        r.update(row)

            def delete(self, obj, rid):
                self.rows[obj] = [r for r in self.rows.get(obj, []) if r['id'] != rid]
                if obj == 'brightrule_policy':   # 制度附件随制度级联删除
                    self.rows['brightrule_policy_attachment'] = [
                        r for r in self.rows.get('brightrule_policy_attachment', []) if r.get('policy') != rid]

            def upload(self, *a, **k):
                return 'file'

            def category_options(self):
                return []

        fake = Fake()
        self._saved = (importer.Api, remove.Api)
        importer.Api = remove.Api = lambda *a, **k: fake
        self.addCleanup(lambda: setattr(importer, 'Api', self._saved[0]) or setattr(remove, 'Api', self._saved[1]))
        return fake

    def test_import_records_ids_and_remove_uses_them(self):
        import json, importer, remove
        pkg = self.redact_and_pack()
        fake = self._fake_system()
        url = 'http://test/'
        importer.main(['--package', str(pkg), '--url', url, '--apply'])
        rec = json.loads((pkg / importer.RECORD_FILE).read_text(encoding='utf-8'))['http://test']
        (entry,) = rec.values()
        self.assertTrue(entry['created_policy'])
        self.assertEqual(entry['policy_id'], fake.rows['brightrule_policy'][0]['id'])
        self.assertFalse({'version_id', 'created_version', 'version_no'} & set(entry))   # 没有版本（#45）
        self.assertTrue(fake.rows.get('brightrule_policy_attachment'))
        fake.create('brightrule_clause', {'policy': entry['policy_id'], 'title': 't'})
        # 重跑：无变化，记录不变（仍是这个包新建的）
        importer.main(['--package', str(pkg), '--url', url, '--apply'])
        self.assertEqual(json.loads((pkg / importer.RECORD_FILE).read_text(encoding='utf-8'))['http://test'], rec)
        # remove 按记录直接删：条款、制度、附件全没了，记录清空
        remove.main(['--url', url, '--package', str(pkg), '--apply'])
        self.assertEqual(fake.rows['brightrule_policy'], [])
        self.assertEqual(fake.rows['brightrule_clause'], [])
        self.assertEqual(fake.rows.get('brightrule_policy_attachment', []), [])
        self.assertNotIn('http://test', json.loads((pkg / importer.RECORD_FILE).read_text(encoding='utf-8')))

    def test_remove_skips_a_recorded_policy_that_is_already_gone(self):
        import importer, remove
        pkg = self.redact_and_pack()
        fake = self._fake_system()
        importer.main(['--package', str(pkg), '--url', 'http://test', '--apply'])
        (entry,) = importer.load_record(pkg, 'http://test').values()
        fake.delete('brightrule_policy', entry['policy_id'])              # 已经在页面上删掉了
        self.assertEqual(remove.main(['--url', 'http://test', '--package', str(pkg), '--apply']), 0)
        self.assertEqual(importer.load_record(pkg, 'http://test'), {})   # 从记录里去掉

    def test_remove_keeps_an_existing_policy_the_package_only_updated(self):
        import importer, remove
        pkg = self.redact_and_pack()
        fake = self._fake_system()
        row = importer.read_sheet(pkg)[0]
        old = fake.create('brightrule_policy', {'title': row['制度名称'], 'policy_no': row['制度编号'], 'status': 'published'})
        importer.main(['--package', str(pkg), '--url', 'http://test', '--apply'])
        entry = importer.load_record(pkg, 'http://test')[row['包内目录']]
        self.assertEqual(entry['policy_id'], old['id'])
        self.assertFalse(entry['created_policy'])                       # 原来就有：这个包只覆盖了正文
        self.assertTrue(fake.rows['brightrule_policy'][0].get('body_md'))
        remove.main(['--url', 'http://test', '--package', str(pkg), '--apply'])
        self.assertEqual([p['id'] for p in fake.rows['brightrule_policy']], [old['id']])   # 原有制度不删
        self.assertEqual(importer.load_record(pkg, 'http://test'), {})

    def test_meta_scans_info_tables_into_excel(self):
        import meta
        from openpyxl import load_workbook
        # 第二份：信息表用「归口部门」、多一个「废止日期」，编码与第一份重复；第三份没有信息表
        _policy_docx(self.src / '财务' / '差旅示例办法.docx')
        doc2 = self.src / '行政' / '会议示例规定.docx'
        _policy_docx(doc2)
        with zipfile.ZipFile(doc2) as z:
            parts = {n: z.read(n) for n in z.namelist()}
        xml = parts['word/document.xml'].decode()
        xml = xml.replace('责任部门', '归口部门').replace('制度类别', '废止日期', 1).replace('财务类', '/')
        with zipfile.ZipFile(doc2, 'w') as z:
            for n, b in parts.items():
                z.writestr(n, xml if n == 'word/document.xml' else b)
        (self.src / '旧.doc').write_bytes(b'x')
        out = self.tmp / '元数据.xlsx'
        meta.main(['--input', str(self.src), '--output', str(out)])
        wb = load_workbook(out)
        rows = list(wb['元数据'].iter_rows(values_only=True))
        head, data = rows[0], {r[0]: dict(zip(rows[0], r)) for r in rows[1:]}
        first = data[str(Path('财务') / '差旅示例办法.docx')]
        self.assertEqual(first['制度编码'], 'HD-CW-001')
        self.assertEqual(first['生效日期'], '2025-03-01')
        self.assertEqual(first['生效日期（原文）'], '2025年3月1日')
        self.assertEqual(first['责任部门'], '财务部')
        self.assertEqual(first['附件数'], '1')
        second = data[str(Path('行政') / '会议示例规定.docx')]
        self.assertEqual(second['责任部门'], '财务部')          # 「归口部门」归入常用列
        self.assertIn('废止日期', head)                        # 其他字段自动加列
        self.assertIn(second['制度类别'], (None, ''))          # 找不到 / 写「/」的空着
        problems = [r for r in wb['问题'].iter_rows(values_only=True)][1:]
        text = ' '.join(f'{a} {b}' for a, b in problems)
        self.assertIn('写法不同：「归口部门」', text)
        self.assertIn('制度编码「HD-CW-001」重复', text)
        self.assertIn('旧格式', text)
        self.assertNotIn('缺', text)                          # 找不到的字段不算问题
        stats = {r[0]: r[1] for r in list(wb['字段统计'].iter_rows(values_only=True))[1:]}
        self.assertEqual(stats['制度编码'], 2)

    def test_scanned_pdf_is_ocrd_redacted_and_flagged(self):
        import json, package, pdf_ocr
        from pdf_ocr import Line
        (self.src / '扫描').mkdir()
        (self.src / '扫描' / '华东示例集团收费标准.pdf').write_bytes(b'%PDF-1.4 fake')
        pages = [[Line('华东示例集团收费标准', 0.1, 0.5), Line('第一章 总则', 0.1, 0.3),
                  Line('第一条 为规范华东示例集团业务收费，根据有关规定，结合', 0.1, 0.9), Line('实际，制定本标准。', 0.1, 0.4),
                  Line('- 1 -', 0.45, 0.55)],
                 [Line('第二条 本标准自2025年5月26日起施行。', 0.1, 0.6)]]
        saved = (pdf_ocr.unavailable_reason, pdf_ocr.ocr_pdf)
        pdf_ocr.unavailable_reason, pdf_ocr.ocr_pdf = (lambda: None), (lambda path: pages)
        self.addCleanup(lambda: (setattr(pdf_ocr, 'unavailable_reason', saved[0]), setattr(pdf_ocr, 'ocr_pdf', saved[1])))
        pkg = self.redact_and_pack()
        docs = self.run_dir / '脱敏文件' / '扫描'
        mds = list(docs.glob('*.md'))
        self.assertEqual(len(mds), 1)
        self.assertEqual(list(docs.glob('*.pdf')) + list(docs.glob('*.docx')), [])   # 只输出 .md
        md = mds[0].read_text(encoding='utf-8')
        self.assertNotIn('华东示例', md)
        self.assertIn('**第一条** 为规范', md)
        self.assertIn('结合实际，制定本标准。', md)                 # 跨行拼回一段
        self.assertNotIn('- 1 -', md)                                # 页码去掉
        report = (self.run_dir / '内部留存-勿外发' / '报告.md').read_text(encoding='utf-8')
        self.assertIn('OCR 识别，需人工核对', report)
        listing = json.loads((self.run_dir / '内部留存-勿外发' / '文件清单.json').read_text(encoding='utf-8'))
        self.assertTrue(any(f['ocr'] and f['output'].endswith('.md') for f in listing['files']))
        sheet = (pkg / '批次清单.csv').read_text(encoding='utf-8-sig')
        self.assertIn('扫描件 OCR 识别', sheet)
        self.assertEqual(list(pkg.rglob('正文.docx')), [])

    def test_pdf_is_skipped_with_a_reason_when_ocr_is_unavailable(self):
        import pdf_ocr
        (self.src / '扫描.pdf').write_bytes(b'%PDF-1.4 fake')
        saved = pdf_ocr.unavailable_reason
        pdf_ocr.unavailable_reason = lambda: '扫描版 PDF 需要在 Mac 上运行'
        self.addCleanup(lambda: setattr(pdf_ocr, 'unavailable_reason', saved))
        self.redact_and_pack()
        report = (self.run_dir / '内部留存-勿外发' / '报告.md').read_text(encoding='utf-8')
        self.assertIn('扫描.pdf', report)   # 列在跳过的文件里

    def test_non_text_content_is_counted_per_file(self):
        import csv
        _policy_docx(self.src / '财务' / '差旅示例办法.docx', with_images=True)
        self.redact_and_pack()
        path = self.run_dir / '非文字内容统计.csv'
        with path.open(encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))
        body = next(r for r in rows if r['位置'] == '正文')
        self.assertEqual((body['图片'], body['图表'], body['公式']), ('1', '1', '1'))
        self.assertTrue(any(r['位置'] != '正文' and r['图片'] == '1' for r in rows))   # 附件2 的图片
        self.assertNotIn('华东示例', path.read_text(encoding='utf-8-sig'))            # 用脱敏后的文件名

    def test_package_accepts_the_docs_folder_and_import_points_to_package(self):
        import importer, package
        out = self.tmp / '结果'
        redact.main(['--input', str(self.src), '--dict', str(self.dict), '--output', str(out)])
        run = sorted(out.iterdir())[-1]
        package.main(['--run', str(run / '脱敏文件'), '--output', str(self.tmp / '导入包')])
        self.assertTrue(any((self.tmp / '导入包').rglob('批次清单.csv')))
        os.environ['BRIGHTRULE_TOKEN'] = 'test'
        with self.assertRaises(SystemExit) as e:
            importer.main(['--package', str(run / '脱敏文件'), '--url', 'http://test'])
        self.assertIn('先运行 ./run.sh package', str(e.exception))

    def test_metadata_fallbacks_for_files_without_an_info_table(self):
        import package
        md = ('# 发文通知\n\n关于印发《示例档案管理办法》的通知\n\n各部门：现印发。\n\n示例办公室\n\n2023年5月6日\n\n'
              '# 正文\n\n**第一条** 为规范档案管理。\n\n**第二条** 本办法自印发之日起施行。\n')
        meta, missing = package.metadata(md, '示办〔2023〕24号 关于印发《示例档案管理办法》的通知')
        self.assertEqual(meta['title'], '示例档案管理办法')
        self.assertEqual(meta['doc_no'], '示办〔2023〕24号')
        self.assertEqual(meta['effective_date'], '2023-05-06')
        self.assertEqual(missing, ['制度编号'])
        self.assertIn('文件名', meta['_from'])

    def test_category_mapping(self):
        import importer
        opts = [('governance', '公司治理类'), ('operations', '经营管理类'), ('hr', '人力资源管理类'),
                ('compliance', '审计合规类'), ('safety', '安全环保监管类'), ('party', '党工纪类'), ('tech', '科技与工程管理类')]
        for text, value in (('人力资源管理类', 'hr'), ('经营类', 'operations'), ('安全环保监管类', 'safety'),
                            ('党工纪类', 'party'), ('合规管理类', 'compliance'), ('科技与工程管理类', 'tech'), ('hr', 'hr')):
            self.assertEqual(importer.map_category(text, opts), value, text)
        self.assertIsNone(importer.map_category('不存在的分类', opts))
        self.assertIsNone(importer.map_category('', opts))

    def test_import_refuses_internal_folder(self):
        import importer
        with self.assertRaises(SystemExit):
            importer.main(['--package', str(self.tmp / '内部留存-勿外发'), '--url', 'http://test'])


if __name__ == '__main__':
    unittest.main()
