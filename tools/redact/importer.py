#!/usr/bin/env python3
"""导入：把导入包写进 BrightRule 系统（brightrule#13）。在本机运行，经系统的 HTTPS 接口写入，云环境同样适用。

用法：
    export BRIGHTRULE_API_KEY=…            # 系统里生成的 API Key（制度管理员）
    python3 importer.py --package 导入包/<时间> --url https://<系统地址>            # 预演：只列计划，不写入
    python3 importer.py --package 导入包/<时间> --url https://<系统地址> --apply    # 写入

按批次清单里「导入 = 是」的行，依次：
    制度（按制度编号找；清单里没有编号的按名称找；都找不到就新建为草稿）→ 版本（按制度 + 版本号找，没有就新建为草稿）
    → 版本文档（按 类型 + 序号 找：没有就上传文件并新建；内容哈希或正文变了就更新；一样就跳过）
    上传的文件是导入包里有的 附件N.docx（及 正文.docx）：默认正文不传文件、附件传脱敏后的 docx，见 package --files。
    导入包里没有文件的文档，系统里原有的文件会被去掉。
规则：
    - 同一批导两次，结果不变（全部跳过）；
    - 版本已是「现行」而内容有变化（文档增减、正文、标题或分类不同）：整行拒绝，请用新版本号导入；
      只是上传的文件变了（如正文不再上传 docx）可以更新；
    - 只读导入包；路径里有「内部留存」的一律拒绝；
    - 制度名称、版本号缺任何一项，这一行拒绝；制度编号、生效日期可以为空（原文没有就不填，导入后在页面上补；空值不会覆盖页面上补的）；
    - 导入的版本都是草稿；核对后由管理员在系统里设为现行。
认证（三选一）：
    --login                    运行时输入账号、密码登录（推荐；密码不回显、不保存）。上传文件只认登录会话；
    BRIGHTRULE_TOKEN           登录会话令牌（Authorization: Bearer）；
    BRIGHTRULE_API_KEY         API Key（x-api-key）：只能查询和写记录，平台的文件上传不认 API Key，有文件要传时请用 --login。
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
DOC_FIELDS = 'id,doc_kind,sort_no,attachment_class,title,content_hash,body_md_redacted,original_file'
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


class ApiError(Exception):
    pass


class AuthError(ApiError):
    """401：凭证不被接受。继续跑下去每一行都会同样失败，所以整批停下。"""


class Api:
    def __init__(self, base: str, timeout: int = 60, login: bool = False):
        self.base = base.rstrip('/')
        self.timeout = timeout
        self.headers = {'user-agent': 'brightrule-import/1.0'}
        self.mode = ''
        key, token = os.environ.get('BRIGHTRULE_API_KEY'), os.environ.get('BRIGHTRULE_TOKEN')
        if login:
            self.sign_in()
        elif token:
            self.headers['authorization'] = f'Bearer {token}'
            self.mode = 'session'
        elif key:
            self.headers['x-api-key'] = key
            self.mode = 'api_key'
        else:
            raise SystemExit('请加 --login（运行时输入账号密码），或设置环境变量 BRIGHTRULE_TOKEN / BRIGHTRULE_API_KEY。'
                             '不要把密码或 Key 写在命令或文件里。')

    def sign_in(self) -> None:
        email = os.environ.get('BRIGHTRULE_EMAIL') or input('登录邮箱：').strip()
        password = getpass.getpass('密码（不回显）：')
        req = urllib.request.Request(self.base + '/api/v1/auth/sign-in/email', method='POST',
                                     data=json.dumps({'email': email, 'password': password}).encode(),
                                     headers={**self.headers, 'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                body = json.loads(r.read().decode('utf-8', 'replace') or '{}')
                token = r.headers.get('set-auth-token') or body.get('token') or (body.get('data') or {}).get('token')
                cookies = [c.split(';', 1)[0] for c in r.headers.get_all('set-cookie') or []]
        except urllib.error.HTTPError as e:
            raise SystemExit(f'登录失败（{e.code}）：请检查邮箱和密码。') from None
        except urllib.error.URLError as e:
            raise SystemExit(f'连不上 {self.base}：{e.reason}') from None
        if token:
            self.headers['authorization'] = f'Bearer {token}'
        if cookies:
            self.headers['cookie'] = '; '.join(cookies)
        if not token and not cookies:
            raise SystemExit('登录接口没有返回会话，无法继续。')
        self.mode = 'session'
        print(f'已登录：{email}')

    def call(self, method: str, path: str, body=None, raw: Optional[bytes] = None, content_type: Optional[str] = None):
        url = path if path.startswith('http') else self.base + path
        headers = dict(self.headers)
        data = None
        if raw is not None:
            data, headers['content-type'] = raw, content_type or 'application/octet-stream'
        elif body is not None:
            data, headers['content-type'] = json.dumps(body).encode(), 'application/json'
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                text = r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:300]
            if e.code == 401:
                raise AuthError(f'{method} {path} → 401 {detail}') from None
            raise ApiError(f'{method} {path} → {e.code} {detail}') from None
        except urllib.error.URLError as e:
            raise ApiError(f'连不上 {self.base}：{e.reason}') from None
        return json.loads(text) if text.strip() else {}

    def find(self, obj: str, where: Dict[str, object], select: Optional[str] = None) -> List[Dict]:
        q = {'filter': json.dumps(where, ensure_ascii=False), 'top': '200'}
        if select:
            q['select'] = select
        return self.call('GET', f'/api/v1/data/{obj}?' + urllib.parse.urlencode(q)).get('records', [])

    def create(self, obj: str, row: Dict) -> Dict:
        r = self.call('POST', f'/api/v1/data/{obj}', row)
        return r.get('record') or r.get('data') or r

    def update(self, obj: str, rid: str, row: Dict) -> Dict:
        return self.call('PATCH', f'/api/v1/data/{obj}/{rid}', row)

    def delete(self, obj: str, rid: str) -> None:
        self.call('DELETE', f'/api/v1/data/{obj}/{rid}')

    def upload(self, data: bytes, filename: str, mime: str = DOCX_MIME) -> str:
        pre = self.call('POST', '/api/v1/storage/upload/presigned', {'filename': filename, 'mimeType': mime, 'size': len(data)})
        pre = pre.get('data', pre)
        target = pre['uploadUrl'] if pre['uploadUrl'].startswith('http') else self.base + pre['uploadUrl']
        put_headers = pre.get('headers') or {'content-type': mime}
        req = urllib.request.Request(target, data=data, method=pre.get('method', 'PUT'),
                                     headers={**({k: v for k, v in self.headers.items()} if target.startswith(self.base) else {}),
                                              **put_headers})
        try:
            urllib.request.urlopen(req, timeout=self.timeout).read()
        except urllib.error.HTTPError as e:
            raise ApiError(f'上传 {filename} 失败：{e.code} {e.read().decode("utf-8", "replace")[:200]}') from None
        self.call('POST', '/api/v1/storage/upload/complete', {'fileId': pre['fileId']})
        return pre['fileId']

    def category_options(self) -> List[Tuple[str, str]]:
        try:
            meta = self.call('GET', '/api/v1/meta/object/brightrule_policy')
            meta = meta.get('item', meta.get('data', meta))
            return [(o['value'], o['label']) for o in meta['fields']['category'].get('options') or []]
        except (ApiError, KeyError):
            return []


# ── 计划 ──────────────────────────────────────────────────────────────────
@dataclass
class RowPlan:
    folder: str
    policy_no: str
    title: str
    version_no: str
    actions: List[str] = field(default_factory=list)
    rejected: Optional[str] = None
    notes: List[str] = field(default_factory=list)
    steps: List[Tuple] = field(default_factory=list)   # 写入时执行
    policy_id: Optional[str] = None    # 预演时找到的已有记录
    version_id: Optional[str] = None


def read_sheet(package: Path) -> List[Dict[str, str]]:
    with (package / '批次清单.csv').open(encoding='utf-8-sig') as f:
        return [{k.strip(): (v or '').strip() for k, v in row.items()} for row in csv.DictReader(f)]


def _category_core(text: str) -> str:
    """「经营管理类」「经营类」→「经营」：去掉末尾的「类」「管理类」「监管类」和空白后再比。"""
    return re.sub(r'(?:管理|监管)?类$', '', re.sub(r'\s', '', text or ''))


def map_category(text: str, options: List[Tuple[str, str]]) -> Optional[str]:
    """批次清单里的类别文字 → 系统选项值：先比完全相同，再比去掉「（管理）类」后的核心词，最后比包含关系（取最长的）。"""
    if not text:
        return None
    for value, label in options:
        if text in (label, value):
            return value
    core = _category_core(text)
    for value, label in options:
        if core and core == _category_core(label):
            return value
    hits = [(len(_category_core(label)), value) for value, label in options
            if _category_core(label) and (_category_core(label) in core or core in _category_core(label))]
    return max(hits)[1] if hits else None


POLICY_SELECT = 'id,title,policy_no,department,issuing_unit,category,status'


def find_policies(api: Api, policy_no: str, title: str) -> Tuple[List[Dict], str]:
    """批次清单一行对应的系统制度：有制度编号按编号找；没有按名称找（编号、生效日期可以之后在页面上补，
    补过的不会被清空，再导入也还能对上）。返回找到的记录和用于提示重复的说明。"""
    if policy_no:
        return api.find('brightrule_policy', {'policy_no': policy_no}, POLICY_SELECT), f'制度编号都是 {policy_no}'
    return api.find('brightrule_policy', {'title': title}, POLICY_SELECT), f'名称都是「{title}」'


def open_package(path: Path) -> Path:
    """检查 --package：必须是 package.py 生成的导入包，不能是脱敏结果或内部留存。"""
    package = path.resolve()
    if '内部留存' in str(package):
        raise SystemExit('拒绝：导入只读导入包，不读「内部留存-勿外发」。')
    if not (package / '批次清单.csv').exists():
        if package.name == '脱敏文件' or (package / '脱敏文件').is_dir():
            raise SystemExit(f'这是脱敏结果，不是导入包：先运行 ./run.sh package --run <脱敏结果/时间>，'
                             f'再把它生成的「导入包/<时间>」目录交给 --package。（{path}）')
        raise SystemExit(f'不是导入包（没有 批次清单.csv）：{path}')
    return package


def plan_row(api: Api, package: Path, row: Dict[str, str], options: List[Tuple[str, str]]) -> RowPlan:
    rp = RowPlan(row.get('包内目录', ''), row.get('制度编号', ''), row.get('制度名称', ''), row.get('版本号', ''))
    missing = [k for k in ('制度名称', '版本号') if not row.get(k)]
    if missing:
        rp.rejected = '批次清单缺 ' + '、'.join(missing)
        return rp
    effective = row.get('生效日期') or None
    if effective and not DATE.match(effective):
        rp.rejected = f'生效日期「{row["生效日期"]}」不是 YYYY-MM-DD'
        return rp
    folder = package / rp.folder
    try:
        manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    except FileNotFoundError:
        rp.rejected = f'导入包里没有 {rp.folder}/manifest.json'
        return rp

    policy_fields = {'title': row['制度名称']}
    if rp.policy_no:
        policy_fields['policy_no'] = rp.policy_no
    for col, key in (('归口部门', 'department'), ('发文单位', 'issuing_unit')):
        if row.get(col):
            policy_fields[key] = row[col]
    if row.get('制度类别'):
        cat = map_category(row['制度类别'], options)
        if cat:
            policy_fields['category'] = cat
        else:
            rp.notes.append(f'制度类别「{row["制度类别"]}」不在系统的选项里，没有填')

    found, key = find_policies(api, rp.policy_no, rp.title)
    if not rp.policy_no:
        rp.notes.append('没有制度编号，按制度名称对应；导入后可在页面上补')
    policy = found[0] if found else None
    if len(found) > 1:
        rp.rejected = f'系统里有 {len(found)} 份制度{key}，请先处理重复'
        return rp
    if policy is not None:
        rp.policy_id = policy['id']
    if policy is None:
        rp.actions.append('新建制度（草稿）')
        rp.steps.append(('create_policy', {**policy_fields, 'status': 'draft',
                                           **({'effective_date': effective} if effective else {})}))
    else:
        changed = {k: v for k, v in policy_fields.items() if policy.get(k) != v}
        if changed:
            rp.actions.append('更新制度：' + '、'.join(changed))
            rp.steps.append(('update_policy', policy['id'], changed))
        else:
            rp.actions.append('制度已存在，不变')

    version = None
    if policy is not None:
        vs = api.find('brightrule_policy_version', {'policy': policy['id'], 'version_no': rp.version_no},
                      'id,title,version_no,version_status,effective_date')
        version = vs[0] if vs else None
        rp.version_id = version['id'] if version else None
    if version is None:
        rp.actions.append(f'新建版本 {rp.version_no}（草稿）')
        rp.steps.append(('create_version', {'title': f'{rp.title} {rp.version_no}', 'version_no': rp.version_no,
                                            'version_status': 'draft',
                                            **({'effective_date': effective} if effective else {}),
                                            **({'change_note': f'导入批次 {package.name}'})}))
    existing: Dict[Tuple[str, int], Dict] = {}
    if version is not None:
        for d in api.find('brightrule_policy_document', {'policy_version': version['id']}, DOC_FIELDS):
            existing[(d.get('doc_kind'), int(d.get('sort_no') or 0))] = d
    is_current = bool(version and version.get('version_status') == 'current')

    doc_changes = []
    content_changed = False      # 文字、标题、分类、文档增减；只换文件（如不再上传正文 docx）不算
    seen = set()
    for doc in manifest['documents']:
        key = (doc['doc_kind'], int(doc['sort_no']))
        seen.add(key)
        md = (folder / doc['md']).read_text(encoding='utf-8') if doc.get('md') else None
        fields = {'title': doc['title'], 'doc_kind': doc['doc_kind'], 'sort_no': doc['sort_no'],
                  'body_md_redacted': md, 'article_index': doc.get('article_index'),
                  'has_text': doc['has_text'], 'text_chars': doc['text_chars'], 'text_tokens': doc['text_tokens'],
                  'content_hash': doc['content_hash']}
        if doc['doc_kind'] == 'attachment':
            fields['attachment_class'] = doc.get('attachment_class')
        label = '正文' if doc['doc_kind'] == 'body' else f"附件{doc['sort_no']}"
        name = doc.get('file') or doc.get('original')   # 不传文件的正文（package 默认）没有
        file_path = folder / name if name else None
        cur = existing.get(key)
        if cur is None:
            doc_changes.append(label + '：新建')
            content_changed = True
            rp.steps.append(('create_doc', fields, file_path))
            continue
        same_file = cur.get('content_hash') == doc['content_hash'] and (file_path is not None or not cur.get('original_file'))
        same_text = (cur.get('body_md_redacted') or None) == md
        same_meta = cur.get('title') == doc['title'] and cur.get('attachment_class') == fields.get('attachment_class')
        if same_file and same_text and same_meta:
            continue
        what = [w for w, ok in (('文件' if file_path else '去掉文件', same_file), ('脱敏正文', same_text),
                                ('标题或分类', same_meta)) if not ok]
        doc_changes.append(f'{label}：更新' + '、'.join(what))
        content_changed = content_changed or not (same_text and same_meta)
        if file_path is None and cur.get('original_file'):
            fields['original_file'] = None
        rp.steps.append(('update_doc', cur['id'], fields, None if same_file else file_path))
    extra = [k for k in existing if k not in seen]
    if extra:
        rp.notes.append('系统里还有导入包没有的文档：' + '、'.join('正文' if k[0] == 'body' else f'附件{k[1]}' for k in extra) + '（不删除）')
    if is_current and (content_changed or extra):
        rp.rejected = f'版本 {rp.version_no} 已是现行，内容有变化（{"；".join(doc_changes) or "文档增减"}）。请用新的版本号导入。'
        rp.steps = []
        return rp
    if doc_changes:
        rp.actions += doc_changes
    elif version is not None:
        rp.actions.append('版本文档全部一致，跳过')
    return rp


def apply_row(api: Api, rp: RowPlan) -> None:
    policy_id, version_id = rp.policy_id, rp.version_id
    for step in rp.steps:
        kind = step[0]
        if kind == 'create_policy':
            policy_id = api.create('brightrule_policy', step[1])['id']
        elif kind == 'update_policy':
            api.update('brightrule_policy', step[1], step[2])
            policy_id = step[1]
        elif kind == 'create_version':
            version_id = api.create('brightrule_policy_version', {**step[1], 'policy': policy_id})['id']
        elif kind in ('create_doc', 'update_doc'):
            fields = dict(step[1] if kind == 'create_doc' else step[2])
            original = step[2] if kind == 'create_doc' else step[3]
            if original is not None:
                fields['original_file'] = api.upload(Path(original).read_bytes(), f"{fields['title']}.docx")
            if kind == 'create_doc':
                api.create('brightrule_policy_document', {**fields, 'policy_version': version_id})
            else:
                api.update('brightrule_policy_document', step[1], fields)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='把导入包写进 BrightRule 系统')
    ap.add_argument('--package', required=True, type=Path, help='package.py 生成的导入包目录：导入包/<时间>')
    ap.add_argument('--url', required=True, help='系统地址，如 https://xxx.objectos.ai')
    ap.add_argument('--apply', action='store_true', help='真正写入；不加只预演')
    ap.add_argument('--login', action='store_true', help='运行时输入账号密码登录（上传文件需要登录会话）')
    args = ap.parse_args(argv)
    package = open_package(args.package)
    api = Api(args.url, login=args.login)
    options = api.category_options()
    rows = [r for r in read_sheet(package) if r.get('导入', '是') == '是']
    print(('写入' if args.apply else '预演（不写入）') + f'：{len(rows)} 份制度 → {args.url}')
    plans: List[RowPlan] = []
    for row in rows:
        try:
            rp = plan_row(api, package, row, options)
        except AuthError as e:
            raise SystemExit(f'凭证被拒绝，整批停止：{e}\n请用 --login（输入账号密码）或检查 BRIGHTRULE_TOKEN / BRIGHTRULE_API_KEY。')
        except ApiError as e:
            rp = RowPlan(row.get('包内目录', ''), row.get('制度编号', ''), row.get('制度名称', ''), row.get('版本号', ''),
                         rejected=f'查询系统失败：{e}')
        if args.apply and not rp.rejected and rp.steps:
            try:
                apply_row(api, rp)
            except AuthError as e:
                print(f'  ✗ {rp.folder}\n      写入中断：{e}')
                hint = ('API Key 不能上传文件：请改用 --login（输入账号密码）重跑。' if api.mode == 'api_key'
                        else '登录已失效或没有权限：请重新 --login 后重跑。')
                raise SystemExit(f'凭证被拒绝，整批停止。{hint}已写入的部分保留，重跑会接着做，不会重复。')
            except ApiError as e:
                rp.rejected = f'写入中断：{e}（已写入的部分保留；修正后重跑会接着做）'
        plans.append(rp)
        mark = '✗' if rp.rejected else ('·' if not rp.steps else '✓')
        print(f'  {mark} {rp.folder}  {rp.policy_no} {rp.version_no}')
        for a in ([f'拒绝：{rp.rejected}'] if rp.rejected else rp.actions) + rp.notes:
            print(f'      {a}')
    write_report(package, plans, args)
    todo = [p for p in plans if p.steps and not p.rejected]
    rej = [p for p in plans if p.rejected]
    print(f'{"已写入" if args.apply else "将写入"} {len(todo)} 份，无变化 {len(plans) - len(todo) - len(rej)} 份，拒绝 {len(rej)} 份。')
    uploads = any(st[0] in ('create_doc', 'update_doc') for p in todo for st in p.steps)
    if not args.apply and todo:
        if uploads and api.mode == 'api_key':
            print('注意：要上传文件，而平台的文件上传不认 API Key。写入时请用 --login（输入账号密码）。')
        print('确认无误后，在命令末尾加 --apply 写入' + ('（并加 --login）' if uploads and api.mode == 'api_key' else '') + '。')
    if args.apply and todo:
        print('导入的版本是草稿：请在系统里核对后，把版本状态改为「现行」，员工才能看到、问到。')
    return 1 if rej else 0


def write_report(package: Path, plans: List[RowPlan], args) -> None:
    stamp = _dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    lines = [f'# 导入{"" if args.apply else "预演"}报告', '', f'- 时间：{stamp}', f'- 系统：{args.url}', '']
    for p in plans:
        lines.append(f'## {p.folder}（{p.policy_no} {p.version_no}）— {"拒绝" if p.rejected else ("写入" if p.steps else "无变化")}')
        lines += [f'- {a}' for a in ([p.rejected] if p.rejected else p.actions) + p.notes] + ['']
    (package / f'导入{"" if args.apply else "预演"}报告-{stamp}.md').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
