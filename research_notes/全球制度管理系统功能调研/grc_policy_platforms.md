# 国际主流 Policy Management / GRC 制度管理平台功能调研（截至 2026-11）

> 调研说明：信息主要来自厂商官网、帮助文档、新闻稿与 G2/Capterra 等第三方页面，绝大多数功能描述属于**厂商自述**，未经独立测试。凡标注"（检索摘要）"的条目，来自搜索结果摘要而非全文抓取，可信度略低。NAVEX 官网主产品页、ServiceNow 产品页、Archer 社区页、OneTrust Policy Management 产品页在抓取时返回 404/403 或内容不符，相关信息靠其他页面补齐。

---

## 一、逐厂商功能清单（Vendor-by-vendor）

### Takeaway
市场分两类：(1) **专用制度管理产品**（NAVEX PolicyTech、PowerDMS、ConvergePoint/Ideagen Compliance、Diligent Policy Manager、SAI360）以"起草→审批→发布→阅读确认(attestation)→定期复审"闭环为核心，强在员工端体验、Word/M365 集成和认证报表；(2) **GRC 平台内的制度模块**（ServiceNow IRM、Archer、MetricStream、LogicGate、OneTrust、Workiva）以"制度↔法规/控制/风险"映射为核心，管理粒度更细（policy statement / control objective / section）。2026 年所有头部厂商都上线了"员工制度问答（带出处引用）+ AI 摘要 + 版本差异比对"，并开始提供 Agent 与对外内容 API。

### Cited Findings

