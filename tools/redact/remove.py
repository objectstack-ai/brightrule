#!/usr/bin/env python3
"""删除制度：连同它的正文、制度附件、条款一起删掉。在本机运行，经系统的 HTTPS 接口删除。

系统不允许直接删还有条款的制度（页面上删会提示失败），这个命令按「条款 → 制度（正文在制度上，制度附件随制度删除）」
的顺序删。

用法：
    python3 remove.py --url https://<系统地址> --package 导入包/<时间>              # 预演：删除这个导入包导入的全部制度
                                                                               #（有 导入记录.json 就按记录的制度 id 删，只删这个包新建的）
    python3 remove.py --url https://<系统地址> --login --samples                    # 预演：删除系统自带的 5 份示例制度
    python3 remove.py --url https://<系统地址> --login --policy-no HM-XX-01 --title 某某办法   # 预演：按编号或名称指定
    … 末尾加 --apply 才真正删除。删除不可恢复；导入包还在的话，重跑 import 可以再导入。
"""
from __future__ import annotations

import argparse
import sys
from typing import Dict, List, Optional, Sequence

from pathlib import Path

from importer import (Api, ApiError, AuthError, Progress, find_policies, load_record, open_package, read_sheet,
                      save_record)

# 开发环境自带的示例制度（虚构，src/data/seed.ts），按制度编号删
SAMPLE_POLICY_NOS = ['FIN-001', 'HR-002', 'IT-003', 'CMP-004', 'CMP-005']


def targets(api: Api, policy_nos: List[str], titles: List[str]) -> List[Dict]:
    found: Dict[str, Dict] = {}
    for key, values in (('policy_no', policy_nos), ('title', titles)):
        for v in values:
            rows = api.find('brightrule_policy', {key: v}, 'id,title,policy_no,status')
            if not rows:
                print(f'  · 找不到{"制度编号" if key == "policy_no" else "名称为"} {v} 的制度，跳过')
            for r in rows:
                found[r['id']] = r
    return list(found.values())


def package_targets(api: Api, package: Path, apply: bool, record: Dict[str, Dict]) -> List[Dict]:
    """导入包批次清单里「导入 = 是」的每一行要删的东西。
    有导入记录（import --apply 留下的）：直接按 id——这个包新建的制度整份删；原来就有、这个包只更新了的，不删。
    没有记录的行：和 import 的对应规则相同找制度（有编号按编号，没有按名称），整份删。"""
    found: Dict[str, Dict] = {}
    sheet = [r for r in read_sheet(package) if r.get('导入', '是') == '是']
    by_record = [r for r in sheet if r.get('包内目录', '') in record]
    sheet = [r for r in sheet if r.get('包内目录', '') not in record]
    if by_record:
        print(f'按导入记录直接取 {len(by_record)} 份：')
        for row in by_record:
            folder = row['包内目录']
            e = record[folder]
            target = {'id': e['policy_id'], 'title': e.get('title'), 'policy_no': row.get('制度编号'), '_folder': folder}
            if not e.get('created_policy'):
                print(f'  · {folder}：制度原来就有，这个包只更新了它，不删（要删请用 --policy-no / --title 指定），跳过')
                record.pop(folder, None)
                continue
            found[target['id']] = target
    if not sheet:
        print(f'共 {len(found)} 份，开始{"删除" if apply else "列出"}：')
        return list(found.values())
    print(f'在系统里查找没有导入记录的 {len(sheet)} 份制度：')
    looking = Progress(len(sheet))
    for row in sheet:
        print(f'{looking.next()} 查找 {row.get("包内目录", "")}')
        rows, key = find_policies(api, row.get('制度编号', ''), row.get('制度名称', ''))
        if not rows:
            print(f'  · 系统里没有 {row.get("包内目录")}，跳过')
        elif len(rows) > 1:
            print(f'  ✗ 系统里有 {len(rows)} 份制度{key}，分不清是哪份，跳过：{row.get("包内目录")}')
        else:
            found[rows[0]['id']] = rows[0]
    print(f'找到 {len(found)} 份，开始{"删除" if apply else "列出"}：')
    return list(found.values())


def plan(api: Api, policy: Dict) -> List[tuple]:
    """删除顺序：条款（挂在制度上，限制删除）→ 制度（制度附件随之删除）。"""
    if policy.get('_folder') and not api.find('brightrule_policy', {'id': policy['id']}, 'id'):
        print(f'  {policy.get("title")}：已经不在系统里，跳过')
        return []
    clauses = api.find('brightrule_clause', {'policy': policy['id']}, 'id')
    atts = api.find('brightrule_policy_attachment', {'policy': policy['id']}, 'id')
    print(f'  {policy.get("title")}（{policy.get("policy_no") or "无编号"}）：附件 {len(atts)} 个、条款 {len(clauses)} 条')
    return [('brightrule_clause', c['id']) for c in clauses] + [('brightrule_policy', policy['id'])]


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description='删除制度及其正文、制度附件、条款')
    ap.add_argument('--url', required=True, help='系统地址')
    ap.add_argument('--package', type=Path, help='删除这个导入包（导入包/<时间>）导入的全部制度')
    ap.add_argument('--samples', action='store_true', help='删除开发环境自带的 5 份示例制度')
    ap.add_argument('--policy-no', action='append', default=[], help='要删的制度编号，可写多次')
    ap.add_argument('--title', action='append', default=[], help='要删的制度名称（完全一致），可写多次')
    ap.add_argument('--apply', action='store_true', help='真正删除；不加只预演')
    ap.add_argument('--login', action='store_true', help='运行时输入账号密码登录')
    args = ap.parse_args(argv)
    nos = args.policy_no + (SAMPLE_POLICY_NOS if args.samples else [])
    if not nos and not args.title and not args.package:
        raise SystemExit('请用 --package、--samples、--policy-no 或 --title 指定要删的制度。')
    package = open_package(args.package) if args.package else None
    api = Api(args.url, login=args.login)
    record = load_record(package, args.url) if package else {}
    print(('删除' if args.apply else '预演（不删除）') + f' → {args.url}')
    try:
        policies = targets(api, nos, args.title)
        if package:
            seen = {p['id'] for p in policies}
            policies += [p for p in package_targets(api, package, args.apply, record) if p['id'] not in seen]
        failed = 0
        progress = Progress(len(policies))
        for p in policies:
            print(progress.next(), end='')
            try:
                steps = plan(api, p)
                if not args.apply:
                    continue
                for obj, rid in steps:
                    api.delete(obj, rid)
                if steps:
                    print('      已删除')
                if p.get('_folder'):
                    record.pop(p['_folder'], None)
                    save_record(package, args.url, record)
            except ApiError as e:
                if isinstance(e, AuthError):
                    raise
                failed += 1
                print(f'      失败：{e}（重跑会接着删）')
    except AuthError as e:
        raise SystemExit(f'凭证被拒绝，停止：{e}\n请用 --login（输入账号密码）重跑。')
    finally:
        if package and args.apply:
            save_record(package, args.url, record)   # 删掉的、本来就不在系统里的，从记录里去掉
    print(f'{"已删除" if args.apply else "将删除"} {len(policies) - failed} 份制度' + (f'，失败 {failed} 份' if failed else '') + '。')
    if not args.apply and policies:
        print('确认无误后，在命令末尾加 --apply 删除。删除不可恢复。')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
