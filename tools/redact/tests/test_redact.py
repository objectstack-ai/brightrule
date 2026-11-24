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

    def test_word_can_still_read_it(self):
        if not shutil.which('pandoc'):
            self.skipTest('pandoc 未安装')
        out = subprocess.run(['pandoc', '-f', 'docx', '-t', 'plain', str(self.result)],
                             capture_output=True, text=True, check=True).stdout
        self.assertIn('甲公司差旅费报销管理办法', out)


if __name__ == '__main__':
    unittest.main()
