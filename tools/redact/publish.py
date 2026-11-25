#!/usr/bin/env python3
"""发布：把一个导入包导入的草稿版本批量设为「现行」。在本机运行，经系统的 HTTPS 接口写入。

用法：
    python3 publish.py --package 导入包/<时间> --url https://<系统地址> --login            # 预演：只列计划
    python3 publish.py --package 导入包/<时间> --url https://<系统地址> --login --apply    # 写入

按批次清单里「导入 = 是」的行（不想发布的行，把「导入」改成「否」，或在系统里单独处理），找到导入时建的版本：
    - 草稿 → 设为现行。系统随之把这个版本的文档设为现行、把同一制度原来的现行版本改为已失效、
      草稿制度改为已发布；员工从此能看到、问到；
    - 已是现行 → 跳过；已失效 → 不动（不会把旧版本重新设为现行）；
    - 系统里的文档比导入包少（导入没做完）→ 拒绝，先重跑 import。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from importer import Api, ApiError, AuthError, Progress, find_policies, open_package, read_sheet


def plan(api: Api, package: Path, row: Dict[str, str]) -> Tuple[str, str, Optional[str]]:
    """返回（标记, 说明, 要设为现行的版本 id）。标记：✓ 将发布、· 不用动、✗ 拒绝。"""
    found, key = find_policies(api, row.get('制度编号', ''), row.get('制度名称', ''))
    if not found:
        return '✗', '系统里找不到这份制度：先运行 import', None
    if len(found) > 1:
        return '✗', f'系统里有 {len(found)} 份制度{key}，请先处理重复', None
    policy = found[0]
    vs = api.find('brightrule_policy_version', {'policy': policy['id'], 'version_no': row.get('版本号', '')},
                  'id,version_no,version_status')
    if not vs:
        return '✗', f'系统里找不到版本 {row.get("版本号")}：先运行 import', None
    version = vs[0]
    status = version.get('version_status')
    if status == 'current':
        return '·', '已是现行', None
    if status == 'superseded':
        return '·', '已失效（有更新的版本），不动', None
    try:
        expected = len(json.loads((package / row.get('包内目录', '') / 'manifest.json').read_text(encoding='utf-8'))['documents'])
    except (FileNotFoundError, KeyError, ValueError):
        return '✗', '导入包里没有 manifest.json', None
    docs = api.find('brightrule_policy_document', {'policy_version': version['id']}, 'id,doc_kind')
    if not any(d.get('doc_kind') == 'body' for d in docs) or len(docs) < expected:
        return '✗', f'系统里只有 {len(docs)} 个文档，导入包有 {expected} 个：导入没做完，先重跑 import', None
    others = api.find('brightrule_policy_version', {'policy': policy['id'], 'version_status': 'current'}, 'version_no')
    note = '草稿 → 现行' + (f'；原现行版本 {others[0].get("version_no")} 将改为已失效' if others else '')
    return '✓', note, version['id']


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='把导入包导入的草稿版本批量设为现行')
    ap.add_argument('--package', required=True, type=Path, help='导入用的那个导入包：导入包/<时间>')
    ap.add_argument('--url', required=True, help='系统地址，如 https://xxx.objectos.ai')
    ap.add_argument('--apply', action='store_true', help='真正写入；不加只预演')
    ap.add_argument('--login', action='store_true', help='运行时输入账号密码登录')
    args = ap.parse_args(argv)
    package = open_package(args.package)
    api = Api(args.url, login=args.login)
    rows = [r for r in read_sheet(package) if r.get('导入', '是') == '是']
    print(('发布' if args.apply else '预演（不写入）') + f'：{len(rows)} 份制度 → {args.url}')
    counts = {'✓': 0, '·': 0, '✗': 0}
    progress = Progress(len(rows))
    for row in rows:
        try:
            mark, note, vid = plan(api, package, row)
            if args.apply and vid:
                api.update('brightrule_policy_version', vid, {'version_status': 'current'})
        except AuthError as e:
            raise SystemExit(f'凭证被拒绝，整批停止：{e}\n请用 --login（输入账号密码）重跑；已发布的不受影响。')
        except ApiError as e:
            mark, note = '✗', f'失败：{e}（重跑会接着做）'
        counts[mark] += 1
        print(f'{progress.next()} {mark} {row.get("包内目录", "")}  {row.get("版本号", "")}\n      {note}')
    print(f'{"已发布" if args.apply else "将发布"} {counts["✓"]} 份，不用动 {counts["·"]} 份，拒绝 {counts["✗"]} 份。')
    if not args.apply and counts['✓']:
        print('确认无误后，在命令末尾加 --apply 发布。发布后员工即可看到、问到。')
    return 1 if counts['✗'] else 0


if __name__ == '__main__':
    sys.exit(main())