#### 1. NAVEX One PolicyTech（Policy & Procedure Management）
- 版本分级：Foundation / Professional / Enterprise 三档。三档都包含 NAVEX One Compliance Hub、NAVEX One Compliance Assistant、EthicsPoint Integration；Program Essentials 包括 Centralized Repository、Automatic Archiving、Standard Approval Workflows、Custom Content Metadata、Automated Task Reminders、Content Distribution and Campaigns、Attestation Tracking、Content Library Browsing、Personalized "My Tasks" Page、PDF Conversions、Customizable Branding、**Assessment Creation**（测验）、Configurable Emails and Notifications、Bulk Management、**Completion by Proxy**（代为完成确认）— [PolicyTech Version Comparison datasheet, 2024-07](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)
- Professional/Enterprise 增加：Microsoft 365 Integration、Content Creation Collaboration、Advanced Approval Workflows、Security Level Management、**Automated Department Sync**（组织/部门自动同步）、Configurable Templates and Document Properties、Personalized Email Preferences；仅 Enterprise 有 **Localization Workflow**（多语言翻译工作流）— [同上](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)
- 附加项：Emergency Document Access（5/15/55 份）、NAVEX Standard Languages（Foundation 为 US+3，另两档为 All）、Non-Standard Language Translations（Add-On）、Public Viewer Licenses、Third-Party Access（Add-On）；报表：Standard Campaign Reporting、Automated Report Exports、Advanced Reporting Suite — [同上](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)
- EthicsPoint 集成：员工阅读制度时可直接举报违规，调查人员可在案件中回链制度 — [同上](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)
- 阅读确认活动（campaign）可按 location、department、job level 或任意条件组建员工组分发一组文件；可在 attestation 中嵌入 topic/policy quiz；定期自动提醒直至完成（检索摘要）— [Track readership use case PDF](https://cdn.navex.com/image/upload/v1674132294/resource%20documents/track-readership-policytech-usecase.pdf)
- 2022 年 Enterprise datasheet 称包含 14 种标准语言；PolicyTech 可与 HRIS 同步（检索摘要）— [PolicyTech Enterprise datasheet 2022](https://cdn.navex.com/image/upload/v1644436790/resource%20documents/policytech-enterprise-datasheet-2022.pdf)；[Go global use case](https://www.navex.com/en-us/resources/use-cases/go-global-policytech-enterprise/)
- 2026-02-12：发布 **AI policy summaries**（为新制度/修订生成通俗摘要，并生成翻译版摘要；对比当前版与上一版，标出新增/删除/改动语言）；与 Volkov Law Group 合作提供 6 套模板（反贿赂、利益冲突、毒品酒精、平等雇佣、供应链诚信、职场骚扰），提供英/德/意/西/日/法语版 — [NAVEX 新闻稿 2026-02-12](https://www.navex.com/en-us/company/press-room/navex-one-delivers-smarter-policy-management-for-modern-compliance-teams/)
- 2026-08-11：发布 **Nira for Policy Guidance**（员工自然语言提问，基于现行已批准制度回答；支持多轮追问、跨多份制度综合、必要时反问澄清；每个回答链接出处；多语言）及 **Policy Content Integration APIs**（document change detection、policy metadata 与 activity data、取回当前 Word/PDF/PPT 源文件、自动同步工作流，用于向企业 AI/搜索/业务系统供给受治理内容）— [NAVEX 新闻稿 2026-08](https://www.navex.com/en-us/company/press-room/navex-transforms-policy-management-with-ai-powered-nira-and-integration-apis/)
- 产品更新：2026-09-10 内置 Policy document editor（可在 NAVEX One 内编辑文档、表格、演示文稿）；2026-09-30 refreshed policy administration experience；路线图（2026-12）"Connect policy responses to risk"、带截止日期的 policy review requests — [NAVEX Product Updates](https://www.navex.com/en-us/platform/product-updates/)
- NAVEX One Compliance Assistant（员工合规问答机器人）基于 PolicyTech 内容回答，支持 70+ 语言（检索摘要）— [NAVEX 新闻稿](https://www.navex.com/en-us/company/press-room/launch-navex-one-ai-powered-compliance-assistant/)
- NAVEX 自称服务 13,000 家组织，含 75% 的 Fortune 100 — [NAVEX 新闻稿 2026-08](https://www.navex.com/en-us/company/press-room/navex-transforms-policy-management-with-ai-powered-nira-and-integration-apis/)

#### 2. ConvergePoint（2025-06 被 Ideagen 收购，现以 Ideagen Compliance 销售）
- 以 App 形式安装在 SharePoint Online 上，使用 Active Directory SSO 与基于角色的权限，无独立用户管理；用 Word Online 起草（track changes）并有 Word 插件做内容自动化 — [ConvergePoint 产品页](https://www.convergepoint.com/policy-management-software/)
- 功能模块名：Policy Workflows and Email Alerts（预定义审阅规则、指定起草/审阅/批准人、自动发布通知）；Review and Approval（自动分派、驳回与变更请求处理）；**Policy Documents – Renewals and Expirations**（续期提醒、一键 revise/renew、有效/过期状态标识）；Policy Audit Trails and Activity History；记录"每年员工可见的是哪个版本"；Policy Certification and Attestation（可选 comprehension quiz、自动提醒邮件、经理看板）；Policy Library（按职能/地区/部门的角色访问）；Outlook 与 Teams 插件、Policy eSignature Integration、Policy and Procedure AI Tools（页面未展开）— [ConvergePoint 产品页](https://www.convergepoint.com/policy-management-software/)
- Ideagen 于 2025-06-25 宣布收购 ConvergePoint（德州，面向 M365 SharePoint），主要客户在医疗、制造、能源 — [Ideagen 新闻](https://www.ideagen.com/company/news/ideagen-acquires-convergepoint)；[BusinessWire](https://www.businesswire.com/news/home/20250624846987/en/Ideagen-Acquires-ConvergePoint-to-Strengthen-Compliance-and-Policy-Management-Capability)
- 第三方页面称起价约 $15,000/年（非厂商官方数据）— [Software Advice](https://www.softwareadvice.com/compliance/convergepoint-policy-management-profile/)

#### 3. PowerDMS（NEOGOV 旗下，侧重公共安全/医疗/政府）
- 功能名：Edit with Tools You Know（Microsoft/Google 集成或系统内编辑）、Automated Workflows、Automate Annual Reviews、Monitor Workflow Progress；审批人可 Approve or deny 并附说明，可跳过不在岗审批人、可退回重评 — [PowerDMS 产品页](https://www.powerdms.com/policy-management-software)
- 版本：Version Control & Audit History、**Auto Version Archiving**（发布即归档旧版）、"只有一个现行版本对员工可见"、**Side-by-Side Document Compare**（彩色标注增删改）— [同上](https://www.powerdms.com/policy-management-software)
- 确认：Digital Signatures、Automated Policy Acknowledgments（按个人/组/组织单元分配并设截止日期）、Track E-Signatures（可导出报表）；PowerRecall 附加模块提供 AI-generated quizzes and microlearning — [同上](https://www.powerdms.com/policy-management-software)
- 特色：Provide Open Records（指定文件发布到公开网站）；**Accreditation Mapping / Accreditation Management**（把制度与证据映射到认证标准，评审员安全访问，PowerStandards 集成）；移动 App 支持离线、书签、移动端签署、深色模式 — [同上](https://www.powerdms.com/policy-management-software)
- AI：**AI Policy Search**（自然语言问答、引用来源链接、遵守权限、只基于现行文件）— [同上](https://www.powerdms.com/policy-management-software)
- 报表：交互式报表、定时邮件发送报表、Court-Ready Audit Records；SSO 支持 SAML、AD、Okta — [同上](https://www.powerdms.com/policy-management-software)
- 定价不公开，需报价；第三方称为"基础费 + 每用户每年费用，量大单价降低"— [Zoftwarehub](https://zoftwarehub.com/en-ae/products/powerdms/pricing)

#### 4. Diligent Policy Manager（Diligent One 平台）
- 覆盖起草、审阅、批准、分发、跟踪；可配置的修订与批准工作流引擎；实时状态跟踪（显示谁在卡流程）；权限管理控制谁能看哪些制度；实时看板与报表（制度状态、采用率、缺口）；自动化 attestations — [Diligent 产品页](https://www.diligent.com/products/policy-manager)
- 2026-01-28：重新设计的 Policy Portal，含 AI-powered search（自然语言提问）、Instant AI-generated summaries、30+ 语言支持 — [Diligent 博客 2026-01](https://www.diligent.com/resources/blog/diligent-ai-innovations-third-party-and-compliance-workflows)

#### 5. MetricStream Policy and Document Management
- 起草：**Inline authoring, section by section**（多人同时编辑）、也可提交附件；可配置模板；Microsoft 365 集成支持实时协同和 Word track changes — [MetricStream 产品页](https://www.metricstream.com/products/policy-and-document-management.htm)
- 工作流：审阅/批准可针对整份制度**或单个章节**路由；生命周期 drafting→review→approval→retirement — [同上](https://www.metricstream.com/products/policy-and-document-management.htm)
- 确认：按用户或组；邮件链接直达需确认的**章节**，以电子签名或勾选确认；带时间戳记录 — [同上](https://www.metricstream.com/products/policy-and-document-management.htm)
- 门户：员工查看现行版本、书签、查看变更；**Smart search**（NLP），可嵌入内网、聊天机器人和办公工具的 widget — [同上](https://www.metricstream.com/products/policy-and-document-management.htm)
- AI：**Policy Assistant**（带引用的通俗回答）、**Policy Agents**（自动化制度创建、确认、例外处理、整改建议）、**Policy Agent Ecosystem**（与伙伴构建自定义 agent）、**Policy Intelligence**（AI 摘要与报告）— [同上](https://www.metricstream.com/products/policy-and-document-management.htm)
- 例外：员工提交理由和期限；可配置路由；AI 聚类相似问题并推荐处置 — [同上](https://www.metricstream.com/products/policy-and-document-management.htm)
- **Regulatory Mapping**：制度及**单个章节**可映射到法规、要求、风险、控制、流程，支持 1:1、1:N、N:1、N:N；法规变更时标记关联制度并通知所有者 — [同上](https://www.metricstream.com/products/policy-and-document-management.htm)
- 演示页称可识别制度间重叠、矛盾和过时引用，并对版本变更做 redline（检索摘要）— [MetricStream 演示页](https://www.metricstream.com/product-demo/policy-document-management-product-demo.html)
- 厂商自称（Business Value Calculator）：制度生命周期效率提升 60%、监控报告提速 60% — [MetricStream 产品页](https://www.metricstream.com/products/policy-and-document-management.htm)

#### 6. ServiceNow Policy and Compliance Management（IRM/GRC）
- 数据模型：Authority documents（法规目标）→ Policies（应做/不应做）→ Policy statements / Control objectives（如何遵守）→ Controls（应用到实体上的具体实现，可自动生成，可测试）；Exceptions 有审批生命周期；Attestation 多为临时性控制合规确认 — [ServiceNow Docs: Structural overview](https://www.servicenow.com/docs/bundle/zurich-governance-risk-compliance/page/product/grc-policy-and-compliance/concept/pc-structural-overview-policy-comp.html)
- 新版本：control objective 下的多条陈述可成为 **control objective requirement**，可在 requirement 级别做 attestation；例外审批人可在弹窗中审阅详情后批准/驳回 Policy exception 及 exception extension（检索摘要）— [ServiceNow Release notes](https://www.servicenow.com/docs/r/store-release-notes/store-grc-rn-policy-compliance-mgmt.html)
- 生命周期状态：Draft → Review → Awaiting Approval → Published → Retired；发布时自动生成 Knowledge Base 文章并启动 Valid To 计时；退役时删除 KB 文章、停用 control objective — [ServiceNow Community 2026-06](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- 类型：Policy、Procedure、Standard、Plan、Checklist、Framework、Template（仅分类）；父子层级仅组织意义，子制度不继承控制 — [同上](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- 内容来源：手工录入、上传 .docx（Xanadu 起）、或链接 OneDrive/SharePoint/Google Drive 实时文档做协同 redline — [同上](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- 审批模式：Select Approvers（指定）或 Use Approval Rule（GRC Approval Configurator 按类型/类别/域路由，支持顺序层级与并行组）；无审批人时自动发布 — [同上](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- 版本：已发布版本不可变，修改需新 revision；**major revision** 会使关联控制回到 Draft 重新验证，**minor revision** 不需要；Policy Versions 标签页 + Policy History + KB 历史构成审计轨迹 — [同上](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- 复审：Valid To 到期后启动宽限计时（默认 30 天，属性 sn_compliance.policy_expiry_to_review_timer），随后自动进入 Review 或 Draft — [同上](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- 合规评分：从 controls 汇总到 control objectives、entities、policies；可选是否把下级实体分数纳入（适合集团层级结构）；豁免/例外中的控制不计入 — [同上](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- 员工端：Employee Center 中的 Acknowledgment campaigns 记录谁、何时、确认了哪个版本；员工可从 Employee Center 申请例外 — [同上](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)

#### 7. Archer（原 RSA Archer）Policy Program Management / Policy & Document Governance
- Policy Program Management 提供管理企业与监管制度、对齐合规义务的框架，覆盖制度开发全生命周期和例外处理（检索摘要）— [Archer Community](https://community.archerirm.com/hc/en-us/articles/52147321515155-Archer-Policy-Program-Management)
- IT & Security 版本把"通过风险接受与签署进行例外管理与治理"列为核心功能（检索摘要）— [Archer Community](https://community.archerirm.com/hc/en-us/articles/52147402268435-Archer-IT-Security-Policy-Program-Management)
- Policy & Document Governance：Searchable document library（全文检索）、模板元数据映射到 Archer 字段以关联控制与义务、Complete version history（每个历史版本附带其审批）、Configurable approval workflow、Attestation tracking（谁收到了已发布变更）、Permissions at the document, version, and draft level、Tags for your taxonomy、活动日志导出 CSV、董事会报告 — [Archer Document Governance](https://www.archerirm.com/document-governance)
- Archer Evolv AI：合规训练 AI 把法规文本抽取为结构化、可追溯义务；Compliance operators 把新义务映射到控制与制度；Horizon scanning 监控权威来源；Continuous control mapping 保持义务-制度-控制-证据关联；人工审核后才写入控制 — [Archer 博客](https://archerirm.com/post/archer-document-governance-robust-policy-lifecycle-management)
- 监控的法规来源数量不一致：一页称 "9,300+ regulatory sources" — [Archer 博客](https://archerirm.com/post/archer-document-governance-robust-policy-lifecycle-management)；另一页称 "8,000+" — [Archer Document Governance](https://www.archerirm.com/document-governance)

#### 8. LogicGate Risk Cloud – Policy Management
- AI 生成制度（**Spark AI**，OpenAI 集成）、共享仓库起草与修订、审批工作流、自动分发、版本与修订阶段跟踪、attestation 跟踪与审计轨迹、独立的 Exception Management 应用、**Dynamically Connect Policies to Control Frameworks**（25+ 安全与隐私框架）、预置报表与看板；集成 OpenAI、Google Drive、Docusign — [LogicGate 产品页](https://www.logicgate.ai/solutions/policy-management/)
- 可配置的员工 attestation 表单（无代码 web form）— [LogicGate 博客](https://logicgate.com/blog/designing-an-effective-process-to-track-employee-policy-attestations-and-certifications)
- G2 平均 4.6/5（190 条评价），部分评价称协作与制度参与体验不清晰 — [G2](https://www.g2.com/products/logicgate/reviews)

#### 9. OneTrust（Policy Management / Ethics Policy Management / Tech Risk & Compliance）
- Attestation 可按个人、BU、区域跟踪；标记低于目标确认率的制度并自动提醒；组织层级内置于分发筛选；确认类型包括"确认收到、知识应用（知识问卷）、提交证据"；例外在 attestation 中提交，设置到期并进入 **exception register**；员工统一门户；看板显示制度数量、活跃 attestations、按工作流阶段的柱状图（检索摘要，主要来自 OneTrust 页面）— [OneTrust Policy Management](https://aem-int.onetrust.com/products/policy-management)；[OneTrust 博客](https://www.onetrust.com/blog/policy-attestation-if-you-cant-measure-it-you-cant-manage-it/)
- Compliance Automation：共享证据框架将证据映射到多个框架的控制要求，提供 50+ 标准/法规模板，预置证据采集器 — [OneTrust 页面](https://www.onetrust.com/products/policy-management/)

#### 10. Workiva
- 公开资料对其"制度生命周期"描述较弱；强项是 SOX 控制、风险评估、测试与财报；TrustRadius 评价将 GRC policy management 列为改进点（制度创建、批准、传达支持有限）— [TrustRadius](https://www.trustradius.com/products/workiva)；[G2 Workiva features](https://g2.com/products/workiva-workiva/features)

#### 11. SAI360
- 自动化全生命周期（起草、审批、分发、attestation、版本控制）、复审提醒与到期告警、法规变更触发告警、可配置工作流、按计划修订日期触发复审；制度直接关联培训（SAI360 Learning），并与风险评估连接（检索摘要）— [SAI360 Policy Management](https://www.sai360.com/?p=1003313)；[SoftwareOne 列表](https://platform.softwareone.com/product/sai360-policy-management/PCP-8876-1154)
- SAI360 自称获 G2 Policy Management "Leader (Overall)" 徽章（引用 2025 夏季报告）— [SAI360](https://www.sai360.com/?p=1004686)

#### 12. Ideagen（Policy Management / Ideagen Compliance / Policy Logic）
- 基于 M365 SharePoint；可配置起草/审阅/批准工作流、任务级通知；集中仓库、自动版本控制、审计轨迹、搜索；过期制度自动归档；可配置确认要求与自定义 quiz；实时看板显示审批进度与未合规员工 — [Ideagen Policy Management](https://www.ideagen.com/solutions/compliance/policy-and-contract-management/policy-management)
- 方法论 "Create, Distribute and Certify"；Certification quizzes 带评分与报表（检索摘要）— [UK G-Cloud 15 列表](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-15/services/571317583701132)
- Ideagen Policy Logic 面向教育与护理行业，结合自动工作流与法律内容 — [Ideagen Policy Logic](https://www.ideagen.com/products/ideagen-policy-logic)

### Inferences
- 专用产品与 GRC 模块的差别正在缩小：专用厂商（NAVEX）在补"连接风险"和 API；GRC 厂商（MetricStream）在补章节级协同编辑和员工门户。
- 对 BrightRule 最有参照价值的组合：MetricStream 的"章节级审批/确认/映射" + ServiceNow 的"不可变发布版本 + major/minor revision + 到期自动进入复审" + NAVEX/PowerDMS 的"员工端问答与 campaign"。

### Gaps
- 未能抓取 NAVEX 主产品页、ServiceNow 产品页、Archer 社区原文、OneTrust Policy Management 原文；Ideagen PolicyHub（英国金融业老产品）在当前 Ideagen 网站未找到独立页面，现状不明。
- Workiva 无独立制度管理产品资料可用。

---

## 二、制度生命周期（起草、审批、发布、复审、退役）

### Takeaway
标配流程：模板起草 → 协同编辑（Word/M365 为主）→ 多级审批（顺序+并行、按类型路由）→ 发布（PDF/KB 文章）→ 按 Valid-To/复审日期自动提醒或自动退回草稿 → 退役归档。差异点在于：是否支持章节级路由（MetricStream）、按规则路由（ServiceNow Approval Configurator）、审批人缺席跳过（PowerDMS）、系统内原生编辑器（NAVEX 2026-09）。

### Cited Findings
- 起草/模板：NAVEX 提供 Configurable Templates and Document Properties、Content Creation Collaboration 及 6 套律所撰写模板 — [PolicyTech tiers](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)；[NAVEX 2026-02](https://www.navex.com/en-us/company/press-room/navex-one-delivers-smarter-policy-management-for-modern-compliance-teams/)
- Word/M365：ConvergePoint 用 Word Online + track changes 和 Word 插件 — [ConvergePoint](https://www.convergepoint.com/policy-management-software/)；MetricStream 支持 M365 实时协同与 track changes — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)；ServiceNow 可链接 OneDrive/SharePoint/Google Drive 实时文档 — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)；PowerDMS 支持 Microsoft/Google 编辑 — [PowerDMS](https://www.powerdms.com/policy-management-software)
- 章节级：MetricStream "Author policies inline, section by section"，审批路由可到单个章节 — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)
- 审批：ServiceNow 支持顺序层级与并行组、按类型/类别/域的规则路由 — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)；NAVEX 区分 Standard / Advanced Approval Workflows — [PolicyTech tiers](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)；PowerDMS 可跳过不在岗审批人并退回重评 — [PowerDMS](https://www.powerdms.com/policy-management-software)
- 复审：ServiceNow Valid To + 30 天宽限后自动转 Review/Draft — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)；ConvergePoint Renewals and Expirations 一键 revise/renew — [ConvergePoint](https://www.convergepoint.com/policy-management-software/)；PowerDMS Automate Annual Reviews — [PowerDMS](https://www.powerdms.com/policy-management-software)；SAI360 复审提醒与到期告警 — [SAI360](https://www.sai360.com/?p=1003313)
- 退役：ServiceNow Retired 状态移除 KB 文章并停用 control objective — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)；Ideagen 自动归档过期制度 — [Ideagen](https://www.ideagen.com/solutions/compliance/policy-and-contract-management/policy-management)

### Inferences
- 集团场景应参考 ServiceNow 的"规则化审批路由"（按制度类别/发文单位自动决定审批链），而非逐份手工指定审批人。

### Gaps
- 未找到各厂商关于"会签/加签/转办"等中国式审批动作的资料；国际产品普遍未见此类描述。

---

## 三、版本控制（历史、比对、生效日期、审计轨迹、时点检索）

### Takeaway
"单一现行版本 + 发布即归档旧版 + 不可变已发布版本 + 并排比对"是标配；2026 年 NAVEX 用 AI 自动总结版本差异。"某一时点哪个版本有效"被 ConvergePoint 明确作为卖点。

### Cited Findings
- PowerDMS：Auto Version Archiving、只允许一个现行版本对员工可见、Side-by-Side Document Compare — [PowerDMS](https://www.powerdms.com/policy-management-software)
- ServiceNow：已发布版本不可变，修订分 major/minor，major 触发关联控制重新验证 — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- ConvergePoint：保留"每年员工可见的是哪个文档版本"的记录（时点检索）— [ConvergePoint](https://www.convergepoint.com/policy-management-software/)
- Archer：每个历史版本附带其审批记录；权限可细化到文档、版本、草稿层级 — [Archer](https://www.archerirm.com/document-governance)
- NAVEX AI 版本比对：标出新增、删除、改动语言 — [NAVEX 2026-02](https://www.navex.com/en-us/company/press-room/navex-one-delivers-smarter-policy-management-for-modern-compliance-teams/)
- ServiceNow 确认记录包含"确认的是哪个版本" — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)

### Inferences
- BrightRule 的"修订即新版本、生效版本不可原地编辑"约定与 ServiceNow 一致；可借鉴 major/minor 修订区分，决定是否需要重新发起阅读确认。

### Gaps
- 生效日期与发布日期分离（未来生效、过渡期）在所调研页面中未见明确描述。

---

## 四、分发与阅读确认（Attestation）

### Takeaway
各家均支持按角色/部门/地区定向分发、电子签名或勾选确认、测验、自动提醒、确认报表。差异：NAVEX 有 Completion by Proxy 和与 HRIS 的部门同步；MetricStream 可直达章节确认；OneTrust 支持"提交证据"型确认并在确认中直接申请例外；ServiceNow 可在 requirement 级确认。

### Cited Findings
- NAVEX：campaign 按 location/department/job level 组建；可嵌入 quiz；自动提醒直至完成（检索摘要）— [NAVEX use case](https://cdn.navex.com/image/upload/v1674132294/resource%20documents/track-readership-policytech-usecase.pdf)；Completion by Proxy、Assessment Creation、Automated Department Sync — [PolicyTech tiers](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)
- PowerDMS：按个人/组/组织单元分配并设截止日；PowerRecall 提供 AI 生成测验与微学习 — [PowerDMS](https://www.powerdms.com/policy-management-software)
- ConvergePoint：可选理解测验、自动提醒、经理看板 — [ConvergePoint](https://www.convergepoint.com/policy-management-software/)
- MetricStream：邮件链接直达需确认的章节 — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)
- OneTrust：确认收到 / 知识测试 / 提交证据三种类型；低于目标确认率自动提醒（检索摘要）— [OneTrust](https://aem-int.onetrust.com/products/policy-management)
- ServiceNow：requirement 级 attestation（检索摘要）— [ServiceNow Release notes](https://www.servicenow.com/docs/r/store-release-notes/store-grc-rn-policy-compliance-mgmt.html)
- SAI360：制度直接关联培训课程 — [SAI360](https://www.sai360.com/?p=1003313)

### Inferences
- "Completion by Proxy"（代无电脑一线员工完成确认）和"按 HR 组织自动同步"对拥有大量一线员工的集团企业很关键。

### Gaps
- 升级（escalation 到上级经理）机制只在 ConvergePoint "manager dashboards" 中间接体现，未找到明确的逐级升级规则描述。

---

## 五、结构与关联（文档级 vs 条款级、法规/控制映射、层级、例外）

### Takeaway
专用制度产品多以**文档**为管理单位；GRC 平台把制度拆成 **policy statement / control objective / section** 并映射到法规与控制。MetricStream 支持章节级映射（N:N）与法规变更提醒；ServiceNow 的 Authority document → Policy → Control objective → Control 是最完整的数据模型；例外管理在 ServiceNow、MetricStream、OneTrust、LogicGate、Archer 中都是独立对象。

### Cited Findings
- ServiceNow 数据模型及 requirement 级粒度 — [ServiceNow Docs](https://www.servicenow.com/docs/bundle/zurich-governance-risk-compliance/page/product/grc-policy-and-compliance/concept/pc-structural-overview-policy-comp.html)；类型含 Policy/Procedure/Standard 等，父子层级不继承控制 — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- MetricStream Regulatory Mapping（章节级、N:N、变更提醒）— [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)
- LogicGate 映射到 25+ 安全与隐私框架 — [LogicGate](https://www.logicgate.ai/solutions/policy-management/)
- OneTrust 50+ 标准模板与共享证据框架 — [OneTrust](https://www.onetrust.com/products/policy-management/)
- PowerDMS Accreditation Mapping（映射到认证标准，评审员访问）— [PowerDMS](https://www.powerdms.com/policy-management-software)
- 例外：ServiceNow 例外有审批生命周期与延期申请 — [ServiceNow Docs](https://www.servicenow.com/docs/bundle/zurich-governance-risk-compliance/page/product/grc-policy-and-compliance/concept/pc-structural-overview-policy-comp.html)；MetricStream 理由+期限+AI 聚类 — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)；OneTrust exception register — [OneTrust](https://aem-int.onetrust.com/products/policy-management)；Archer 风险接受与签署 — [Archer Community](https://community.archerirm.com/hc/en-us/articles/52147402268435-Archer-IT-Security-Policy-Program-Management)

### Inferences
- BrightRule 的"条款为管理与检索单元"与 MetricStream 章节级、ServiceNow statement 级一致，属于 GRC 高端做法，专用制度产品普遍还停留在文档级——这是差异化机会。

### Gaps
- 未找到任何厂商关于"上位制度修订自动提示下位制度（子公司细则）需同步修订"的明确功能描述。

---

## 六、检索与访问（门户、移动、权限、多语言、多实体）

### Takeaway
员工门户 + 全文/语义检索 + 角色权限是标配；多语言以 NAVEX（标准语言 + 翻译工作流 + 70+ 语言问答）和 Diligent（30+ 语言）为代表；移动端以 PowerDMS（离线）最完整。多实体支持多通过组织层级、部门同步和评分汇总体现。

### Cited Findings
- PowerDMS 移动 App 离线、书签、移动签署 — [PowerDMS](https://www.powerdms.com/policy-management-software)
- MetricStream Smart search 可嵌入 widget — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)
- ServiceNow 通过 KB 搜索、全局搜索、Employee Center 检索 — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- Diligent Policy Portal 30+ 语言 — [Diligent 博客](https://www.diligent.com/resources/blog/diligent-ai-innovations-third-party-and-compliance-workflows)
- NAVEX Localization Workflow、Security Level Management、Public Viewer / Third-Party Access 附加许可 — [PolicyTech tiers](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)
- ServiceNow 合规评分可沿实体层级向上汇总 — [ServiceNow Community](https://www.servicenow.com/community/grc-articles/policy-lifecycle-management-in-irm-one-governed-workflow/ta-p/3566226)
- Archer 权限到文档/版本/草稿层级 — [Archer](https://www.archerirm.com/document-governance)

### Inferences
- "集团制度 + 子公司适用范围"在国际产品中通常用组织层级加权限实现，未见"同一条款多实体适用"的专门设计，与 BrightRule 用 organization_id + 共享规则的思路可对照。

### Gaps
- 未找到明确的多租户/多法人实体（multi-entity）配置文档。

---

## 七、报表与审计

### Takeaway
标配：确认率看板、制度状态/逾期复审报表、可导出审计轨迹；进阶：定时邮件报表（PowerDMS）、董事会 AI 摘要（MetricStream）、合规评分汇总（ServiceNow）。

### Cited Findings
- PowerDMS 定时报表与 Court-Ready Audit Records — [PowerDMS](https://www.powerdms.com/policy-management-software)
- NAVEX Standard Campaign Reporting / Automated Report Exports / Advanced Reporting Suite — [PolicyTech tiers](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)
- MetricStream 确认率与法规对齐看板，按类型/状态/审计历史下钻，一键导出，AI 董事会摘要 — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)
- Diligent 看板涵盖制度状态、采用率、缺口 — [Diligent](https://www.diligent.com/products/policy-manager)
- Archer 活动日志导出 CSV、董事会报告 — [Archer](https://www.archerirm.com/document-governance)

### Inferences
- "某时点员工看到的版本 + 谁确认了哪个版本"是监管检查时最常要的两类证据，应作为一等报表。

### Gaps
- 未找到面向特定监管机构（如金融监管）的预置报表模板描述。

---

## 八、AI 功能（2023–2026）

### Takeaway
2026 年 AI 功能已收敛为四类：(1) 员工制度问答（带出处、遵守权限、多语言）——NAVEX Nira、PowerDMS AI Policy Search、MetricStream Policy Assistant、Diligent AI search；(2) AI 摘要与版本差异说明——NAVEX、Diligent、MetricStream；(3) AI 起草——LogicGate Spark AI、MetricStream；(4) 法规义务抽取与映射/Agent——Archer Evolv、MetricStream Policy Agents。

### Cited Findings
- NAVEX Nira for Policy Guidance（多轮、跨制度综合、反问澄清、出处链接）及内容 API — [NAVEX 2026-08](https://www.navex.com/en-us/company/press-room/navex-transforms-policy-management-with-ai-powered-nira-and-integration-apis/)
- NAVEX AI policy summaries 与版本差异 — [NAVEX 2026-02](https://www.navex.com/en-us/company/press-room/navex-one-delivers-smarter-policy-management-for-modern-compliance-teams/)
- PowerDMS AI Policy Search（只基于现行文件、遵守权限）、PowerRecall AI 测验 — [PowerDMS](https://www.powerdms.com/policy-management-software)
- MetricStream Policy Assistant / Policy Agents / Policy Intelligence / 例外 AI 聚类 — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)
- LogicGate Spark AI 生成制度 — [LogicGate](https://www.logicgate.ai/solutions/policy-management/)
- Archer Evolv 义务抽取、映射、Horizon scanning（人工审核把关）— [Archer 博客](https://archerirm.com/post/archer-document-governance-robust-policy-lifecycle-management)
- Diligent AI search 与 AI summaries（2026-01）— [Diligent 博客](https://www.diligent.com/resources/blog/diligent-ai-innovations-third-party-and-compliance-workflows)
- NAVEX 强调 AI 辅助而非替代，人工审阅与批准仍是每个工作流的必要环节（检索摘要）— [NAVEX 新闻稿](https://www.navex.com/en-us/company/press-room/navex-one-delivers-smarter-policy-management-for-modern-compliance-teams/)

### Inferences
- "只用现行已批准版本回答 + 权限过滤 + 出处引用"已是行业底线，BrightRule 条款级检索可以做到引用到条款号，比文档级引用更精确。
- NAVEX 的 Policy Content Integration APIs 说明一个新趋势：制度库成为企业 AI 的"受治理知识源"。

### Gaps
- ServiceNow Now Assist 在制度模块中的具体能力未找到；各家 AI 问答的准确率与幻觉控制无独立评测数据。

---

## 九、集成

### Takeaway
SSO（SAML/AD/Okta）、Microsoft 365（Word/SharePoint/Teams/Outlook）为普遍集成；HRIS 同步只在 NAVEX 有明确描述；Slack、Workday 未在所调研页面中出现。

### Cited Findings
- PowerDMS SSO：SAML、AD、Okta；Microsoft Office、OneDrive、Google Drive — [PowerDMS](https://www.powerdms.com/policy-management-software)
- ConvergePoint：SharePoint Online、AD SSO、Outlook/Teams 插件、eSignature — [ConvergePoint](https://www.convergepoint.com/policy-management-software/)
- NAVEX：Microsoft 365 Integration、Automated Department Sync、EthicsPoint — [PolicyTech tiers](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)；Policy Content Integration APIs — [NAVEX 2026-08](https://www.navex.com/en-us/company/press-room/navex-transforms-policy-management-with-ai-powered-nira-and-integration-apis/)
- LogicGate：OpenAI、Google Drive、Docusign — [LogicGate](https://www.logicgate.ai/solutions/policy-management/)
- MetricStream：Microsoft 365；可嵌入内网/聊天机器人的搜索 widget — [MetricStream](https://www.metricstream.com/products/policy-and-document-management.htm)

### Gaps
- 未找到 NAVEX 与 Workday 的明确集成证据；Slack 集成未在任何厂商页面中出现。

---

## 十、分析师定位、差异化与定价

### Takeaway
Forrester Wave GRC Platforms Q2 2026 共 4 家 Leader，已确认 Diligent、LogicGate、Vanta（第四家未确认），MetricStream 为 Strong Performer。Gartner 2025-10 MQ for GRC Tools, Assurance Leaders 中 IBM、LogicGate、Diligent、AuditBoard 自称 Leader。专用制度产品定价基本不公开，多为报价制、按员工数/用户数分档。

### Cited Findings
- Forrester Wave GRC Platforms Q2 2026 发布 — [Forrester](https://www.forrester.com/blogs/announcing-the-forrester-wave-governance-risk-and-compliance-platforms-q2-2026/)；Diligent 为 Leader — [BusinessWire](https://www.businesswire.com/news/home/20260520860442/en/Diligent-Named-a-Leader-in-Governance-Risk-and-Compliance-Platforms-in-Q2-2026-Report-by-Independent-Research-Firm)；LogicGate 为四家 Leader 之一 — [LogicGate](https://www.logicgate.com/news/logicgate-proudly-announced-it-was-named-one-of-four-leaders-in-the-forrester-wave-governance-risk-and-compliance-platforms-q2-2026-report/)；Vanta 首次入选即为 Leader — [Vanta](https://www.vanta.com/resources/vanta-a-forrester-grc-wave-leader)；MetricStream 为 Strong Performer（2026-05-28）— [BusinessWire](https://www.businesswire.com/news/home/20260528913045/en/MetricStream-Named-a-Strong-Performer-by-Independent-Research-Firm-in-Governance-Risk-and-Compliance-Platforms-Evaluation)
- Gartner MQ for GRC Tools, Assurance Leaders（2025-10-27）— [Gartner](https://www.gartner.com/en/documents/7111830)；IBM — [IBM](https://www.ibm.com/us-en/forms/mkt-54093)；LogicGate 自称"最右上" — [LogicGate](https://www.logicgate.com/news/logicgate-named-a-leader-in-the-grc-market-by-the-gartner-magic-quadrant-for-grc-tools-assurance-leaders/)；Diligent — [Diligent](https://www.diligent.com/resources/blog/2025-gartner-magic-quadrant-diligent-a-leader)；AuditBoard — [AuditBoard](https://auditboard.com/blog/auditboard-named-a-leader-in-the-2025-gartner-magic-quadrant-for-governance-risk-and-compliance-tools-assurance-leaders)
- G2：Policy Management 类别页摘要显示 Vanta 为 Leader（检索摘要）— [G2](https://www.g2.com/categories/policy-management)；LogicGate 自称连续 27 个季度 G2 Leader — [LogicGate](https://www.logicgate.ai/solutions/policy-management/)；ConvergePoint 出现在 G2 Fall 2025 GRC Leaders（检索摘要）— [AuditBoard 转载 G2 报告](https://go.auditboard.com/rs/961-ZQV-184/images/Governance_Risk_Compliance_Fall_2025.pdf?version=0)
- 定价：ConvergePoint 第三方称约 $15,000/年起 — [Software Advice](https://www.softwareadvice.com/compliance/convergepoint-policy-management-profile/)；PolicyTech 在 Software Advice 标 $100 起价，计费周期不明 — [Software Advice](https://www.softwareadvice.com/product/150850-PolicyTech/)；PowerDMS 报价制 — [Zoftwarehub](https://zoftwarehub.com/en-ae/products/powerdms/pricing)；NAVEX 按 Foundation/Professional/Enterprise 三档 + 语言/外部访问附加项 — [PolicyTech tiers](https://cdn.navex.com/image/upload/v1722516334/resources-2024/datasheets/PolicyTech_Version_Comparison.pdf)

### Inferences
- 分析师报告评的是 GRC 平台整体，没有专门的"制度管理"魔力象限；专用制度厂商（NAVEX、PowerDMS、ConvergePoint）主要靠 G2 与行业口碑定位。

### Gaps
- Forrester 第四家 Leader 未确认；Gartner MQ 完整 Leader 名单需订阅；所有厂商均无公开的按员工计价表。
