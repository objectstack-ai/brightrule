"""脱敏工具测试：用代码生成的 .docx 覆盖各种容易漏的位置，不依赖任何真实文件。

运行：python3 -m unittest discover -s tests   （在 tools/redact 目录下）
"""
from __future__ import annotations

import csv
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
                '出差申请单报集团备案，已经C集团研究，B市C集团有限责任公司印发，合作单位南方未登记贸易有限公司。')
        found = redact.suspects_in(text, [])
        self.assertIn('C集团', found)
        self.assertIn('B市C集团有限责任公司', found)
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
        red = redact.Redactor([redact.Term('人名', '张三丰', '人员A'), redact.Term('集团', 'B市C集团', '甲集团')], [])
        self.assertEqual(red.redact_string('签发人：张 三 丰')[0], '签发人：人员A')
        self.assertEqual(red.redact_string('签发人：张\u3000\u3000三\u3000\u3000丰。')[0], '签发人：人员A。')
        self.assertEqual(red.redact_string('B 市 C 集团')[0], '甲集团')
        self.assertEqual([t.original for t in red.leaked_terms('落款：张 三 丰')], ['张三丰'])
        self.assertEqual(red.redact_string('张三 丰收')[1][0].term, '张三丰')   # 命中记到词典原文上


class RobustnessTest(unittest.TestCase):
    def test_bad_file_and_old_format_do_not_stop_the_batch(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            src = tmp / '原件'
            (src / '子目录').mkdir(parents=True)
            make_docx(src / '好文件.docx')
            make_docx(src / '子目录' / '扩展名写错.doc')          # 其实是 .docx
            (src / '坏文件.docx').write_bytes(b'not a zip')
            out = tmp / '结果'
            dict_ = HERE.parent / '词典示例.csv'
            code = redact.main(['--input', str(src), '--dict', str(dict_), '--output', str(out), '--convert-doc'])
            self.assertEqual(code, 1)                                # 坏文件要处理
            docs = sorted(p.relative_to(next(out.iterdir()) / '脱敏文件').as_posix()
                          for p in (next(out.iterdir()) / '脱敏文件').rglob('*.docx'))
            self.assertEqual(set(docs), {'子目录/扩展名写错.docx', '好文件.docx'})
            report = (next(out.iterdir()) / '内部留存-勿外发' / '报告.md').read_text(encoding='utf-8')
            self.assertIn('不是有效的 .docx', report)
            self.assertIn('自动转换（扩展名更正）', report)
        finally:
            shutil.rmtree(tmp)


class ScanTest(unittest.TestCase):
    def test_short_forms_share_the_full_names_code_whatever_the_order(self):
        import scan
        sc = scan.Scan([])
        # 简称先出现、中间写法再出现、全称最后才出现：仍是一组
        for para in ('经C集团研究决定。', '由B市C集团负责。', '本办法适用于华东示例集团。',
                     'B市C集团有限责任公司  2025年1月9日印发', '华东示例集团有限公司文件'):
            sc.scan_paragraph('a.docx', para)
        rows = {c.text: c for c in sc.finish()}
        self.assertEqual({rows[t].replacement for t in ('C集团', 'B市C集团', 'B市C集团有限责任公司')},
                         {rows['B市C集团有限责任公司'].replacement})
        self.assertEqual(rows['C集团'].group, 'B市C集团有限责任公司')
        self.assertEqual(rows['华东示例集团'].replacement, rows['华东示例集团有限公司'].replacement)
        self.assertNotIn('于华东示例集团', rows)

    def test_scan_proposes_a_usable_dictionary(self):
        import scan
        tmp = Path(tempfile.mkdtemp())
        try:
            src = tmp / '原件'
            src.mkdir()
            cells = ('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>经办人</w:t></w:r></w:p></w:tc>'
                     '<w:tc><w:p><w:r><w:t xml:space="preserve">赵 六</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
            body = cells + ''.join(f'<w:p><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>' for t in (
                '关于印发《C集团差旅费管理办法》的通知', 'BCB字﹝2025﹞3号',
                '各下属企业：经C集团研究，切实加强集团管理，请结合集团实际执行。',
                '制度编码：C集-JY-ZHB-03-07-01', '一类地区指北京、上海；三类地区指A省内城市（不含D市）。',
                '参照B市财办﹝2021﹞36号执行，联系人：张建国，电话 13812345678。', '签发人：亓 玉 林',
                '由王小明总经理签发，提高总经理办公会效率。', '办公地址：B市示例区建设路18号3楼。',
                '审批请登录华示OA系统，详见 https://oa.cgroup-demo.com/x 。',
                'B市C集团有限责任公司综合办公室  2025年1月9日印发'))
            doc = f'<w:document {W}><w:body>{body}</w:body></w:document>'
            parts = dict(PARTS, **{'word/document.xml': doc, 'word/comments.xml': COMMENTS})
            with zipfile.ZipFile(src / 'C集团差旅费管理办法.docx', 'w') as z:
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
            for name in ('B市C集团有限责任公司', 'B市C集团', 'C集团'):
                self.assertIn(name, active)
            self.assertEqual({rows[n]['替换为'] for n in ('B市C集团有限责任公司', 'B市C集团', 'C集团')}, {rows['C集团']['替换为']})
            for name in ('B市', 'A省', 'D市', 'BCB字', '亓玉林', '赵六', 'C集-JY-ZHB-03-07-01', '张建国', '王小明', '王某某', 'cgroup-demo.com'):
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


if __name__ == '__main__':
    unittest.main()
