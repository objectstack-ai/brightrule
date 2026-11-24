# AI Policy Q&A Assistants and Clause-Level Temporal Versioning: Global State of the Art (as of Nov 2026)

> Scope note: Part A = AI policy Q&A / employee assistants; Part B = clause-level structure and point-in-time versioning. Research was done with a limited budget (about 16 search/fetch calls). Most product evidence is **vendor-authored** (marketing pages, docs, community posts), and no independent benchmarks were found. Wherever a feature could not be confirmed, it is listed under Gaps rather than assumed.

---

## A1. Citation and grounding to a specific clause/section

### Takeaway
Every major vendor now advertises grounded answers with source links. NAVEX, ServiceNow, Glean, Moveworks and SAP Joule all confirm that answers cite the source document or article. None of the sources found confirms citation at **clause/section granularity**: citations point to a document, KB article or chunk. Citing at clause level, with the clause's effective version shown, is therefore an open differentiation opportunity for BrightRule.

### Cited Findings
- NAVEX "Nira for Policy Guidance" (formerly NAVEX One AI-powered Compliance Assistant) generates answers from the customer's authorized policy documents. It shows "supporting sources" drawn only from eligible, non-restricted content, links policies from responses and reinforces them with micro-learnings. — [NAVEX AI compliance assistant page](https://www.navex.com/en-us/platform/ai-compliance-assistant/)
- NAVEX says Nira retrieves from authorized documents "rather than open internet knowledge". It is described as "policy-grounded and controlled", and NAVEX states that human review, approval and judgment remain essential. — [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/); [NAVEX AI information](https://www.navex.com/en-us/ai-information/)
- NAVEX has built-in version control and document classification for the content Nira answers from (PolicyTech heritage). — [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/)
- NAVEX announced "Policy Content Integration APIs" (press release, Aug 2026) for secure, automated access to approved policy content in NAVEX One Policy & Procedure Management, so other AI or agents can consume approved policy. — [NAVEX press: Nira and integration APIs](https://www.navex.com/en-us/company/press-room/navex-transforms-policy-management-with-ai-powered-nira-and-integration-apis/)
- ServiceNow Now Assist for HRSD: the Now Assist panel in HR Agent Workspace generates responses from the instance's KB articles. Responses include **in-text citations and source URLs**. Case Summary also gained citations identifying the source of the information. — [Now Assist for HRSD release notes](https://www.servicenow.com/docs/r/yokohama/release-notes/hr-na-rn.html); [Exploring Now Assist for HRSD](https://www.servicenow.com/docs/r/etYGEBUVr6RQYKLnfpRuhw/BI1x6kJeTIBU_Jc3dj7fGg)
- Glean Assistant returns inline citations that link to the original documents. Glean's developer cookbook tells builders to verify that answers "carry numbered citations with real titles and URLs". — [Glean: cited AI outputs](https://www.glean.com/perspectives/how-cited-ai-outputs-enhance-security-for-finance-teams); Glean developer cookbook "permissions-aware retrieval" (the URL https://developers.glean.com/cookbook/permissions-aware-retrieval appeared in search but returned 404 when fetched; the snippet text is quoted from the search index)
- Moveworks answers carry source citations that users open from an info icon under each response, so they can check the underlying article. — [Moveworks AI enterprise search blog](https://www.moveworks.com/us/en/resources/blog/what-is-ai-enterprise-search); [Moveworks help: conversational safeguards](https://help.moveworks.com/agent-studio/agentic-ai/conversational-safeguards-assistant)
- SAP SuccessFactors "Joule Q&A" answers natural-language questions about an organization's HR policy documents using Joule **Document Grounding**. It is included with Joule Base at no additional cost. SAP claims a 70% reduction in employee time spent investigating HR policies (vendor figure). — [SAP Joule Q&A](https://www.sap.com/products/hcm/successfactors-solutions-joule-qa.html)
- SAP Document Grounding ingests customer documents (for example from Microsoft SharePoint), splits them into chunks and vectorizes them. SAP says grounding builds trust "by citing source documents … reducing the possibility of hallucination". — [SAP Introducing Joule (learning)](https://learning.sap.com/learning-journeys/provisioning-and-implementing-joule/introducing-joule); [SAP document grounding](https://www.sap.com/products/artificial-intelligence/document-grounding.html)
- Admins can attach **metadata** to HR policy documents in SuccessFactors "Manage Document Grounding", so Joule personalizes answers using user-profile data (for example country or business unit). — [SAP KBA 3679918](https://userapps.support.sap.com/sap/support/knowledge/en/3679918)
- SAP also has an "HR Knowledge Agent / HR Knowledge Assistant" that uses trusted-partner content to give jurisdiction-specific guidance with clear citations. — [SAP HR Knowledge Agent](https://www.sap.com/turkey/products/hcm/hr-knowledge-agent.html)

### Inferences
- The industry baseline is document-level or chunk-level citation. BrightRule already treats the clause (条款) as its unit, so it could cite "Policy X › 第N条 (version effective YYYY-MM-DD)" with a deep link. That is a concrete step above NAVEX, ServiceNow and SAP.
- SAP's metadata-for-personalization pattern maps onto BrightRule's `organization_id` and applicability. Retrieval should filter by the asker's legal entity, region and role before ranking, not only by ACL.

### Gaps
- No source confirmed section- or paragraph-anchored citation in any product. Microsoft 365 Copilot citation granularity was not checked.
- Workday Assistant, Guru, Ideagen, Diligent and Harvey policy-Q&A features: the searches returned nothing usable, so no claims are made about them.

---

## A2. Permission-aware retrieval (respecting document ACLs)

### Takeaway
The consensus pattern is to **inherit ACLs from the source system and enforce them at query time, before the LLM sees content**. Microsoft adds a second layer: "discoverability" controls that can hide content from AI even when the user technically has access. Microsoft's guidance treats oversharing, not the AI itself, as the main risk.

### Cited Findings
- NAVEX Nira follows the site-based access model configured in NAVEX One Policy & Procedure Management. Users get answers only from sites they can access, and **restricted documents are never sent to Nira for processing**. — [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/)
- Moveworks says answers are tailored to each employee's role, region, language and access permissions. Its docs say permissions are enforced at query time, with security policies inherited from connected systems. — [Moveworks AI enterprise search](https://www.moveworks.com/us/en/resources/blog/what-is-ai-enterprise-search); [Moveworks for ServiceNow customers](https://www.moveworks.com/us/en/platform/moveworks-for-servicenow-customers)
- Glean syncs connector-sourced ACLs, groups, roles and sharing settings into its Enterprise Graph, so enforcement happens before the model sees content. Search results are filtered by each user's access rights. — [Glean: permissions management](https://www.glean.com/perspectives/top-ai-assistants-for-document-permissions-management); [Bloomfire: What is Glean](https://bloomfire.com/resources/what-is-glean/)
- Microsoft 365 Copilot: **Restricted Content Discovery (RCD)** is set per SharePoint site. It stops Copilot and agents from processing that site's content even for users who have access, and it leaves permissions unchanged. Content stays in the index, so eDiscovery and auto-labeling still work. RCD requires SharePoint Advanced Management. — [Microsoft Learn: Restricted Content Discovery](https://learn.microsoft.com/en-us/sharepoint/restricted-content-discovery); [Tech Community: mitigate oversharing (Sep 2025)](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/mitigate-oversharing-to-govern-microsoft-365-copilot-and-agents/4448744)
- Microsoft contrasts RCD with **Restricted Access Control**, which limits a site to members of designated Entra or M365 groups and overrides existing sharing. Purview offers label-based DLP to block Copilot and agents from summarizing labeled content. Restricted SharePoint Search is being retired, with new blocks starting 31 Jul 2026, and RCD is the recommended replacement. — [Microsoft Learn: RCD](https://learn.microsoft.com/en-us/sharepoint/restricted-content-discovery); [Microsoft Learn: SharePoint Copilot best practices](https://learn.microsoft.com/en-us/sharepoint/sharepoint-copilot-best-practices); [Get ready for Copilot with SAM](https://learn.microsoft.com/en-us/sharepoint/get-ready-copilot-sharepoint-advanced-management)
- Commentary framing: "Copilot didn't overshare your data. Your permissions did." — [Petri](https://petri.com/?p=778001)

### Inferences
- BrightRule's rule that clause permissions follow the parent policy (master-detail) fits the "inherit from source" pattern well. Retrieval must filter at the clause level using the parent policy's sharing, plus applicability by organization.
- BrightRule should consider a separate "AI-discoverable" flag, the analogue of RCD and DLP labels. Examples: drafts, superseded versions and confidential annexes that a user may open but that should not feed AI answers. A good default: only **effective** clause versions are retrievable, while historical versions are reachable only through an explicit as-of query.

### Gaps
- No vendor publishes how quickly ACL changes propagate to the AI index. Microsoft says to check current RCD docs for propagation timing.

---

## A3. Handling "no answer found": escalation and ticket creation

### Takeaway
The best practice is **refuse rather than guess**, then hand off with context. ITSM/HR-native assistants (Moveworks, ServiceNow, Leena) route to a human agent or a ticket. Policy-native NAVEX does not document an escalation path. Closing the loop by turning resolved tickets into new knowledge is an emerging pattern.

### Cited Findings
- Glean's cookbook says that when retrieval returns nothing, "the app must say so rather than answering from the model's own knowledge". — Glean developer cookbook (search-index snippet; the page returned 404 on fetch: https://developers.glean.com/cookbook/permissions-aware-retrieval)
- Moveworks hands off to a live agent with the **full conversation context transferred** to the service-desk tool. Handoff can be automatic or user-initiated. The assistant also notifies users of ticket comments, resolutions and status changes. — [Moveworks Concierge & Ticketing](https://docs.moveworks.com/service-management/concierge-assistant); [Moveworks help: Ticket Interception](https://help.moveworks.com/service-management/ticket-interception)
- ServiceNow Now Assist for HRSD lists "chat interaction summarization for case creation". It can also draft a **knowledge article from a closed case** (case must be Close Complete; supported on sn_hr_core_case) or from multiple cases. — [Now Assist for HRSD release notes](https://www.servicenow.com/docs/r/yokohama/release-notes/hr-na-rn.html); [Generate KB article from HR Agent Workspace](https://www.servicenow.com/docs/r/xGHm5nN1KlkEq58WJHJoPw/JYs1T8MQizuB53XaNLlJZw); [Generate KB article from multiple cases](https://www.servicenow.com/docs/r/SogDT~k7ktsbe1ZYegnaLg/MEHFg9Zgb3j7lUefeIxU4Q)
- Leena AI says its bot answers "from your policies and records" and that "what needs HR goes to HR". SAP's partner page says Leena keeps the knowledge base updated "by filling new knowledge from resolved tickets". — [Leena AI HR](https://leena.ai/function/hr); [SAP partner page: Leena AI](https://www.sap.com/sk/products/hcm/partners/leena-ai-inc-hr-service-delivery.html)
- NAVEX's Nira page does not describe no-answer handling or escalation to a policy owner. — [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/)

### Inferences
- BrightRule has an owner on each policy, so it can route unanswered questions to the **policy owner** of the closest-matching policy instead of a generic HR queue. That is more precise than any vendor documented here. The handoff can be modeled as a flow that creates a question/ticket record carrying the conversation summary and the retrieved candidate clauses.
- The "case → KB draft" loop maps to "unanswered question → draft clause interpretation/FAQ → owner approval → new version". That keeps BrightRule's rule that effective versions are never edited in place.

### Gaps
- No vendor documentation found for confidence thresholds or refusal tuning knobs.

---

## A4. Feedback loops and analytics (gap detection)

### Takeaway
Vendors log questions, answers and feedback, and advertise "most-asked questions" analytics. A dedicated **knowledge-gap report** (for example, questions with no grounded answer, grouped by topic) is claimed mainly by competitors and commentators, not clearly documented by Glean, NAVEX or Leena.

### Cited Findings
- NAVEX stores interaction data (user questions, responses, feedback) in a NAVEX-controlled environment separate from other customers. Its audit and error-handling trails show "what questions come up most often". NAVEX also offers a **test mode** for Global Policy Administrators before rollout to employees. — [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/)
- Glean advertises usage analytics and "content insights". A third-party guide says admins can review search behavior, identify frequently asked questions and track content engagement. Bloomfire, a competitor, argues that failed searches reveal knowledge gaps. No Glean doc confirming a dedicated gap report was found. — [Bloomfire: What is Glean](https://bloomfire.com/resources/what-is-glean/)
- Leena AI lists "chatbot analytics". A third-party listing says it analyzes interactions to find recurring issues, usage trends and bottlenecks. — [Leena AI HR chatbot](https://leena.ai/hr-chatbot); [SourceForge: Leena AI](https://sourceforge.net/app/leena-ai/web-app/)

### Inferences
- BrightRule can compute gap analytics per **clause**: clauses never cited, clauses cited with negative feedback (signals ambiguous wording), and questions with no grounded clause (signals a missing policy). That feeds directly into the policy revision workflow.

### Gaps
- No quantitative benchmarks (deflection rates, accuracy) from independent sources.

---

## A5. Multilingual, hallucination controls, audit logging

### Takeaway
Multilingual support is now table stakes: NAVEX claims 70+ languages, and Moveworks localizes answers by language. Hallucination control comes down to grounding-only answering, refusal when nothing is retrieved, and pre-rollout testing. Audit logging of AI interactions is standard in compliance-grade products.

### Cited Findings
- NAVEX Nira supports conversations in more than 70 languages, keeps chat threads for context-aware follow-ups, and runs on desktop and mobile in the NAVEX One Compliance Hub. — [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/)
- NAVEX advertises "full audit and error-handling trails". — [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/)
- Moveworks tailors answers by language as well as role and region. — [Moveworks AI enterprise search](https://www.moveworks.com/us/en/resources/blog/what-is-ai-enterprise-search)
- Microsoft documents Copilot architecture, data protection and **auditing** in a dedicated page; Copilot interactions are covered by Purview audit. — [Microsoft Learn: M365 Copilot architecture, data protection & auditing](https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-architecture-data-protection-auditing) (the page was found in search but not fetched; event names were not verified)
- SAP positions grounding plus citations as its hallucination mitigation. — [SAP document grounding](https://www.sap.com/products/artificial-intelligence/document-grounding.html)

### Inferences
- For BrightRule, the audit record of each Q&A should capture the question, the asker's org and role, the **exact clause version IDs retrieved and cited**, the answer, feedback, and any action taken. That lets a later dispute be replayed against the version in force at that time, which a legal-effect product needs.

### Gaps
- Microsoft Purview audit schema details (for example CopilotInteraction fields) were not fetched or verified.

---

## A6. Routing from answer to action ("ask then act")

### Takeaway
"Ask then act" is mature in ITSM/HR-native assistants: Moveworks plus ServiceNow, Leena, and ServiceNow Now Assist all hand off to cases, tickets or forms. Policy-management vendors (NAVEX) stop at answering and linking. That leaves room for a policy product to connect clause → procedure → workflow.

### Cited Findings
- Moveworks integrates with ServiceNow and other service desks. It hands conversations to live agents with full context and tracks ticket lifecycle in chat. — [Moveworks for ServiceNow customers](https://www.moveworks.com/us/en/platform/moveworks-for-servicenow-customers); [Moveworks Concierge](https://docs.moveworks.com/service-management/concierge-assistant)
- ServiceNow summarizes chat for case creation in HRSD. — [Now Assist for HRSD release notes](https://www.servicenow.com/docs/r/yokohama/release-notes/hr-na-rn.html)
- NAVEX exposes approved policy content via APIs (Aug 2026), so external agents can ground on it. Its assistant itself does not document workflow initiation. — [NAVEX press release](https://www.navex.com/en-us/company/press-room/navex-transforms-policy-management-with-ai-powered-nira-and-integration-apis/); [NAVEX AI compliance assistant](https://www.navex.com/en-us/platform/ai-compliance-assistant/)

### Inferences
- BrightRule's edge would be **clause-to-action bindings**. For example, the expense-reimbursement clause links to the reimbursement flow, so an answer citing that clause shows a "去办理" button prefilled with context, and the permission check happens at action time as well.

### Gaps
- No public docs were found on how Copilot Studio or Glean agents chain policy answers to actions specifically for policy content.

---

## B1. Legislative point-in-time models (legislation.gov.uk, EUR-Lex/ELI, eCFR, China)

### Takeaway
All mature legislative systems model **versions at the provision level, keyed by date**, and expose them through date-in-URL addressing. They keep three things distinct: the act's enactment or publication, an amendment's entry into force or application, and its territorial extent. UK legislation adds an explicit "effect" record linking the amending provision to the affected provision. EUR-Lex shows that "date of entry into force" and "date of application" differ and must be tracked separately.

### Cited Findings
**legislation.gov.uk (UK)**
- Point-in-time URIs take an ISO 8601 date and return the version in force on that date, for example `/ukpga/2023/16/crossheading/.../2025-08-01`. This works for sub-parts such as schedules, crossheadings and body. — [legislation.gov.uk developer URIs](https://www.legislation.gov.uk/developer/uris); [example](https://www.legislation.gov.uk/ukpga/2023/16/crossheading/functions-of-the-office-for-students/2025-08-01)
- **Prospective** provisions (not yet in force) are excluded from point-in-time views. A separate `/prospective` version URI exists, for example `/ukpga/2017/30/prospective`. — [legislation.gov.uk point-in-time search](https://www.legislation.gov.uk/search/point-in-time); [National Archives presentation](https://cdn.nationalarchives.gov.uk/documents/cas-82049-legislation-presentation.pdf)
- Point-in-time is only available for revised legislation, mainly primary legislation, and not for versions before 1 Feb 1991. **Unapplied effects** (not yet editorially applied) appear only in latest or prospective views. — [legislation.gov.uk point-in-time search](https://www.legislation.gov.uk/search/point-in-time); [developer limitations](https://www.legislation.gov.uk/developer/limitations)
- The **Effects data model** stores each change as a record with these fields:
  - effect type (inserted, words substituted, repealed, applied, modified)
  - affecting provisions and affected provisions
  - savings
  - commencement authority (the provision that sets the in-force date)
  - one or more in-force dates, which may be partial, by extent or purpose
  - extent and territorial application for both sides
  - applied / requires-applied status (separately for Welsh text)
  - effect notes

  Effects have URIs `/id/effect/{id}`, appear in XML as `<Effect>` or `<UnappliedEffect EffectId=…>`, and are exposed through feeds under `/changes/affected/` and `/changes/affecting/`. — [legislation.github.io data model: effects](https://legislation.github.io/data-documentation/model/effects.html)
- Editors create a **new version** of an item and apply effects to its text. Revision tags and commentaries carry identifiers that link back to the effect. Some older amendments have no such link. — [legislation.github.io effects](https://legislation.github.io/data-documentation/model/effects.html)
- Extent views show territorial applicability per provision, for example `?view=extent`. — [legislation.gov.uk extent example](https://www.legislation.gov.uk/ukpga/2015/20/crossheading/other-measures-to-reduce-burdens-on-public-authorities/2016-03-02?view=extent)

**EUR-Lex / ELI (EU)**
- A consolidated version's **start date** is normally the amending act's **date of application** if it has one, otherwise its entry-into-force date. The start date distinguishes versions and is part of the link. — [EUR-Lex consolidation notice](https://eur-lex.europa.eu/content/legis/avis_consolidation.html); [Methodology on Consolidation (PDF)](https://eurlex.europa.eu/content/intro/collection/Methodology-on-Consolidation.pdf)
- The ELI pattern for consolidated legislation is `http://data.europa.eu/eli/{typedoc}/{year}/{naturalnumber}/{start-date}`. — [EUR-Lex ELI register](https://eur-lex.europa.eu/eli-register/eu_publications_office.html)
- Each act page lists all consolidated versions, with the version applicable today shown in bold at the top. The consolidated header date is when the latest included amendment becomes applicable, which can differ from entry into force. — [EUR-Lex consolidated collection](https://eur-lex.europa.eu/collection/eu-law/consleg.html); [EUR-Lex finding consolidated texts](https://eur-lex.europa.eu/content/online-learning/eurlex-content/finding-consolidated-texts-transcript-en.pdf)
- ELI supports both temporal versions (point-in-time URI components) and language versions. — [arXiv 2506.07853](https://arxiv.org/pdf/2506.07853)

**eCFR (US)**
- The eCFR **Versioner** API puts a date in the path. Examples: `/api/versioner/v1/full/{date}/title-{n}.xml`, date-keyed structure and ancestry endpoints (ancestry of a leaf node at a point in time), and a versions list filterable by `issue_date[gte]`, part and section. — [eCFR developer resources](https://www.ecfr.gov/reader-aids/ecfr-developer-resources); [apis.io eCFR Versioner (third-party mirror)](https://apis.io/apis/ecfr/ecfr-versioner-service-api/); [vaquill.ai guide](https://www.vaquill.ai/blog/cfr-annual-editions-point-in-time-api)
- eCFR search can run "as it appeared at a specific point in time" using a date field. — [eCFR reader aids](https://www.ecfr.gov/reader-aids)
- The open-source CMCS eRegulations project builds a section "timeline" feature on top of eCFR versions. — [cmcs-eregulations wiki: timeline](https://github.com/Enterprise-CMCS/cmcs-eregulations/wiki/Feature:-timeline)

**China**
- Chinese law portals mark superseded versions "已被修改" and link to the current version ("现行有效"). They also record amendment history (for example 立法法 2015 and 2023 amendments). — [Example law KB page (third-party)](https://publish.obsidian.md/wanyulawyer/1.+%E7%8E%B0%E8%A1%8C%E6%B3%95%E5%BE%8B%E6%B3%95%E8%A7%84%E5%BA%93/1.2+%E5%AE%AA%E6%B3%95%E7%9B%B8%E5%85%B3%E6%B3%95/1.2.1+%E7%AB%8B%E6%B3%95/%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E7%AB%8B%E6%B3%95%E6%B3%95%EF%BC%882023%E4%BF%AE%E6%AD%A3%EF%BC%89)
- State Council "batch amendment/repeal" decisions change specific articles of multiple regulations at once, with a stated 施行日期. One example amends 21 administrative regulations and repeals 4, effective 2025-01-20. Point-in-time validity therefore depends on tracking the decision's effective date per article. — [gov.cn decision PDF](https://www.gov.cn/gbgl/e1fd6935b5cf4f3da4aca7a1125d23e3/files/f86adf87fc684030980c26d8e0c8f773.pdf)

### Inferences
- The "effect" record (affecting clause → affected clause, type, commencement authority, in-force date(s), extent, applied status) is the single most transferable pattern for BrightRule. A revision document such as 《关于修订〈X制度〉的通知》 is the "affecting" instrument. Each clause change becomes an effect, and the "applied" status separates "amendment approved" from "consolidated text updated".
- The minimum set of dates to track is: 发布日期 (publication), 生效/施行日期 (entry into force), 适用日期 (application, when different, EU style), 废止/失效日期 (repeal or expiry), and optionally a 效力 (efficacy) interval separate from 存续 (validity), per Akoma Ntoso (see B2).
- Batch amendment (one notice changing clauses across many policies) is common in Chinese practice, as with the State Council decisions above, so effects must support many-to-many.

### Gaps
- 国家法律法规数据库 (flk.npc.gov.cn): its own UI or API for historical versions and "尚未生效" was not reachable in search, and only third-party mirrors were found. Confirm directly on flk.npc.gov.cn.
- US Code (uscode.house.gov) point-in-time ("prior release points") was not researched.

---

## B2. Standards: Akoma Ntoso / LegalDocML (FRBR, lifecycle, temporal data), LegalRuleML

### Takeaway
Akoma Ntoso (OASIS LegalDocML) is the reference model. It places FRBR Work/Expression/Manifestation identity in metadata, records a `<lifecycle>` of dated `<eventRef>`s, and records `<temporalData>` intervals for "in force" vs "efficacy". It marks every fragment with `@start`/`@end` (and `@startEfficacy`/`@endEfficacy`) pointing to events. Active/passive `textualMod` records carry insertion, substitution and repeal. Academic work (2025) notes these standards still lack native **component-level** versioning and event provenance.

### Cited Findings
- FRBR levels in Akoma Ntoso:
  - **Work** is the abstract legal resource.
  - **Expression** is a specific version, differing by language or amendment state; authors create it.
  - **Manifestation** is a format such as XML or PDF; editors create it.
  - **Item** is a stored file.

  — [OASIS AKN Core v1.0 Part 1 Vocabulary](https://docs.oasis-open.org/legaldocml/akn-core/v1.0/os/part1-vocabulary/akn-core-v1.0-os-part1-vocabulary.html)
- IRI naming:
  - The Work IRI carries the work date, for example `/akn/un/act/2011-11-22/10`.
  - The Expression IRI adds language and an **expression date after "@"**, for example `…/eng@2013-12-19`, meaning the version in force at that date. When no date applies, a version number such as `eng@v_3` is used, recorded with `FRBRversionNumber`.
  - The Manifestation IRI adds a format, for example `!main.xml`, recorded with `FRBRformat`.
  - Fragment references use `#`, for example `/akn/za/act1996-10-10/84/!main#sec_1`.

  — [OASIS AKN Core v1.0 Part 1](https://docs.oasis-open.org/legaldocml/akn-core/v1.0/os/part1-vocabulary/akn-core-v1.0-os-part1-vocabulary.html)
- `<lifecycle>` in `<meta>` lists `<eventRef eId date source type>` events, with `type` values such as "generation" and "amendment". `source` points to `<references>` that identify the document causing the event. Lifecycle is required for singleVersion and multipleVersions documents and optional for originalVersion. — [OASIS AKN Core v1.0 Part 1](https://docs.oasis-open.org/legaldocml/akn-core/v1.0/os/part1-vocabulary/akn-core-v1.0-os-part1-vocabulary.html)
- `<temporalData>` contains `<temporalGroup eId>` elements holding `<timeInterval refersTo start end>`, where `refersTo` is, for example, "#inforce" or "#efficacy". `textualMod` links to these through `@period`. — same source
- The document `@contains` attribute takes one of three values:
  - **originalVersion**: as approved, no amendments applied.
  - **singleVersion**: consolidated as of one point.
  - **multipleVersions**: fragments from several versions, each tagged with the versions it belongs to.

  — same source
- Fragment attributes `@start`/`@end` (validity) and `@startEfficacy`/`@endEfficacy` reference event IDs. A `@start` with no `@end` means the fragment still exists in the latest version. `@status` takes values such as "omissis" and "editorial". — same source
- `<analysis>` holds `<activeModifications>` (changes this document makes to others) and `<passiveModifications>` (changes received). `<textualMod type>` has children `source`, `destination` (with `pos`), `old`, `new` and `previous`. Types cover insertion, substitution, repeal, join, split and renumbering. An `exclusion` attribute can block automatic consolidation. — same source
- A 2025 paper argues that FRBR/FRBRoo and Akoma Ntoso model documents at a macro level and "lack native mechanisms for granular, component-level versioning". It proposes an LRMoo-based, component-level, **event-centric** model with reified provenance tracing each change to its source instrument. — [arXiv 2506.07853: Diachronic Evolution of Legal Norms](https://arxiv.org/pdf/2506.07853)

### Inferences
- A suggested BrightRule mapping:
  - `brightrule_policy` corresponds to Work.
  - `brightrule_policy_version` (an amendment state of the whole policy) corresponds to Expression, with language as a second axis.
  - Rendered PDF or Word output corresponds to Manifestation.
  - `brightrule_clause` (stable identity, for example "第12条") plus `brightrule_clause_version` (text plus valid_from/valid_to plus optional efficacy_from/efficacy_to) is the component-level versioning that the arXiv paper says the standards lack.
  - A `brightrule_amendment_event` (or effect) record corresponds to eventRef/textualMod.
- The "multipleVersions" concept justifies storing all clause versions in one structure and answering as-of queries with `valid_from <= D < valid_to`, instead of storing a full snapshot per policy version.
- Keep stable clause IDs (eId-like, for example `art_12__para_2`) independent of display numbering. Renumbering is an explicit modification type in AKN, so citations survive renumbering.

### Gaps
- LegalRuleML (rules, obligations, deontic modalities) was not fetched. No claims are made about it.
- The Akoma Ntoso naming-convention document (AKN-NC) was not separately fetched. The `eventRef` "repeal" type value was not confirmed in the excerpt read.

---

## B3. Enterprise products managing policies at section/clause/obligation level

### Takeaway
In GRC/RegTech, the structured unit below the document is the **obligation, citation or policy statement**, mapped many-to-many to controls, risks and policies. ServiceNow IRM uses Authority Document → Citation and Policy → Policy Statement → Control, joined through Control Objectives. RegTech vendors (CUBE, Ascent) auto-generate obligation registers and diff them when regulations change. These systems manage clause-like units and traceability. The sources found do not document point-in-time querying of policy text.

### Cited Findings
- ServiceNow IRM Policy & Compliance (community architecture article):
  - Authority documents (GDPR, HIPAA, PCI-DSS, SOX, ISO 27001) hold **citations** (for example "Article 32 — Encryption of personal data").
  - Citations and control objectives are both "Content".
  - **Control objectives** are the hub where external requirements and internal policies meet.

  — [ServiceNow Community: Policy and Compliance Management architecture and data model](https://www.servicenow.com/community/grc-articles/policy-and-compliance-management-architecture-and-data-model/ta-p/3605503)
- In ServiceNow, controls are generated from **Policy Statements**, and citations relate to policy statements. Out of the box, citations map to controls through control objectives, not directly (ServiceNow employee answer on Community). — [ServiceNow Community: policies, statements and controls](https://www.servicenow.com/community/grc-forum/understanding-the-relationship-between-policies-statements-and/m-p/1320675); [Community: citation to controls](https://www.servicenow.com/community/new-customers-policy-risk-forum/is-it-possible-to-connect-citation-to-controls-amp-business/m-p/3329891)
- ServiceNow Zurich (PCM 21.1.3, Dec 2025) added direct association of controls to citations, with compliance scores on citations and authority documents reflecting this. — [ServiceNow PCM release notes](https://www.servicenow.com/docs/r/u1slaAtcFiiXFQcd9RcR_A/gwYngBPSB~ClWzlC8VcCDA)
- CUBE (ServiceNow Store connector) turns regulatory change into **structured obligations** using AI plus expert validation. These feed ServiceNow Regulatory Change Management, where obligations are mapped to policies, risks and controls. — [ServiceNow Store: CUBE](https://store.servicenow.com/store/app/f6330942476eb2d439e06507e26d431b)
- Ascent's **Obligations Library** is an auto-generated, up-to-date digital register of a firm's obligations. When rules change, it shows new, deleted or changed obligations. AscentFocus links obligations to policies, procedures and controls for end-to-end traceability. The vendor claims a 400K+ obligation global library. — [Ascent Obligations Library](https://www.ascentregtech.com/?p=1830); [Ascent Regulatory Change Management](https://www.ascentregtech.com/?p=1161); [AscentAI eBook](https://landing.ascentregtech.com/hubfs/2025%20Platform%20One-Pagers/AscentAI%20Overview%20eBook%20Final.pdf)

### Inferences
- BrightRule's clause model should support **external-requirement mapping**: clause ↔ regulation article/citation ↔ control/obligation. That way an upstream regulatory change (an Ascent-style diff) flags the affected internal clauses for revision. This is the regulatory analogue of legislation.gov.uk's affected/affecting effects.
- Group policy vs subsidiary implementing rules: ServiceNow's pattern (one policy statement drives many controls across entities) and legislation.gov.uk's per-provision **extent** both suggest the same design. Express subsidiary applicability as attributes or links (organization scope, plus "implements/derives_from" links from subsidiary clause to group clause) rather than copying clauses. That matches BrightRule's AGENTS.md rule. A change to a parent clause can then raise "pending review" flags on derived subsidiary clauses, much as an unapplied effect flags pending work.

### Gaps
- DITA CCMS for policies, Clausebase and contract clause libraries, Archer, Ideagen PolicyHub, Diligent, ConvergePoint and PolicyStat clause-level features: not researched within the budget, so no claims are made.
- Group/subsidiary policy inheritance and override (parent policy plus local addenda with precedence rules): no product documentation was found describing this explicitly. It is a genuine gap in public material, and likely a differentiation opportunity.
- No enterprise policy product was found that offers documented **"as-of date" querying** of policy text (UK/EU-style). Absence of evidence is not proof of absence.
