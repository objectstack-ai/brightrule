import { definePage } from '@objectstack/spec/ui';

/**
 * 首页「问制度」— 员工打开明规先到这里（导航第一项）。
 *
 * `kind: 'html'`：云上不开 React 页面（OS_PAGE_REACT_ENABLED），html 页面只解析、
 * 不执行脚本，所以示例问题只是文字；「开始提问」链到控制台的 AI 问询
 * （/_console/ai/ask?new=1，开一个新对话）。针对某一份制度提问，在制度页点
 * 「问这份制度」（src/actions/ask-policy.action.ts）。
 */
const ASK_URL = '/_console/ai/ask?new=1';

const EXAMPLES = [
  '出差住宿每晚最多能报多少？',
  '年休假怎么请，要谁批准？',
  '采购金额多少以上要公开招标？',
  '合同签订前要经过哪些审核？',
  '新员工试用期一般多长？',
  '公务用车可以私用吗？',
];

const LIBRARY = '/_console/apps/brightrule_main_app/brightrule_policy/view';

const card = (view: string, title: string, sub: string) => `
    <card>
      <flex direction="col" gap={1} style={{"padding":"16px"}}>
        <a href="${LIBRARY}/${view}" style={{"fontSize":"16px","fontWeight":600,"color":"hsl(var(--primary))","textDecoration":"none"}}>${title}</a>
        <p style={{"color":"hsl(var(--muted-foreground))","fontSize":"13px","margin":"0"}}>${sub}</p>
      </flex>
    </card>`;

export const HomePage = definePage({
  name: 'brightrule_home',
  label: '问制度',
  type: 'home',
  kind: 'html',
  source: `
<flex direction="col" gap={6} style={{"maxWidth":"880px","margin":"0 auto","padding":"40px 24px"}}>
  <flex direction="col" gap={2}>
    <h1 style={{"fontSize":"28px","fontWeight":700,"margin":"0","color":"hsl(var(--foreground))"}}>有制度上的问题，直接问</h1>
    <p style={{"fontSize":"15px","color":"hsl(var(--muted-foreground))","margin":"0"}}>AI 只依据你能看到的已发布制度作答，答复分「结论、依据、出处」，出处可以点开原文。</p>
  </flex>
  <a href="${ASK_URL}" style={{"display":"inline-block","alignSelf":"flex-start","padding":"12px 28px","borderRadius":"8px","background":"hsl(var(--primary))","color":"hsl(var(--primary-foreground))","fontSize":"16px","fontWeight":600,"textDecoration":"none"}}>开始提问</a>
  <flex direction="col" gap={2}>
    <h2 style={{"fontSize":"17px","fontWeight":600,"margin":"0"}}>可以这样问</h2>
    <ul style={{"margin":"0","paddingLeft":"20px","lineHeight":"1.9","color":"hsl(var(--foreground))"}}>
${EXAMPLES.map((q) => `      <li>${q}</li>`).join('\n')}
    </ul>
    <p style={{"fontSize":"13px","color":"hsl(var(--muted-foreground))","margin":"0"}}>看某一份制度时，点制度页右上角的「问这份制度」，AI 只就这一份作答。</p>
  </flex>
  <flex direction="col" gap={2}>
    <h2 style={{"fontSize":"17px","fontWeight":600,"margin":"0"}}>浏览制度库</h2>
    <grid columns={3} gap={4}>${card('published_governance', '治理类', '公司治理、战略投资')}${card('published_operations', '经营管理类', '财务、人力、资产、合规等')}${card('published_party', '党工纪类', '党建、纪检、工会')}
    </grid>
    <a href="${LIBRARY}/published" style={{"fontSize":"14px","color":"hsl(var(--primary))"}}>进入制度库 →</a>
  </flex>
</flex>`,
});

export default HomePage;
