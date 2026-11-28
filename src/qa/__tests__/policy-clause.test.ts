import { describe, it, expect } from 'vitest';
import { CLAUSE_SYNC_SOURCE } from '../policy-clause.hook.js';

const run = new Function('ctx', `return (async (ctx) => {${CLAUSE_SYNC_SOURCE}})(ctx)`) as (ctx: unknown) => Promise<void>;

function fakeCtx(policy: Record<string, unknown>, attachments: Record<string, unknown>[], existing: { id: string; seq: number }[] = []) {
  const writes = { inserted: [] as any[], updated: [] as any[], deleted: [] as string[] };
  const api = {
    object: (name: string) => ({
      find: async (q: any) => (name === 'brightrule_policy_clause' ? existing : attachments.filter((a) => a.policy === q.where.policy)),
      findOne: async () => (name === 'brightrule_policy' ? policy : { id: 'u1', name: '某单位' }),
      insert: async (r: any) => { writes.inserted.push(r); },
      update: async (r: any) => { writes.updated.push(r); },
      delete: async (q: any) => { writes.deleted.push(...q.where.id.$in); },
    }),
  };
  return { ctx: { object: 'brightrule_policy', event: 'afterInsert', result: { id: policy.id }, input: {}, api }, writes };
}

const BODY = ['# 某制度', '## 第一章 总则', '**第一条** 为规范管理，制定本办法。', '**第二条** 标准见下表。', '', '| 类别 | 标准 |', '|---|---|', '| 甲 | 100 |', '', '注：甲类指某类情形。', '## 第二章 附则', '**第三条** 本办法自发布之日起施行。'].join('\n');

describe('制度条款同步', () => {
  it('cuts one clause per article, keeps a table and its note with its article, prefixes unit and policy', async () => {
    const { ctx, writes } = fakeCtx({ id: 'p1', title: '某制度', status: 'published', owning_unit: 'u1', body_md: BODY }, []);
    await run(ctx);
    expect(writes.inserted.map((r) => r.title)).toEqual(['第一条', '第二条', '第三条']);
    const second = writes.inserted[1].content as string;
    expect(second.startsWith('【某单位｜某制度】某制度 > 第一章 总则 > 第二条')).toBe(true);
    expect(second).toContain('| 甲 | 100 |');
    expect(second).toContain('注：甲类指某类情形。');
  });

  it('splits an attachment at a table whose first cell names another attachment', async () => {
    const att = { policy: 'p1', label: '附件1', title: '甲表', sort_no: 1, body_md: ['# 附件1：甲表', '| 项目 | 内容 |', '|---|---|', '| 名称 | 某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某 |', '', '| # 附件2<br>乙表 |  |', '|---|---|', '| 申报单位 | 某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某某 |'].join('\n') };
    const { ctx, writes } = fakeCtx({ id: 'p1', title: '某制度', status: 'published', owning_unit: 'u1', body_md: BODY }, [att]);
    await run(ctx);
    const labels = writes.inserted.filter((r) => r.origin === 'attachment').map((r) => r.attachment_label);
    expect(labels).toContain('附件1');
    expect(labels).toContain('附件2');
  });

  it('updates in place, inserts the new tail and deletes the leftover tail', async () => {
    const existing = [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, seq: n }));
    const { ctx, writes } = fakeCtx({ id: 'p1', title: '某制度', status: 'published', owning_unit: 'u1', body_md: BODY }, [], existing);
    await run(ctx);
    expect(writes.updated.map((r) => r.id)).toEqual(['c1', 'c2', 'c3']);
    expect(writes.inserted).toHaveLength(0);
    expect(writes.deleted).toEqual(['c4', 'c5']);
  });

  it('clears the clauses of a policy that is not published', async () => {
    const { ctx, writes } = fakeCtx({ id: 'p1', title: '某制度', status: 'draft', owning_unit: 'u1', body_md: BODY }, [], [{ id: 'c1', seq: 1 }]);
    await run(ctx);
    expect(writes.inserted).toHaveLength(0);
    expect(writes.deleted).toEqual(['c1']);
  });
});
