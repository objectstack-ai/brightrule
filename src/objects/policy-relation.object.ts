import { ObjectSchema, Field } from '@objectstack/spec/data';

/**
 * 制度关系 — one link from a policy VERSION to another policy: the version
 * rests on it (依据), cites it (引用), is supplemented by it (配套) or replaces
 * it (替代 / 废止) (brightrule#23).
 *
 * The master is the version (`from_version`), not the policy: two versions of
 * one policy may cite different policies; once employees see only the current
 * version (brightrule#10) its relations follow it through the parent; deleting
 * a version deletes its relations. `from_policy` is kept for querying by
 * policy, and is filled from the version by the relation hook
 * (src/qa/version-current.hook.ts), which also refuses a link to the version's
 * own policy and a second identical link from the same version.
 *
 * A policy outside the library (a law, a rule not imported) is recorded too:
 * `to_policy` stays empty and `to_title` names it. There is no 「冲突」 type: a
 * conflict is a diagnosis, not something to show employees. 「替代」 is only
 * recorded — confirming it does not abolish the target policy.
 *
 * `from_policy` and `to_title` are filled by the hook and are therefore not
 * `readonly`: the platform strips a readonly field from every non-system
 * write, and the hook's writes are not system writes (as for 版本文档).
 */
export const PolicyRelation = ObjectSchema.create({
  name: 'brightrule_policy_relation',
  sharingModel: 'controlled_by_parent',
  label: '制度关系',
  pluralLabel: '制度关系',
  icon: 'link',
  nameField: 'to_title',
  description: '制度版本与其他制度之间的依据、引用、配套、替代关系（含库外制度）',

  searchableFields: ['to_title'],

  fieldGroups: [
    { key: 'basic', label: '关系' },
    { key: 'review', label: '确认' },
  ],

  fields: {
    from_version: Field.masterDetail('brightrule_policy_version', {
      label: '出自版本',
      required: true,
      group: 'basic',
      deleteBehavior: 'cascade',
    }),
    from_policy: Field.lookup('brightrule_policy', {
      label: '出自制度',
      group: 'basic',
      description: '由出自版本自动带出',
    }),
    relation_type: Field.select({
      label: '关系类型',
      required: true,
      group: 'basic',
      options: [
        { label: '依据', value: 'basis' },
        { label: '引用', value: 'cites' },
        { label: '配套', value: 'supplements' },
        { label: '替代 / 废止', value: 'supersedes' },
      ],
    }),
    to_policy: Field.lookup('brightrule_policy', {
      label: '对方制度',
      group: 'basic',
      description: '库外制度（如法律法规、未入库的制度）留空，只填对方名称',
    }),
    to_title: Field.text({
      label: '对方名称',
      required: true,
      maxLength: 200,
      group: 'basic',
      description: '如《费用报销管理规定》；选了对方制度而未填名称时自动带出',
    }),
    from_articles: Field.text({
      label: '出现条款',
      maxLength: 200,
      group: 'basic',
      description: '出现在本版本的哪几条，如「第三条、第十四条」',
    }),

    confirmed: Field.boolean({
      label: '已确认',
      defaultValue: false,
      group: 'review',
      description: '未确认的关系员工看不到，也不作依据',
    }),
    source: Field.select({
      label: '来源',
      group: 'review',
      options: [
        { label: '导入抽取', value: 'extracted' },
        { label: '手工', value: 'manual', default: true },
      ],
    }),
  },
});
