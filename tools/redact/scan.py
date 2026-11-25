#!/usr/bin/env python3
"""扫描一批 Word 制度文档，找出可能需要脱敏的词，生成「候选词典.csv」供人工确认。

用法：
    python3 scan.py --input 原件目录 [--dict 已有词典.csv] [--output 脱敏结果]

只读原件、全部在本机运行。输出 <output>/<年月日-小时>-扫描/：
    候选词典.csv   与 DICTIONARY.md 的词典格式相同，可直接改了用：
                   置信度高、中的行是正常行；置信度低的行，类别前加了 #（被当成注释），确认要脱敏的把 # 删掉。
                   同一机构的全称、简称已填同一个替换值。
    扫描报告.md    按类别汇总，并说明每类是怎么找出来的。

这是初筛，会有误报，也一定有漏报（尤其是人名）。词典最终以人工确认为准。
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import re
import sys
import zipfile
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from convert import CONVERTIBLE, has_docx_sibling  # noqa: E402
from redact import (CP, DC, EP, EXTRA_LEAD, MC, REL, SUSPECT_LEAD, TEXT_PARTS, WP, _nearest, _parse,  # noqa: E402
                    accept_revisions, load_dictionary, w)

TIANGAN = '甲乙丙丁戊己庚辛壬癸'

# ── 规则 ──────────────────────────────────────────────────────────────────
# 机构：名称 + 机构类后缀。法定后缀（有限公司等）可以去掉，得到常用简称。
LEGAL_SUFFIX = r'(?:股份有限公司|有限责任公司|有限公司)'
ORG_SUFFIX = (r'(?:集团(?:股份有限公司|有限责任公司|有限公司)?|股份有限公司|有限责任公司|有限公司|分公司|公司|'
              r'银行(?:[一-龥]{1,8}?(?:分行|支行))?|研究院|研究所|设计院|事务所|医院|大学|学院|学校|协会|基金会)')
ORG = re.compile(r'[一-龥A-Za-z0-9（）()·]{1,24}?' + ORG_SUFFIX)
# 只剩通用称呼的不算机构名
GENERIC_ORG_BODY = re.compile(
    r'^(?:子|分|母|总|控股|上市|全资|集团|本|该|各|下属|所属|其他|有关|相关|对方|合作|供应商|外部|第三方|'
    r'保险|银行|商业银行|国有|民营|中外合资|外资|物业|投资|建筑|贸易|科技|物流|股份|有限|责任|单位|关联)*$')

# 地名：前面 1–6 个字 + 行政区划后缀
PLACE = re.compile(r'([一-龥A-Z]{1,6}?)(省|自治区|特别行政区|市|自治州|州|县|区|旗|镇|乡|街道)')
PLACE_STOP = set('''
城市 市内 市外 市场 都市 超市 门市 上市 本市 全市 各市 该市 地市 市级 市区 城区 郊区 山区 牧区 辖区 片区 景区 园区 社区 小区
区域 地区 区间 区别 区分 分区 专区 灾区 特区 新区 老区 省内 省外 本省 全省 各省 外省 省级 省份 县级 本县 全县 各县 区县 县区
区级 本区 全区 各区 乡镇 城镇 集镇 村镇 本镇 全镇 各镇 乡村 本乡 下乡 家乡 老乡 城乡 街道 州市 自治州 市县 省市 省区
'''.split())
PLACE_BAD_CHAR = set('的和与及或在是为对由从向给按将把被以于等其该各本全每此这那所级内外上下中前后左右场面里域间类别分般一二三四五六七八九十')
PROVINCES = ('北京 天津 上海 重庆 河北 山西 辽宁 吉林 黑龙江 江苏 浙江 安徽 福建 江西 山东 河南 湖北 湖南 广东 海南 四川 贵州 云南 '
             '陕西 甘肃 青海 台湾 内蒙古 广西 西藏 宁夏 新疆 香港 澳门').split()

# 文号：机关代字〔年份〕序号号，如 HDB字﹝2025﹞3号、某政发〔2024〕12号
DOC_NO = re.compile(r'([A-Za-z一-龥]{1,12}?)\s*[〔﹝\[［【(（]\s*((?:19|20)\d{2})\s*[〕﹞\]］】)）]\s*(\d{1,4})\s*号')
# 编码：带两个以上连字符、同时有字母和数字，如 华集-XZ-GL-03-07-01、HT-2024-0012
CODE = re.compile(r'(?<![A-Za-z0-9-])[A-Za-z0-9一-龥]{1,8}(?:[-－_][A-Za-z0-9]{1,10}){2,}(?![A-Za-z0-9])')
# 独立的英文大写缩写（常是机构或系统代号）
ABBR = re.compile(r'(?<![A-Za-z])[A-Z]{2,8}(?![A-Za-z])')
COMMON_ABBR = set('''OA ERP CRM HR IT PDF PPT APP VIP KTV ID GB CEO CFO CTO COO KPI ISO TV PC QQ AI
UTC GMT USB SIM SMS EMS GPS LED VPN WIFI WPS CAD SAP OK NO VS PS AA TEL FAX'''.split())

# 系统名：××系统 / ××平台 / ××OA
SYSTEM = re.compile(r'[一-龥A-Za-z0-9]{2,10}?(?:OA|ERP|CRM|系统|平台)')
GENERIC_SYSTEM = re.compile(r'^(?:管理|信息|财务|报销|办公|审批|业务|操作|网上|电子|线上|内部|相关|该|本|各|有关|系统|平台|信息化|协同)*'
                            r'(?:OA|ERP|CRM|系统|平台)$')

# 地址：…路/街/道 + 门牌号
ADDRESS = re.compile(r'[一-龥A-Za-z0-9]{2,20}?(?:路|街|大道|巷|弄|胡同)\s*\d+\s*号(?:[一-龥A-Za-z0-9]{0,12}?(?:楼|层|室|座))?')

# 人名：常见姓氏 + 1–2 个字，前面是「联系人：」这类角色词，或后面是职务、称谓
SURNAMES = ('王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤常温康施文牛樊葛邢安齐易乔伍庞颜倪庄聂章鲁岳翟殷詹申欧耿关兰焦俞左柳甘祝包宁尚符舒阮柯纪梅童凌毕单季裴霍涂成苗谷盛曲翁冉骆蓝路游辛靳管柴蒙鲍华喻祁蒲房滕屈饶解牟艾尤阳时穆农司卓古吉缪简车项连芦麦褚娄窦戚岑景党宫费卜冷晏席卫米柏宗瞿桂全佟应臧闵苟邬边卞姬师和仇栾隋商刁沙荣巫寇桑郎甄丛仲虞敖巩明佘池查麻苑迟邝')
COMPOUND_SURNAMES = ('欧阳', '司马', '上官', '诸葛', '东方', '皇甫', '尉迟', '公孙', '慕容', '长孙', '宇文', '司徒', '夏侯', '令狐')
SURNAME_RX = '(?:' + '|'.join(COMPOUND_SURNAMES) + '|[' + SURNAMES + '])'
ROLE_WORDS = ('签发人|联系人|经办人|负责人|审核人|审批人|批准人|起草人|拟稿人|核稿人|编制人|填报人|制表人|主持人|报告人|记录人|'
              '发言人|收件人|申请人|承办人|责任人|监督人|对接人|委托人|代理人|法定代表人|法人代表|主送|抄送|姓名')
TITLE_WORDS = ('同志|先生|女士|董事长|副董事长|总经理|副总经理|总裁|副总裁|总监|书记|副书记|主任|副主任|部长|副部长|局长|副局长|'
               '处长|副处长|科长|副科长|经理|副经理|主席|副主席|院长|校长|行长|厂长|总工|会计师|律师')
# 角色词后面：不要求常见姓氏（「亓」「乜」这类姓也能找到）；字间可带排版空格（「张 三 丰」）
SP = r'[ \t\u3000\u00a0]'
ROLE_RX = re.compile(r'^(?:' + ROLE_WORDS + r')\s*[:：]?$')
# 角色词本身也可能被排版空格隔开（「签 发 人：」）
ROLE_SPACED = '|'.join((SP + '*').join(word) for word in ROLE_WORDS.split('|'))
NAME_AFTER_ROLE = re.compile(r'(?:' + ROLE_SPACED + r')' + SP + r'*[:：]' + SP + r'*((?:[一-龥]' + SP + r'{0,4}){1,3}?[一-龥])(?=' + SP + r'*(?:$|[^一-龥 \t\u3000\u00a0]|(?:' + ROLE_SPACED + r'|印发|日期|电话|手机)))')
NOT_A_NAME = re.compile(r'^(?:无|略|空|同上|见附件|待定|本人|另附|附后|签字|盖章|签名|领导|主任|部门|单位|本单位|各部门|各单位)$')
NAME_BEFORE_TITLE = re.compile(r'(' + SURNAME_RX + r'[一-龥]{1,2}?)(?:' + TITLE_WORDS + r')')
NAME_BAD_CHAR = set('的了和与及或在是为对由从向给按将把被以于等其该各本全每此这那所级内外上下中前后部门办会司处科局厅委院所组室队站总副正'
                    '经理事长任记员人者方式样些个次年月日号条款章节规定制度办法通知要求负责管理审批报销费用标准')

PUBLIC_DOMAINS = ('baidu.com', 'qq.com', '163.com', '126.com', 'sina.com', 'sina.com.cn', 'sohu.com', 'gmail.com', 'outlook.com',
                  'hotmail.com', 'microsoft.com', 'apple.com', 'google.com', 'gov.cn', 'w3.org', 'openxmlformats.org',
                  'purl.org', 'wps.cn', 'weixin.qq.com', 'aliyun.com', 'taobao.com', 'jd.com')
DOMAIN = re.compile(r'(?<![A-Za-z0-9.-])((?:[A-Za-z0-9-]+\.)+(?:com\.cn|net\.cn|org\.cn|gov\.cn|edu\.cn|com|cn|net|org|cc|io|biz|info))(?![A-Za-z0-9])')


# ── 候选 ──────────────────────────────────────────────────────────────────
CONF_ORDER = {'高': 0, '中': 1, '低': 2}
CATEGORY_ORDER = ['集团', '公司', '机构', '地名', '人名', '文号', '编号', '缩写', '系统', '地址', '域名']


@dataclass
class Candidate:
    category: str
    text: str
    confidence: str
    reason: str
    count: int = 0
    files: Set[str] = field(default_factory=set)
    example: str = ''
    group: Optional[str] = None      # 同组（全称与简称）共用一个替换值
    replacement: str = ''


class Scan:
    def __init__(self, known: Iterable[str]):
        self.known = {k.lower() for k in known if k}
        self.cands: 'OrderedDict[Tuple[str, str], Candidate]' = OrderedDict()
        self.paragraphs: List[Tuple[str, str]] = []   # (文件, 段落文字)

    def add(self, category: str, text: str, confidence: str, reason: str, file: str, para: str = '',
            group: Optional[str] = None) -> None:
        text = text.strip()
        if len(text) < 2 or text.lower() in self.known:
            return
        key = (category, text)
        c = self.cands.get(key)
        if c is None:
            c = self.cands[key] = Candidate(category, text, confidence, reason, group=group)
        elif CONF_ORDER[confidence] < CONF_ORDER[c.confidence]:
            c.confidence, c.reason = confidence, reason
        c.files.add(file)
        if para and not c.example:
            i = para.find(text)
            c.example = para[max(0, i - 12): i + len(text) + 12].replace('\n', ' ') if i >= 0 else para[:40]

    # 正文逐段扫描
    def scan_paragraph(self, file: str, para: str) -> None:
        self.paragraphs.append((file, para))
        for s in org_names(para):
            cat = '集团' if '集团' in s else ('公司' if '公司' in s else '机构')
            if re.search(LEGAL_SUFFIX + '$', s) or re.match(r'^[A-Z一-龥]{1,6}?[省市县区]', s):
                conf, why = '高', '机构全称（带有限公司等法定后缀，或以地名开头）'
            elif re.search(r'[A-Za-z0-9]', s):
                conf, why = '中', '机构名称（含字母代号）'
            elif '集团' in s and 2 <= len(re.sub(ORG_SUFFIX + '$', '', s)) <= 6:
                conf, why = '中', '集团名称（如「青松集团」）'
            elif re.search('《[^》]*' + re.escape(s), para):
                conf, why = '中', '出现在文件标题《…》里的机构名称'
            else:
                conf, why = '低', '像机构名称，但没有法定后缀，常是普通说法（如「汽车租赁公司」）'
            self.add(cat, s, conf, why, file, para)
        for name, place in places(para):
            if name in PROVINCES or name.rstrip('省市') in PROVINCES:
                self.add('地名', name, '低', '常见省市名：通常不用脱敏；如果是公司所在地，确认后启用', file, para)
            else:
                self.add('地名', name, '中', '地名（××省 / 市 / 县 / 区）', file, para)
        for m in DOC_NO.finditer(para):
            prefix = trim_lead(m.group(1))
            # 「K市财办」「J省国资考核字」：地名之后是通用的机关代字，替换地名就够了；「K市HDGO」只留 HDGO
            pm = re.match(r'^[A-Z一-龥]{1,6}?[省市县区]', prefix)
            if pm:
                prefix = prefix[pm.end():]
                if re.fullmatch(r'[一-龥]{1,6}', prefix):
                    continue
            if prefix and not re.fullmatch(r'[一-龥]{0,2}', prefix):
                # 机关代字（如 HDGO、K市财办）替换掉，文号整体就认不出单位了，不必逐个列文号
                self.add('文号', prefix, '高', '公文文号里的机关代字，常是单位简称', file, para)
            else:
                full = f'{prefix}{m.group(0)[len(m.group(1)):]}'.strip()
                self.add('文号', full, '中', '完整文号', file, para)
        for m in CODE.finditer(para):
            if re.search(r'[A-Za-z]', m.group(0)) and re.search(r'\d', m.group(0)) and not DOMAIN.search(m.group(0)):
                self.add('编号', m.group(0), '中', '编码（多段连字符，含字母和数字），如制度编码、合同编号', file, para)
                head = m.group(0).split('-')[0].split('－')[0]
                if re.search(r'[一-龥]', head) and len(head) >= 2:
                    self.add('缩写', head, '中', '编码开头的中文简称', file, para)
        for m in ABBR.finditer(para):
            if m.group(0) not in COMMON_ABBR:
                self.add('缩写', m.group(0), '低', '英文大写缩写：可能是单位或系统代号', file, para)
        for m in SYSTEM.finditer(para):
            s = trim_lead(m.group(0))
            if s and not GENERIC_SYSTEM.match(s) and len(s) >= 4:
                self.add('系统', s, '低', '系统 / 平台名称', file, para)
        for m in ADDRESS.finditer(para):
            self.add('地址', trim_lead(m.group(0)), '高', '门牌地址', file, para)
        for name, why in person_names(para):
            self.add('人名', name, '中', why, file, para)
        for m in DOMAIN.finditer(para):
            d = registrable(m.group(1).lower())
            if not d.endswith(PUBLIC_DOMAINS):
                self.add('域名', d, '中', '网址 / 邮箱里的域名（邮箱、网址本身已由格式规则替换）', file, para)

    def finish(self) -> List[Candidate]:
        texts = [p for _f, p in self.paragraphs]
        # 机构简称：全称去掉法定后缀、再去掉地名前缀，在文档里确实出现过的才列出。
        # 全称、简称、简称的简称（K市M集团有限责任公司 → K市M集团 → M集团）连成一组，共用一个替换值；
        # 组名取组里最长的写法。先处理长的，保证简称挂到全称上。
        parent: Dict[str, str] = {}

        def root(t: str) -> str:
            while parent.get(t, t) != t:
                t = parent[t]
            return t

        def union(a: str, b: str) -> None:
            ra, rb = root(a), root(b)
            if ra != rb:
                keep, drop = (ra, rb) if (len(ra), ra) >= (len(rb), rb) else (rb, ra)
                parent[drop] = keep

        orgs = sorted((c for c in self.cands.values() if c.category in ('集团', '公司', '机构')),
                      key=lambda c: -len(c.text))
        for c in orgs:
            parent.setdefault(c.text, c.text)
            for alias in aliases(c.text):
                if alias.lower() in self.known or len(alias) < 2:
                    continue
                hits = [(f, p) for f, p in self.paragraphs if alias in p]
                if not hits:
                    continue
                key = (c.category, alias)
                a = self.cands.get(key)
                if a is None:
                    a = self.cands[key] = Candidate(c.category, alias, '高', f'「{c.text}」的简称')
                    orgs.append(a)
                elif a.confidence != '高':
                    a.confidence, a.reason = '高', f'「{c.text}」的简称'
                for f, p in hits:
                    a.files.add(f)
                    if not a.example:
                        i = p.find(alias)
                        a.example = p[max(0, i - 12): i + len(alias) + 12]
                parent.setdefault(alias, alias)
                union(c.text, alias)
            # 名称里的地名前缀（如「K市」）提高置信度：它能指认公司所在地
            m = re.match(r'^([A-Z一-龥]{1,6}?[省市县区])', c.text)
            if m and ('地名', m.group(1)) in self.cands:
                p = self.cands[('地名', m.group(1))]
                p.confidence, p.reason = '高', f'出现在机构名「{c.text}」里，能指认所在地'
        for c in self.cands.values():
            if c.category in ('集团', '公司', '机构'):
                c.group = root(c.text)
                if c.group != c.text and c.reason.startswith('「'):
                    c.reason = f'「{c.group}」的简称'
        # 计数：按最终词在所有段落里出现的次数（不重叠计数）
        for c in self.cands.values():
            c.count = sum(p.count(c.text) for p in texts) or len(c.files)
        out = [c for c in self.cands.values() if c.count]
        # 同一个词只列一次：保留置信度高、类别靠前的那条
        best: Dict[str, Candidate] = {}
        for c in sorted(out, key=lambda c: (CONF_ORDER[c.confidence], CATEGORY_ORDER.index(c.category))):
            best.setdefault(c.text.lower(), c)
        out = [c for c in out if best[c.text.lower()] is c]
        # 去掉被更长的高置信度候选完全覆盖、且自身从不单独出现的短词
        out = drop_shadowed(out, texts)
        assign_codes(out)
        out.sort(key=lambda c: (CATEGORY_ORDER.index(c.category) if c.category in CATEGORY_ORDER else 99,
                                c.group or c.text, CONF_ORDER[c.confidence], -c.count, c.text))
        return out


def registrable(host: str) -> str:
    """oa.cgroup-demo.com → cgroup-demo.com；www.x.com.cn → x.com.cn。替换它就同时覆盖所有子域名。"""
    labels = host.split('.')
    n = 3 if len(labels) >= 3 and '.'.join(labels[-2:]) in ('com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn') else 2
    return '.'.join(labels[-n:])


def trim_lead(s: str) -> str:
    for rx in (SUSPECT_LEAD, EXTRA_LEAD):
        m = rx.match(s[:-1])
        if m:
            s = s[m.end():]
    return s.lstrip('（(·')


def org_names(para: str) -> List[str]:
    out = []
    for m in ORG.finditer(para):
        s = trim_lead(m.group(0))
        body = re.sub(ORG_SUFFIX + '$', '', s)
        if not s or not body or GENERIC_ORG_BODY.match(body):
            continue
        if s.endswith('公司') and not re.search(LEGAL_SUFFIX + '$', s) and (len(body) < 2 or body[-1] in '本该各子分总母'):
            continue
        out.append(s)
    return out


def aliases(full: str) -> List[str]:
    base = re.sub(LEGAL_SUFFIX + '$', '', full)
    out = [base] if base != full else []
    m = re.match(r'^[A-Z一-龥]{1,6}?[省市县区](.+)$', base)
    if m and len(m.group(1)) >= 2:
        out.append(m.group(1))
    return [a for a in out if a and a != full]


def places(para: str) -> List[Tuple[str, str]]:
    out = []
    for m in PLACE.finditer(para):
        body = trim_lead(m.group(1) + m.group(2))[:-len(m.group(2))] if m.group(1) else ''
        name = body + m.group(2)
        if not body or name in PLACE_STOP or any(ch in PLACE_BAD_CHAR for ch in body):
            continue
        if len(body) == 1 and not re.match(r'[A-Z]', body):
            continue  # 「某市」「京市」这类单字多半是误切
        if name.endswith('地区') or (len(body) > 4 and m.group(2) not in ('自治区', '自治州', '特别行政区')):
            continue  # 「一类地区」「其他地区」；过长的多半连着前面的词
        out.append((name, m.group(2)))
    for prov in PROVINCES:
        if prov in para:
            out.append((prov, ''))
    return out


def plausible_name(raw: str) -> Optional[str]:
    """去掉字间空格后是 2–4 个字、不像普通词语的，当作姓名。"""
    name = re.sub(SP, '', raw).strip()
    if not 2 <= len(name) <= 4 or not re.fullmatch(r'[一-龥]+', name) or NOT_A_NAME.match(name):
        return None
    if name[0] in '的了和与及或在是为对由从向给按将把被以于等其该各本全每此这那所见详如':
        return None
    if any(ch in NAME_BAD_CHAR for ch in name[1:]):
        return None
    return name


def person_names(para: str) -> List[Tuple[str, str]]:
    out = []
    for m in NAME_AFTER_ROLE.finditer(para):
        name = plausible_name(m.group(1))
        if name:
            out.append((name, '角色词后面的姓名（如「签发人：」「联系人：」）'))
    for m in NAME_BEFORE_TITLE.finditer(para):
        name = m.group(1)
        start = m.start(1)
        if start > 0 and re.match(r'[一-龥]', para[start - 1]) and para[start - 1] not in '由请向与和及、，。：:；;（(“"给对把被将':
            continue  # 前一个字是汉字，多半是词的一部分（如「提高总经理」）
        if not any(ch in NAME_BAD_CHAR for ch in name[1:]):
            out.append((name, '职务 / 称谓前面的姓名（如「××总经理」「××同志」）'))
    return out


def drop_shadowed(cands: List[Candidate], texts: List[str]) -> List[Candidate]:
    strong = sorted((c for c in cands if c.confidence != '低'), key=lambda c: -len(c.text))
    keep = []
    for c in cands:
        longer = [o.text for o in strong if o is not c and c.text in o.text and len(o.text) > len(c.text)]
        if longer and c.group is None and c.category not in ('文号', '缩写'):
            alone = sum(_count_outside(p, c.text, longer) for p in texts)
            if alone == 0:
                continue
        keep.append(c)
    return keep


def _count_outside(para: str, short: str, longer: List[str]) -> int:
    for lg in longer:
        para = para.replace(lg, '\0')
    return para.count(short)


def assign_codes(cands: List[Candidate]) -> None:
    counters: Dict[str, int] = defaultdict(int)
    by_group: Dict[str, str] = {}

    def nxt(kind: str) -> int:
        counters[kind] += 1
        return counters[kind] - 1

    def tg(i: int, suffix: str) -> str:
        return (TIANGAN[i] if i < len(TIANGAN) else f'{i + 1}号') + suffix

    def letters(i: int) -> str:
        s = ''
        while True:
            s = chr(ord('A') + i % 26) + s
            i = i // 26 - 1
            if i < 0:
                return s

    # 全称先编号，简称跟着全称
    for c in sorted(cands, key=lambda c: (c.group != c.text, -c.count)):
        if c.category in ('集团', '公司', '机构'):
            g = c.group or c.text
            if g not in by_group:
                kind = '集团' if '集团' in g else ('银行' if '银行' in g else ('公司' if '公司' in g else '机构'))
                by_group[g] = tg(nxt(kind), kind)
            c.replacement = by_group[g]
        elif c.category == '地名':
            suffix = c.text[-1] if c.text[-1] in '省市县区州镇乡旗' else '地'
            c.replacement = tg(nxt('地' + suffix), suffix)
        elif c.category == '人名':
            c.replacement = f'人员{letters(nxt("人"))}'
        elif c.category == '文号':
            c.replacement = '【文号】' if '号' in c.text else f'代字{letters(nxt("代字"))}'
        elif c.category == '编号':
            c.replacement = '【编号】'
        elif c.category == '缩写':
            c.replacement = f'代号{letters(nxt("代号"))}'
        elif c.category == '系统':
            c.replacement = f'系统{letters(nxt("系统"))}'
        elif c.category == '地址':
            c.replacement = '【地址】'
        elif c.category == '域名':
            c.replacement = f'example{nxt("域名") + 1}.com'


# ── 读文件 ────────────────────────────────────────────────────────────────
def paragraphs_of(path: Path) -> Tuple[List[str], List[str], List[str]]:
    """返回（段落文字，作者类人名，属性里的单位名）。修订按接受读取；批注也读（里面常有人名）。"""
    paras: List[str] = []
    people: List[str] = []
    orgs: List[str] = []
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        for name in names:
            if not (TEXT_PARTS.match(name) or name == 'word/comments.xml'):
                continue
            root = _parse(z.read(name))
            people += [v for el in root.iter() for k, v in el.attrib.items() if k in (w('author'), w('initials')) and k == w('author')]
            if name != 'word/comments.xml':
                accept_revisions(root)
            for tr in root.iter(w('tr')):  # 表格里「签发人 | 张三」分在两个格子
                cells = [''.join(t.text or '' for t in tc.iter(w('t'))).strip() for tc in tr.findall(w('tc'))]
                for left, right in zip(cells, cells[1:]):
                    if ROLE_RX.match(re.sub(SP, '', left)) and right:
                        paras.append(f'{re.sub(SP, "", left).rstrip(":：")}：{right}')
            for p in root.iter(w('p')):
                if _nearest(p, f'{{{MC}}}Fallback') is not None:
                    continue
                text = ''.join(t.text or '' for t in p.iter(w('t')) if _nearest(t, w('p')) is p)
                if text.strip():
                    paras.append(text)
            paras += [el.get(a) for el in root.iter(f'{{{WP}}}docPr') for a in ('descr', 'title') if el.get(a)]
            paras += [el.get('string') for el in root.iter('{urn:schemas-microsoft-com:vml}textpath') if el.get('string')]  # 艺术字
        if 'docProps/core.xml' in names:
            root = _parse(z.read('docProps/core.xml'))
            people += [el.text for tag in (f'{{{DC}}}creator', f'{{{CP}}}lastModifiedBy') for el in root.iter(tag) if el.text]
            # 标题、主题、关键词、备注、类别：WPS / Word 常把文件标题存在这里
            paras += [el.text for tag in (f'{{{DC}}}title', f'{{{DC}}}subject', f'{{{CP}}}keywords',
                                          f'{{{DC}}}description', f'{{{CP}}}category')
                      for el in root.iter(tag) if el.text and el.text.strip()]
        if 'docProps/app.xml' in names:
            root = _parse(z.read('docProps/app.xml'))
            orgs += [el.text for el in root.iter(f'{{{EP}}}Company') if el.text]
            people += [el.text for el in root.iter(f'{{{EP}}}Manager') if el.text]
        for name in names:
            if name.endswith('.rels'):
                root = _parse(z.read(name))
                paras += [r.get('Target') for r in root.iter(f'{{{REL}}}Relationship')
                          if r.get('TargetMode') == 'External' and r.get('Target')]
    return paras, people, orgs


GENERIC_AUTHORS = {'administrator', 'admin', 'user', 'microsoft', 'microsoft office user', 'lenovo', 'dell', 'hp', 'pc',
                   'windows 用户', 'windows user', '作者', '用户', 'author', 'wps', 'unknown', '未知', 'owner', 'think'}


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='扫描 .docx，生成候选脱敏词典')
    ap.add_argument('--input', required=True, type=Path, help='原件目录（只读，含子目录）')
    ap.add_argument('--dict', type=Path, help='已有词典：里面已有的原文不再列出')
    ap.add_argument('--output', type=Path, default=Path('脱敏结果'), help='结果根目录，默认 ./脱敏结果')
    args = ap.parse_args(argv)
    if not args.input.is_dir():
        raise SystemExit(f'原件目录不存在：{args.input}')

    known: List[str] = []
    if args.dict:
        for t in load_dictionary(args.dict):
            known += [t.original, t.replacement]
    scan = Scan(known)
    everything = sorted(p for p in args.input.rglob('*') if p.is_file() and not p.name.startswith(('~$', '.')))
    files = [p for p in everything if p.suffix.lower() == '.docx']
    old = [p for p in everything if p.suffix.lower() in CONVERTIBLE and not has_docx_sibling(p)]
    failed = []
    targets: List[Tuple[Path, str]] = [(p, str(p.relative_to(args.input))) for p in files]
    for path, rel in targets:
        try:
            paras, people, orgs = paragraphs_of(path)
        except zipfile.BadZipFile:
            failed.append(f'{rel}：不是有效的 .docx（可能是改了扩展名的 .doc，或文件已损坏）')
            continue
        except Exception as e:  # 一个文件出错不影响其他文件
            failed.append(f'{rel}：读取失败（{type(e).__name__}）')
            continue
        for person in people:
            if person.strip() and person.strip().lower() not in GENERIC_AUTHORS:
                scan.add('人名', person.strip(), '高', 'Word 里记录的作者 / 修订人 / 批注人', rel)
        for org in orgs:
            scan.add('集团' if '集团' in org else '公司', org.strip(), '高', 'Word 文档属性里的单位', rel)
        for name_part in re.split(r'[\\/]', str(Path(rel).with_suffix(''))):
            scan.scan_paragraph(rel, name_part)
        for para in paras:
            scan.scan_paragraph(rel, para)
    cands = scan.finish()

    stamp = _dt.datetime.now().strftime('%Y%m%d-%H') + '-扫描'
    out_root, n = args.output / stamp, 2
    while out_root.exists():  # 同一小时再扫一次：…-扫描-2
        out_root, n = args.output / f'{stamp}-{n}', n + 1
    out_root.mkdir(parents=True)
    write_dictionary(out_root / '候选词典.csv', cands)
    write_report(out_root / '扫描报告.md', cands, [p for p, _r in targets], failed, args)
    by_conf = defaultdict(int)
    for c in cands:
        by_conf[c.confidence] += 1
    if old:
        print(f'注意：有 {len(old)} 个 .doc / .rtf / .wps 等旧格式文件没有扫描。先运行 ./run.sh convert 转成同名 .docx，再重新扫描：')
        for p in old[:10]:
            print(f'  {p.relative_to(args.input)}')
    for f in failed:
        print(f'没扫到：{f}')
    print(f'扫描 {len(targets)} 个文件，找到 {len(cands)} 个候选：置信度高 {by_conf["高"]}、中 {by_conf["中"]}、低 {by_conf["低"]}（低的默认注释掉）。')
    print(f'候选词典：{out_root / "候选词典.csv"}')
    print(f'扫描报告：{out_root / "扫描报告.md"}')
    return 0


def write_dictionary(path: Path, cands: List[Candidate]) -> None:
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        wr = csv.writer(f)
        wr.writerow(['类别', '原文', '替换为', '备注'])
        wr.writerow(['# 自动扫描的候选，请逐行确认。置信度低的行类别前有 #（不生效），要用就删掉 #；不要的行整行删掉。'
                     '同一机构的全称和简称已填同一个替换值。', '', '', ''])
        for c in cands:
            note = f'置信度{c.confidence}｜{c.count} 处 / {len(c.files)} 个文件｜{c.reason}' + (f'｜例：…{c.example}…' if c.example else '')
            wr.writerow([('#' if c.confidence == '低' else '') + c.category, c.text, c.replacement, note])


def write_report(path: Path, cands: List[Candidate], files: List[Path], failed: List[str], args) -> None:
    lines = ['# 候选词扫描报告（内部留存，勿外发）', '',
             f'- 时间：{_dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}',
             f'- 原件目录：{args.input}（{len(files)} 个 .docx）',
             f'- 已有词典：{args.dict or "无"}（其中的原文不再列出）', '',
             '这是**初筛**：会有误报，也一定有漏报，尤其是人名。确认后把 `候选词典.csv` 里要用的行并入正式词典。', '',
             '| 类别 | 高 | 中 | 低 | 怎么找的 |', '|---|---:|---:|---:|---|']
    how = {
        '集团': '名称 + 集团后缀；有限公司全称会自动推出简称（去掉「有限责任公司」、去掉地名前缀）',
        '公司': '名称 + 公司后缀；同上推出简称；Word 属性里的「单位」',
        '机构': '名称 + 银行 / 研究院 / 事务所 / 医院 / 协会等后缀',
        '地名': '××省 / 市 / 县 / 区 / 镇；出现在机构名里的地名置信度高；常见省市名置信度低',
        '人名': 'Word 记录的作者、修订人、批注人（高）；「联系人：」这类角色词之后、「××总经理」「××同志」这类职务之前的常见姓氏姓名（中）',
        '文号': '「代字〔年份〕序号号」，代字常是单位简称',
        '编号': '多段连字符、含字母和数字的编码；建议也可在 patterns.csv 里加一条规则统一替换',
        '缩写': '编码开头的中文简称（中）；独立的英文大写缩写（低）',
        '系统': '××系统 / ××平台 / ××OA（低）',
        '地址': '…路 / 街 + 门牌号',
        '域名': '网址、邮箱里的单位域名',
    }
    for cat in CATEGORY_ORDER:
        rows = [c for c in cands if c.category == cat]
        n = lambda conf: sum(1 for c in rows if c.confidence == conf)  # noqa: E731
        lines.append(f'| {cat} | {n("高")} | {n("中")} | {n("低")} | {how[cat]} |')
    lines += ['', '**找不到、需要人工补的**：没有职务或角色词提示的人名（如名单、签名）、项目名、产品 / 品牌名、客户和供应商的简称、'
              '图片里的文字（公章、截图）。手机号、身份证号、银行卡号、邮箱、网址等由 `patterns.csv` 的格式规则直接替换，不用写进词典。', '']
    for cat in CATEGORY_ORDER:
        rows = [c for c in cands if c.category == cat]
        if not rows:
            continue
        lines += [f'## {cat}', '', '| 置信度 | 原文 | 建议替换为 | 次数 | 文件数 | 例 |', '|---|---|---|---:|---:|---|']
        lines += [f'| {c.confidence} | {c.text} | {c.replacement} | {c.count} | {len(c.files)} | …{c.example}… |'
                  for c in rows]
        lines.append('')
    if failed:
        lines += ['## 读不了的文件', ''] + [f'- {x}' for x in failed] + ['']
    path.write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
