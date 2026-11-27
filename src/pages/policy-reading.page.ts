import { definePage } from '@objectstack/spec/ui';

/**
 * 制度阅读页 — 打开一份制度时看到的页面（2026-11-27）。
 *
 * 平台默认的记录页把字段和相关列表左右各占一半，正文挤在左栏一大串字段下面。
 * 这里改成整宽、以读正文为主：
 * - 标题栏（含「问这份制度」「编辑」等按钮）下面一行要紧信息：文号、所属单位、
 *   分类、层级、生效日期；
 * - 页签默认打开「正文」，正文占整宽、单栏；
 * - 附件、全部字段（制度信息）、下级制度、制度意见各在一个页签里。
 *
 * `kind: 'full'`：页面只渲染这里声明的节点，相关列表因此要自己放回来。
 */
export const PolicyReadingPage = definePage({
  name: 'brightrule_policy_reading',
  label: '制度',
  type: 'record',
  object: 'brightrule_policy',
  kind: 'full',
  template: 'default',
  isDefault: true,
  regions: [
    {
      name: 'main',
      width: 'full',
      components: [
        { type: 'page:header' },
        {
          type: 'record:highlights',
          properties: {
            fields: ['doc_no', 'owning_unit', 'category', 'policy_level', 'effective_date'],
          },
        },
        {
          type: 'page:tabs',
          properties: {
            tabStyle: 'line',
            items: [
              {
                value: 'body',
                label: '正文',
                children: [
                  {
                    type: 'record:details',
                    properties: {
                      sections: [{ columns: 1, fields: ['body_md'] }],
                    },
                  },
                ],
              },
              {
                value: 'attachments',
                label: '附件',
                children: [
                  {
                    type: 'record:related_list',
                    properties: {
                      objectName: 'brightrule_policy_attachment',
                      relationshipField: 'policy',
                      title: '制度附件',
                      columns: ['label', 'title', 'has_images'],
                    },
                  },
                ],
              },
              {
                value: 'info',
                label: '制度信息',
                children: [
                  {
                    type: 'record:details',
                    properties: {
                      sections: [
                        {
                          name: 'basic',
                          label: '制度信息',
                          columns: 2,
                          fields: ['title', 'doc_no', 'policy_no', 'category_group', 'category', 'policy_level', 'owning_unit', 'status', 'is_trial', 'effective_date'],
                        },
                        {
                          name: 'issuance',
                          label: '发文与归口',
                          columns: 2,
                          fields: ['issuance_type', 'issuing_unit', 'issued_date', 'department', 'co_departments', 'review_body', 'decision_body', 'addressees', 'next_review_date', 'summary'],
                        },
                        {
                          name: 'related',
                          label: '关联制度',
                          columns: 2,
                          fields: ['parent_policy', 'related_policies', 'related_documents'],
                        },
                        {
                          name: 'import',
                          label: '原件与导入',
                          columns: 2,
                          fields: ['original_file', 'has_images', 'images_need_review'],
                        },
                      ],
                    },
                  },
                ],
              },
              {
                value: 'children',
                label: '下级制度',
                children: [
                  {
                    type: 'record:related_list',
                    properties: {
                      objectName: 'brightrule_policy',
                      relationshipField: 'parent_policy',
                      title: '下级制度',
                      columns: ['display_name', 'doc_no', 'policy_level', 'effective_date'],
                    },
                  },
                ],
              },
              {
                value: 'suggestions',
                label: '制度意见',
                children: [
                  {
                    type: 'record:related_list',
                    properties: {
                      objectName: 'brightrule_policy_suggestion',
                      relationshipField: 'policy',
                      title: '制度意见',
                      columns: ['suggestion_no', 'article', 'finding', 'status'],
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
});
