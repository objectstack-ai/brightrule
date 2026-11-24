# Regulated-Industry Policy & Controlled-Document Management Systems — Feature Inventory

> Scope: healthcare, life sciences / QMS, financial services (RegTech), public sector / public safety. Research date: 2026-11-24. Most product evidence is **vendor marketing or vendor-adjacent material** (datasheets, press releases, aggregator listings); independent verification was rarely available, so treat feature claims as vendor claims unless noted. Product and feature names kept in original English; notes mixed English/中文.
>
> 来源说明：本次调研约 20 余次检索/抓取；部分页面（Lexipol help center 需登录 401、若干 PDF）无法直接读取，已在 Gaps 中标注。

## Q1. Document control requirements (21 CFR Part 11, ISO 9001 7.5 / ISO 13485, Joint Commission) and how products implement them

### Takeaway
Regulations require a small, stable set of controls — validated systems, secure time-stamped audit trails, signature manifestation (name/date/meaning) bound to the record, approval before issue, periodic review/update, change identification, availability at point of use, and prevention of unintended use of obsolete documents. Leading QMS/policy products productize each requirement as a named feature (lifecycle states with effective/superseded/obsolete, Signature Manifestation, Periodic Review, Controlled Copies, Document Change Control, watermarks/overlays).

### Cited Findings
**Regulatory requirements (primary or near-primary text)**
- 21 CFR Part 11 §11.10 requires closed systems to have: validation (a); ability to generate accurate and complete copies in human-readable and electronic form for FDA inspection (b); record protection for retention period (c); limited system access to authorized individuals (d); "secure, computer-generated, time-stamped audit trails" recording operator entries/actions that create, modify or delete records, where changes must not obscure previously recorded information and audit trail retained as long as the record (e); operational/sequencing checks (f); authority checks (g); device checks (h); trained personnel (i); written policies holding individuals accountable for e-signature actions (j); and documentation controls over system documentation, including revision and change control (k) — [eCFR 21 CFR Part 11](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11)
- §11.50 signature manifestation: signed electronic records must show printed name of signer, date and time of signing, and the meaning of the signature (e.g., review, approval, responsibility, authorship); §11.70 requires signatures be linked to their records so they cannot be excised, copied or transferred to falsify records; §11.200 non-biometric signatures need at least two distinct identification components (e.g., ID + password), with all components required at the first signing of a continuous session; §11.300 governs ID/password uniqueness, periodic checking and revocation — [eCFR 21 CFR Part 11](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11)
- ISO 9001:2015 clause 7.5.3 covers distribution, access, retrieval and use; storage and preservation; control of changes (version control); retention and disposition; and requires obsolete documented information retained for any purpose to be suitably identified to prevent unintended use (commentary places this at 7.5.3.2; secondary source — verify against standard) — [isotracker blog](https://www.isotracker.com/blog/document-control-in-iso-90012015-what-the-standard-requires/); [iso-9001-checklist.co.uk](https://www.iso-9001-checklist.co.uk/7.5.3-control-of-documented-information-explained.htm)
- 7.5.3 distinguishes "maintained" documented information (reviewed, revised, reissued when requirements/processes change) from "retained" information (evidence of what happened); relevant versions must be available at points of use and external-origin documents identified and their distribution controlled — [open-exam-prep CQI/IRCA guide](https://open-exam-prep.com/study-guides/cqi-irca-qms-lead-auditor/clauses-6-7/clause-7-documented-info); [isms.online](https://www.isms.online/iso-9001/clause-7-5-documented-information/)
- Obsolete documents kept for preservation should be marked "Obsolete" / "Superseded"; disposition may involve archiving, secure disposal or transfer per legal requirements (secondary/commentary) — [Smithers Summarizes: ISO 9001 Document Control (Feb 2026)](https://prd-b4f.smithers.com/resources/2026/february/smithers-summarizes-iso-9001-document-control); [qualityinconstruction.com](https://qualityinconstruction.com/iso-9001-document-control/)
- Joint Commission evaluates compliance with its standards, CMS Conditions of Participation, applicable federal/state/local law, **and the organization's own internal policies and procedures**; organizations that write policies stricter than the standards get scored against their self-imposed requirements ("they then get scored as being out of compliance" — David Baker, MD, TJC) — [AMA "Adherence to Joint Commission Standards" myth-buster (2024)](https://www.ama-assn.org/system/files/regulatory-myths-joint-comm-standards.pdf)
- FDA training rules referenced by QMS vendors: 21 CFR 820.25 (devices) and 21 CFR 211.25 (pharma) personnel training — [MasterControl Part 11 Training](https://www.mastercontrol.com/compliance/21-cfr-regulations/21-cfr-part-11/training)

**How products implement document control**
- Veeva QualityDocs (2025 Features Brief): predefined lifecycles, document types and workflows covering "approval, training, release, review and withdrawal"; "Flexible Workflows" for authoring, reviewing, approving, issuing, **superseding and obsoleting**; can add recipients/delegate/cancel in-flight workflows — [Veeva QualityDocs Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- Veeva "Document Change Control": manage creation, revision and retirement of **associated** controlled documents with Vault automating their **coordinated release/obsolescence** (multi-document change control) — [Veeva QualityDocs Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf); course outline lists "Periodic review | Multi-Doc Change Control | Security" — [Veeva Education](https://education.veeva.com/products/vault-qualitydocs-business-administrator-track)
- Veeva "Signature Manifestation": choose when/how to display signer's name, date and reason for sign-off, including on audio/video files (direct implementation of §11.50) — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- Veeva "Watermarking and Overlays": dynamic overlays/watermarks showing document, user or access info such as status or effective date on header/footer/page (uncontrolled-copy marking) — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- Veeva "Controlled Copies": control who can create copies and take them outside Vault; track individual copies' statuses in the field or during/after **recall** — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- Veeva "Periodic Review": automatically trigger review reminders based on predefined rules; real-time reports on review task status; "Reports and Dashboards" on overdue workflow tasks, upcoming periodic reviews and requested document changes; "Process Navigator" browses content by process — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- MasterControl Documents: time-stamped audit trail and electronic signatures "in accordance with 21 CFR Part 11" — [MasterControl Document Control data sheet](https://www.mastercontrol.com/ppc/document-control-software/)
- NAVEX PolicyTech: automatic version control; approved documents distributed automatically to relevant audience; ad-hoc reports on who attested to which **version** — [NAVEX PolicyTech datasheet](https://www.navex.com/en-gb/resources/datasheets/policytech-policy-procedure-management/); [Track readership use case](https://cdn.navex.com/image/upload/v1674132294/resource%20documents/track-readership-policytech-usecase.pdf)
- RLDatix PolicyStat: converts static PDF/Word into searchable web pages, approval workflows, compliance reporting — [RLDatix Policy Management](https://rldatix.com/en-nam/products/policy-management); policy-expiry notifications (third-party guide) — [Mitratech blog](https://mitratech.com/es-la/centro-de-recursos/blog/best-policy-management-healthcare/)
- MCN Policy Manager: cloud document control and workflow automating policy access, review, approval and attestation; indexing, retention, notifications & reminders, workflow configuration (aggregator listing) — [Capterra](https://www.capterra.com/p/80008/Policy-Manager/reviews/); [SourceForge](https://www.sourceforge.net/software/product/PolicyManager)
- Corlytics policy module (aggregator listing): policy creation, library, audit trails, workflow, approval controls, training, attestation, version control, policy metadata — [SourceForge Corlytics](https://www.sourceforge.net/software/product/Corlytics)

### Inferences
- The regulatory "minimum feature set" for a controlled-document system = {lifecycle states incl. Effective/Superseded/Obsolete; approval before issue; e-signature with meaning + 2-factor re-authentication; immutable time-stamped audit trail; periodic review scheduler; change request/change control linking multiple docs; controlled-copy issuance + recall; uncontrolled-print watermark; point-of-use availability (search/mobile); retention & disposition; external-document register}. 对 BrightRule：“生效版本不可原地修改、修订产生新版本”的约定与 Part 11 §11.10(e) 和 ISO 7.5.3 change control 一致。
- The Joint Commission point is important for product design: in healthcare, the internal policy itself becomes the audited requirement, so the system must make it easy to *not* over-specify and to prove staff followed the current version.
- "Coordinated release/obsolescence" (Veeva) is a feature generic DMS lacks: one change order releases a new SOP and simultaneously obsoletes predecessors and dependent forms on the same effective date.

### Gaps
- Could not read the ISO 9001/13485 standard text directly (paywalled); sub-clause numbering from commentary. ISO 13485:2016 clause 4.2.4 (control of documents, incl. preventing deterioration/loss and retention ≥ product lifetime) not verified in this session.
- Did not retrieve a Joint Commission primary source on policy review frequency (common belief that TJC requires annual review of all policies is reportedly a myth, but not verified here) or the LD.04.01.07 wording.
- A search summary said a Joint Commission webinar describes the 2026 reorganization of hospital standards, which changes standard numbering and would force crosswalks to be remapped. The primary TJC source was not read, so this is unverified.
- No source found for EU Annex 11 or China NMPA GMP appendix on computerized systems (outside the searches done).

## Q2. Linking internal policies to external standards/regulations at clause/obligation level (obligation libraries, change alerts, impact & gap analysis)

### Takeaway
Two distinct linkage models exist: (a) **accreditation crosswalks** in healthcare/public safety, where licensed standards manuals (TJC, CALEA, DNV, CARF…) are loaded and policies/proofs are mapped to individual standards/elements of performance, with flags when a standard changes; and (b) **obligation-based regulatory change management** in financial services, where regulations are decomposed into an obligations register, changes are detected via horizon scanning, and AI maps obligations → policies/controls with new/changed/deleted-obligation impact analysis.

### Cited Findings
**Accreditation crosswalk model (healthcare / public safety)**
- RLDatix PolicyStat links policies directly to corresponding accreditation standards incl. The Joint Commission, HFAP, DNV, CMS CoPs and CAP — [RLDatix Policy Management](https://rldatix.com/en-nam/products/policy-management)
- Baptist Health case: policies mapped to specific Joint Commission standards **and elements of performance (EPs)** plus state standards; automated email when a linked policy is revised and acknowledged — [RLDatix Baptist Health case](https://www.rldatix.com/en-nam/?p=8201)
- PowerDMS has licensing agreements with AAAHC, CIHQ, DNV, NCCHC, TJC, CARF, ACHC and NCQA so customers can crosswalk policies **and evidence of compliance** directly to standards — [PowerDMS healthcare comparison](https://www.powerdms.com/why-powerdms/healthcare)
- PowerDMS licensed Joint Commission standards manuals (2020 announcement); when a standard is updated, PowerDMS notifies organizations and **flags documents in need of review** — [PowerDMS–TJC licensing announcement](https://www.powerdms.com/news-press/powerdms-announces-licensing-agreement-to-publish-and-distribute-joint-commission-standards-manuals-and-policy-content); [How to map policies to accreditation standards](https://www.powerdms.com/policy-learning-center/how-to-map-policies-to-accreditation-standards-in-healthcare)
- CALEA: on enrollment agencies get "PowerStandards" access to view CALEA Standards electronically and build an electronic assessment; agencies map policies and other proofs of compliance to specific standards; all agencies seeking CALEA accreditation/re-accreditation use PowerDMS; PowerDMS is the only authorized distributor of CALEA publications — [CALEA/PowerDMS page](https://calea.org/powerdms); [PowerDMS accreditation management](https://www.powerdms.com/product/accreditation-management)
- PowerDMS "CALEA Policy Resource Library" integration (model policy content tied to standards) — [PowerDMS CALEA policy resource library](https://www.powerdms.com/integrations/calea-policy-resource-library)
- Joint Commission itself publishes a crosswalk between CMS CoPs and TJC standards; its Tracers with AMP tool also crosswalks CMS CoPs and TJC standards — per search summary of [TJC digital assets](https://digitalassets.jointcommission.org/api/public/content/573bb99a05a94690ab351210b17424b8) (not read in full)

**Obligation-based model (financial services RegTech)**
- Ascent (AscentAI) generates a digital **Obligations Library/register** of a firm's obligations; indicates whether a rule change impacts existing obligations; obligations are auto-updated for review when new rules are published; each change shows whether it **creates, deletes or alters** obligations — [Ascent Obligations Library](https://www.ascentregtech.com/?p=1830); [Ascent for Regulatory Change Management](https://www.ascentregtech.com/?p=1161)
- "AscentFocus" automates regulatory mapping to create a tailored inventory of obligations across business lines; obligations inventory connects to a firm's GRC tool and routes regulatory change to **policy owners** with an audit trail; "AscentHorizon" = global FS horizon scanning — [AscentFocus](https://www.ascentregtech.com/rlm-platform/ascentfocus/); [Obligation Inventory Mapping](https://www.ascentregtech.com/?p=310635)
- Ascent argues obligations (not documents) are the unit of change: a single consultation paper, speech, rule or enforcement notice can hold many distinct requirements (promotional) — [fintech.global, 30 Oct 2026](https://fintech.global/2026/10/30/why-ascentai-makes-obligations-the-unit-of-regtech-change/); [Ascent blog](https://ascentregtech.com/?p=313582)
- Thomson Reuters Regulatory Intelligence **Obligations Library**: breaks each regulation into **subsection-level** documents; includes only provisions imposing an express or implied duty; "Compliance Requirements" filter by cross-industry/industry category; experts update each obligation within 30 days of a change; flags upcoming obligations up to a year before effect where available (2023 sell sheet) — [TR Obligations Library sell sheet](https://thomsonreuters.com/content/dam/helpandsupp/en-us/Topics/regulatory-intelligence/files/regulatory-intelligence-obligations-library-sell-sheet.pdf)
- Wolters Kluwer **Compliance Intelligence** (launched 2 Oct 2025): unifies regulatory data "from alerts to enterprise compliance obligations"; groups related regulations into rationalized **enterprise obligations dynamically linked to source regulations**; AI summarizes and tags each change; **red-lining** for impact assessment; emphasizes human oversight; vendor claims ~86% less time on obligation creation, ~70% on obligation management (unverified) — [Business Wire release](https://www.businesswire.com/news/home/20251002619927/en/Wolters-Kluwer-Launches-Compliance-Intelligence-Strengthening-Transformational-Regulatory-Change-and-Obligation-Management-Capabilities); [WK Compliance Intelligence](https://www.wolterskluwer.com/en/solutions/compliance-intelligence); [WK expert insight Oct 2026](https://wolterskluwer.com/en/expert-insights/introducing-compliance-intelligence-trusted-ai-for-when-you-have-to-be-right)
- WK also offers OneSumX for Regulatory Insight (regulatory change content within OneSumX compliance program management) — [WK OneSumX for Regulatory Insight](https://www.wolterskluwer.com/en-ca/solutions/onesumx-for-compliance-program-management/onesumx-for-regulatory-insight)
- Compliance.ai Enterprise Edition (Oct 2023): automatic change alerts mapped onto internal **policies, procedures and controls**; impact and gap analysis across regulatory processes — [PR Newswire, Oct 2023](https://prnewswire.com/news-releases/complianceai-introduces-enterprise-edition-regulatory-compliance-and-risk-management-solution-for-internal-policies-procedures-and-controls-301951807.html)
- CUBE acquired 4CRisk.ai (reported closing Oct 2025, Hg-backed): 4CRisk's agentic AI maps internal policies and procedures to regulatory obligations and controls; combination moves customers from detecting a change to assessing its impact on internal governance; RegPlatform tracks, interprets and operationalises regulatory change; "up to 50x faster than manual mapping" is a vendor claim — [Fintech Times](https://thefintechtimes.com/cube-acquires-silicon-valleys-4crisk-to-accelerate-ai-compliance-automation/); [A-Team Insight](https://a-teaminsight.com/briefs/cube-acquires-silicon-valley-regtech-4crisk-delivering-next-generation-compliance-and-risk-mapping-automation/?brand=rti); [fintech.global](https://fintech.global/?p=232326)
- Corlytics: "Regulatory Controls Mapping" maps obligations to policies, standards, procedures, controls and processes with "full dynamic traceability"; "Regulatory Taxonomy Management" (developed with work for the UK FCA) maps regulatory content to legal entities, businesses, products and control frameworks; acquired Clausematch (policy drafting/oversight) and ING's Sparq; FinTech Breakthrough award (Mar 2026) for combining regulatory monitoring, obligations extraction and policy governance in one system — [Corlytics regulatory controls mapping (mirror)](https://kelaenderkoe.pages.dev/patterns-https-www.corlytics.com/solutions/regulatory-controls-mapping); [Finextra](https://www.finextra.com/pressarticle/73209/corlytics-releases-regulatory-taxonomy-mapping-platform); [CFOtech](https://cfotech.com.au/story/corlytics-wins-fintech-breakthrough-policy-management-award)
- Corlytics–Solidatus partnership pushes regulatory content into Solidatus data catalogs to link to processes, policies and controls (lineage-style traceability) — [A-Team Insight](https://a-teaminsight.com/blog/solidatus-and-corlytics-map-regulatory-content-to-company-processes-policies-systems-and-controls/?brand=ati)
- NAVEX use case for simplifying required regulatory edits and audits (PolicyTech) — [NAVEX use case PDF 2025](https://cdn.navex.com/image/upload/v1740141370/resources-2025/use-cases/navex-simplify-required-regulatory-edits-audits-usecase_EN.pdf) (not read in full)

### Inferences
- Common data model across both camps: `External source (regulator/standard body) → Regulation/Standard → Clause / Element of Performance / Obligation → mapping → internal Policy clause / Procedure / Control / Evidence`, with change events on the external side propagating "needs review" flags to mapped internal items. 对 BrightRule：以条款（clause）为管理单元正好对应 obligation 级映射；建议建模 `external_requirement`（外规条款/义务）与 `brightrule_clause` 的多对多映射表，并支持外规变更→受影响内规条款自动标记待评估。
- Impact taxonomy worth copying: new / amended / deleted obligation (Ascent), red-line diff of the regulation (WK), effective-date lookahead (TR flags up to 12 months ahead).
- Gap analysis = obligations with zero mapped policies/controls, or standards with no evidence attached (PowerDMS/CALEA model).
- Financial-services products separate "regulatory content" (often vendor-curated, licensed) from "firm-specific obligation register" (rationalized, de-duplicated enterprise obligations — WK's term).

### Gaps
- No primary product documentation found for Lucidoc or ellucid standards crosswalks.
- Compliance.ai ownership: my recollection is that Archer acquired Compliance.ai in 2024, but no source was retrieved in this session — unverified.
- Thomson Reuters info is from a 2023 sell sheet; current (2026) TR product packaging (e.g., any CoCounsel/AI integration in Regulatory Intelligence) not verified.
- No Chartis RiskTech100 rankings retrieved.

## Q3. Training linkage (policy change → training assignment, read-and-understood, competency)

### Takeaway
Regulated systems treat "training on the new version" as part of the document lifecycle: a revision of a controlled document automatically (re)assigns read-and-understood or course tasks to affected roles, captured with e-signature and reported as overdue/complete; optional quizzes prove comprehension. QMS suites (MasterControl, Veeva) tie this to Part 820/211 personnel-training rules; policy tools (PolicyTech, PowerDMS, PolicyStat) implement attestation + quizzes.

### Cited Findings
- MasterControl: training automatically triggered when an essential quality document is revised; training integrated with the change workflow (vs. manual processes where training is not integrated with change) — [MasterControl Training Controls](https://www.mastercontrol.com/quality/training-software/controls); [MasterControl change control overview (Scribd copy)](https://www.scribd.com/document/43405185/Master-Control-Change-Control)
- Veeva: lifecycles cover "approval, training, release, review and withdrawal"; training documents/videos delivered to employees with traceability and reporting on all **"read and understood"** actions (who viewed, signed off, overdue) — [Veeva QualityDocs Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf); [Veeva QualityDocs datasheet](https://www.veeva.com/wp-content/uploads/2013/12/Veeva_Vault_QualityDocs_Datasheet.pdf); Veeva Quality Cloud unifies content, training, QMS and LIMS — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- NAVEX PolicyTech: automatic attestation tracking; optional topic and policy **quizzes** built into attestation to validate understanding; reports include quiz scores and which version was attested — [NAVEX PolicyTech datasheet](https://www.navex.com/en-gb/resources/datasheets/policytech-policy-procedure-management/); [Track readership use case](https://cdn.navex.com/image/upload/v1674132294/resource%20documents/track-readership-policytech-usecase.pdf)
- RLDatix PolicyStat (Baptist Health): automated email when a policy linked to a standard is revised and acknowledged — [RLDatix Baptist Health case](https://www.rldatix.com/en-nam/?p=8201)
- PowerDMS: AI generates **flashcards from policies** (training reinforcement) — [PowerDMS alternatives page](https://www.powerdms.com/policy-learning-center/powerdms-alternatives)
- Lexipol couples state-specific policy manuals with training content ("State-specific Policy and Training Solutions") — [Officer.com product listing](https://www.officer.com/command-hq/supplies-services/product/10731711/lexipol-state-specific-policy-and-training-solutions-state-specific-policy-manual)
- Part 11 itself requires that persons who develop, maintain or use e-record systems have education, training and experience (§11.10(i)) — [eCFR 21 CFR Part 11](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11)

### Inferences
- Minimum training-linkage feature set: role/job-function-based audience on each document; on Effective-state transition auto-create read-and-understood tasks (with e-signature) for the audience; block "effective" until training window closes (training period before effective date is a common QMS pattern, not verified here); overdue escalation; per-version attestation history; optional quiz; competency matrix (role × document).
- 对 BrightRule：制度发布/修订可触发“学习确认/考试”任务，按适用组织（organization_id）和岗位推送；记录到条款级版本。

### Gaps
- No primary documentation on MasterControl's configuration of auto-assignment (trigger statuses, grace periods) or competency/qualification matrices; ComplianceQuest/ETQ/Qualio training-linkage specifics not retrieved.
- No source found for "effective date delayed until training complete" behavior in a named product.

## Q4. Accreditation / survey / inspection readiness features

### Takeaway
Readiness features center on (1) a standards-structured self-assessment with proofs attached per standard, (2) assessor/surveyor accounts with scoped permissions inside the system, (3) status-setting, notes and exportable reports, and (4) audit trails plus search for inspections. PowerDMS/CALEA is the most concrete example; QMS vendors emphasize audit trails and "accurate and complete copies" for FDA inspection.

### Cited Findings
- PowerDMS can provide assessors **remote access** to an agency's self-assessment — [PowerDMS accreditation management](https://www.powerdms.com/product/accreditation-management); [Benefits of managing accreditation](https://www.powerdms.com/policy-learning-center/benefits-of-managing-accreditation-with-policy-manual-software)
- PLEAC (Pennsylvania) guide: assessor accounts created via groups; "Mock Assessor" role can participate, "Accreditation Manager" role observes; assessor features include Simple Notes, Filter and Export to Excel/PDF/Word — [PLEAC PowerDMS Training 2024](https://pcpa.memberclicks.net/assets/docs/AccreditationDocuments/PLEAC%20-%20Power%20DMS%20Training%20%282024%29.pdf)
- Assessors work from an **inbox** of required work; for assessments they "set status" on each standard upon review; final assessors need a special unlock key from PowerDMS (Maine program guide, per search summary) — [PowerDMS accreditation search results / public.powerdms.com](https://public.powerdms.com/communities/documents/1743874)
- CALEA publishes "Continued Compliance Best Practices in PowerDMS" (Feb 2026) — [CALEA PDF](https://www.calea.org/sites/default/files/2026-02/Continued%20Compliance%20Best%20Practices%20in%20PowerDMS%20English.pdf) (not read in full); CALEA assessor online testing run on PowerDMS — [PowerDMS news](https://www.powerdms.com/about/news-press/calea-online-assessor-testing/)
- PowerDMS promotes year-round audit/survey readiness (continuous compliance rather than pre-survey scramble) — [PowerDMS survey-ready guide](https://www.powerdms.com/policy-learning-center/how-to-stay-survey-ready-year-round-in-healthcare); [Audit-ready year-round](https://www.powerdms.com/policy-learning-center/how-to-be-audit-ready-year-round-for-law-enforcement-accreditation)
- Joint Commission 2025 survey enhancement: organizations can upload survey documents to their Joint Commission Connect extranet (i.e., evidence delivery to surveyors occurs outside the vendor tool) — [TJC 2025 survey document upload](https://www.jointcommission.org/resources/news-and-multimedia/newsletters/newsletters/joint-commission-online/jan-8-2025/2025-survey-enhancements-survey-document-upload-process)
- Veeva: "detailed audit trails and powerful search facilitate better audits and inspections"; access content anywhere/any device — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- Part 11 §11.10(b): ability to generate accurate and complete copies suitable for FDA inspection, review and copying — [eCFR 21 CFR Part 11](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11)

### Inferences
- Feature list: standards tree with per-standard compliance status; evidence/proof attachments (policies, training records, photos, logs) per standard and per assessment cycle ("proofs of compliance"); external assessor/surveyor/inspector accounts with time-boxed, read-only or comment-only scope; assessor notes; export binder (PDF/Excel/Word); audit-trail export; dashboard of unmapped standards/outdated proofs.
- 对 BrightRule：可设计“检查/审计模式”——临时外部账号只读访问指定制度集合+证据包，所有访问留痕。

### Gaps
- No PowerDMS healthcare-specific documentation on read-only surveyor access found; healthcare survey "evidence binder" features of PolicyStat/Lucidoc not found.
- QMS "inspection room / front room-back room" features (e.g., Veeva inspection readiness) not researched in this session.

## Q5. Content-as-a-service (vendor-supplied and maintained policy content)

### Takeaway
Lexipol is the archetype: attorney-vetted, state-specific model policy manuals plus continuous legal updates delivered as flagged, redlined changes that agencies accept, customize or reject. Healthcare equivalents pair policy software with licensed content libraries (MCN + EBSCO Dynamic Health; PowerDMS licensed TJC/CALEA manuals and CALEA model policies).

### Cited Findings
- Lexipol policies are fully developed, state-specific, researched and written by subject-matter experts and vetted by attorneys; legal/policy content teams monitor new state and federal legislation, statutes and case law — [Lexipol policies & updates (archive)](https://archive.lexipol.com/solutions/policies-and-updates/); [Lexipol platform](https://www.lexipol.com/platform/policies-and-updates/)
- Lexipol says that in 2022 more than 10,883 pieces of legislation impacted public safety agencies (marketing stat) — [Lexipol info sheet](https://one.lexipol.com/law_enforcement_info_sheet)
- Lexipol KMS update workflow: changed sections flagged; **side-by-side "redline" comparison**; accept, customize or reject each change — [Lexipol help center: Processing Lexipol Updates](https://helpcenter.lexipol.com/docs/processing-lexipol-updates) (401 on fetch; content per search snippet); 2017 California agency document describes the "update flag" and "Compare Content" option — [Cathedral City PD, March 2017 Lexipol Updates](https://information.auditor.ca.gov/reports/2017-131/documents/cathedral_city_police_department-March%202017%20Lexipol%20Updates.pdf)
- Customization risk: accepting an update to a locally customized section overwrites local edits (2017) — [Cathedral City PD 2017](https://information.auditor.ca.gov/reports/2017-131/documents/cathedral_city_police_department-March%202017%20Lexipol%20Updates.pdf)
- Lexipol disclaims that updates are not legal advice; agencies should have legal counsel review — [Lexipol policies & updates (archive)](https://archive.lexipol.com/solutions/policies-and-updates/)
- KMS platform upgrade ("largest policy platform upgrade in three years", 50+ new features, faster manual loading and update processing) — [Police1 press release](https://www.police1.com/police-products/human-resources/press-releases/lexipol-releases-largest-policy-platform-upgrade-in-three-years-gIPnS7Cp6f4oSFrS)
- Critical scholarship: Texas Law Review "Lexipol: The Privatization of Police Policymaking" notes little public info and raises accountability concerns about privatized policy authorship — [Texas Law Review](https://texaslawreview.org/lexipol/)
- MCN Policy Manager integrates EBSCO **Dynamic Health** evidence-based procedures and policy templates; MCN reportedly acquired by Ntracts (aggregator claim); "3000+ facilities" claim unverified — [EBSCO blog](https://about.ebsco.com/blogs/health-notes/powerhouse-information-policy-manager-mcn-healthcare-and-dynamic-health); [EBSCO/MCN eBrochure](https://www.ebsco.com/sites/default/files/acquiadam-assets/Dynamic-Health-MCN-Healthcare-eBrochure.pdf); [SourceForge](https://www.sourceforge.net/software/product/PolicyManager)
- PowerDMS licenses and distributes TJC standards manuals and policy content, and the CALEA Policy Resource Library — [PowerDMS–TJC](https://www.powerdms.com/news-press/powerdms-announces-licensing-agreement-to-publish-and-distribute-joint-commission-standards-manuals-and-policy-content); [CALEA policy resource library](https://www.powerdms.com/integrations/calea-policy-resource-library)
- In FS, regulatory content itself is the service (TR experts update obligations within 30 days; WK structured regulatory data) — see Q2 sources.

### Inferences
- Key CaaS mechanics to replicate: upstream "master content" with section-level identity; downstream local copy with per-section customization flag; upstream update → diff/redline → accept/merge/reject per section; protection against overwriting local customizations (Lexipol's 2017 behavior shows the risk); legal disclaimer + local approval before publish.
- 对 BrightRule（集团企业）：集团总部即“内容提供方”，子公司即“订阅方”，可直接套用此上游/下游合并模型。

### Gaps
- Current (2025–2026) Lexipol KMS merge behavior for customized sections not verified (help center behind login).
- No info on Lexipol pricing or update cadence.

## Q6. Multi-facility / multi-entity management (master policies with local variants, applicability by site)

### Takeaway
Leading tools support a parent/master document with linked child/localized versions per site or region, rolling attestation up to the parent; healthcare systems use one library across many institutions. Granular applicability (by site, department, role) drives distribution and attestation.

### Cited Findings
- NAVEX PolicyTech: branded documents for multiple sites; tailored child versions per region; child documents **roll up to a parent** for consistent attestation tracking/reporting; localized versions stay automatically linked to the master; version control continues when parent updated — [NAVEX PolicyTech Enterprise use case](https://www.navex.com/en-us/resources/use-cases/go-global-policytech-enterprise/); [PolicyTech Enterprise datasheet 2022](https://cdn.navex.com/image/upload/v1644436790/resource%20documents/policytech-enterprise-datasheet-2022.pdf)
- Mass General Brigham keeps administrative and clinical policies, procedures and guidelines for **all MGB institutions** in ellucid (MCN) — [MGB page](https://eristest2-6.partners.org/?p=12046)
- Corlytics taxonomy mapping maps regulatory content to a firm's **legal structure**, businesses and products (entity-level applicability of obligations) — [Finextra](https://www.finextra.com/pressarticle/73209/corlytics-releases-regulatory-taxonomy-mapping-platform)
- AscentFocus maps obligations across business lines — [AscentFocus](https://www.ascentregtech.com/rlm-platform/ascentfocus/)
- Loyola compliance blog discusses merging/acquiring hospital policies (M&A policy harmonization problem) — [Loyola blog](https://blogs.luc.edu/compliance/?p=4889) (not read)

### Inferences
- Pattern: master policy (集团制度) → local addendum/variant (子公司实施细则) linked by ID; applicability tags (entity, site, department, role, jurisdiction); attestation and compliance reports aggregate up the hierarchy; master update triggers review of all children. 这与 AGENTS.md 中“适用范围用 organization_id + sharing rules 表达、不按子公司复制条款”的约定兼容；变体仅在确有本地差异时创建。

### Gaps
- No detailed docs for PolicyStat, Lucidoc or PowerDMS multi-site/variant handling; Veeva multi-site applicability (e.g., by facility/product) not retrieved.

## Q7. AI features added 2023–2026

### Takeaway
AI is converging on four uses: (1) natural-language policy Q&A/search with citations to source policies (Lexipol Policy Assistant, PowerDMS AI search); (2) regulation → obligation extraction and obligation → policy/control mapping (CUBE/4CRisk, Ascent, Corlytics, WK Compliance Intelligence, Compliance.ai); (3) change summarization/tagging/redlining for impact assessment (WK); (4) gap analysis against standards and training aids (PowerDMS). Vendors stress human-in-the-loop review.

### Cited Findings
- Lexipol: AI-powered **Policy Assistant** answers policy questions in natural language — [Lexipol platform](https://www.lexipol.com/platform/policies-and-updates/)
- PowerDMS: AI search answering plain-language questions with answers linked to source policies; AI gap analysis against accreditation standards; AI-generated flashcards; summaries for background checks — [PowerDMS policy management](https://www.powerdms.com/policy-management-software); [PowerDMS alternatives page](https://www.powerdms.com/policy-learning-center/powerdms-alternatives)
- A 2026 comparison rates PowerDMS "Partial" on AI policy drafting (third-party blog, low reliability) — [techno-pulse 2026](https://www.techno-pulse.com/2026/07/best-ai-policy-management-software-in.html?m=1)
- WK Compliance Intelligence (Oct 2025): AI summarizes and tags each regulatory change, red-lining, AI-powered workflows with human oversight; guidance that compliance professionals should verify AI outputs before relying on them for policies/procedures/controls — [Business Wire](https://www.businesswire.com/news/home/20251002619927/en/Wolters-Kluwer-Launches-Compliance-Intelligence-Strengthening-Transformational-Regulatory-Change-and-Obligation-Management-Capabilities); [WK insight](https://wolterskluwer.com/en/expert-insights/introducing-compliance-intelligence-trusted-ai-for-when-you-have-to-be-right)
- CUBE + 4CRisk (2025): agentic AI mapping internal policies/procedures to obligations and controls — [Fintech Times](https://thefintechtimes.com/cube-acquires-silicon-valleys-4crisk-to-accelerate-ai-compliance-automation/)
- Ascent rebranded around "AscentAI" Regulatory Lifecycle Management platform — [AscentAI RLM platform](https://ascentregtech.com/?p=311618)
- Compliance.ai Enterprise Edition (2023): AI-driven change alerts mapped to policies/procedures/controls with impact and gap analysis — [PR Newswire](https://prnewswire.com/news-releases/complianceai-introduces-enterprise-edition-regulatory-compliance-and-risk-management-solution-for-internal-policies-procedures-and-controls-301951807.html)
- ComplianceQuest markets a "CQ.AI" layer (predictive analytics, guided workflows) — vendor comparison claim — [Qualio vs ComplianceQuest / CQ pages](https://www.compliancequest.com/cq-guide/top-eqms-providers-trends-innovations); FDA selected ComplianceQuest QRC system for its enterprise QMS (vendor release) — [ComplianceQuest release](https://www.compliancequest.com/?p=59365)
- Qualio markets a "Compliance Intelligence" layer checking operating data against requirements (described on third-party listings only) — [Qualio document control 2025 blog](https://qualio.com/blog/quality-document-control-software-reviews)
- Veeva's 2025 QualityDocs features brief lists no AI features (Flexible Workflows, collaborative authoring via Microsoft Office Online, etc.) — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)

### Inferences
- For BrightRule's "AI policy Q&A" positioning, the healthcare/public-safety incumbents (Lexipol, PowerDMS) already ship cited NL Q&A; differentiation must come from clause-level citation with version/effective-date awareness, applicability filtering by organization, and obligation mapping (the FS RegTech capability) — features rarely combined in one product.
- Human-in-the-loop for AI mapping/drafting is an explicit design norm (WK) and should be a first-class workflow step (AI suggests mapping → owner confirms → audit trail).

### Gaps
- No confirmed 2023–2026 AI announcements found for MasterControl, Qualio (beyond marketing), Greenlight Guru, ETQ Reliance, RLDatix PolicyStat, Lucidoc, MCN; launch dates of Lexipol Policy Assistant and PowerDMS AI not found.
- No independent accuracy evaluations of any AI mapping product.

## Q8. Overall: which features distinguish regulated-industry systems from generic document management?

### Takeaway
Beyond storage/search/versioning, regulated-industry systems add: compliance-grade lifecycle and e-signatures, multi-document change control, controlled copies & obsolescence, periodic review, training-on-revision with attestation, external-requirement mapping with change propagation, accreditation self-assessment with assessor access, vendor-maintained content subscriptions, hierarchical master/variant documents, and audit/inspection exports — increasingly with AI Q&A and AI obligation mapping.

### Cited Findings
- Veeva frames its value as eliminating compliance risks of distributing copies by email/FTP via a single source of truth, plus visibility via reports/dashboards on bottlenecks — [Veeva Features Brief 2025](https://www.veeva.com/wp-content/uploads/2025/08/Veeva-QualityDocs-Features-Brief.pdf)
- Greenlight Guru positions document control alongside design controls, risk (ISO 14971), CAPA and change control for medical devices (ISO 13485) — per [ComplianceQuest comparison](https://www.compliancequest.com/cq-guide/top-eqms-providers-trends-innovations); [G2 comparison](https://www.g2.com/compare/greenlight-guru-quality-management-system-vs-qualio)
- ETQ Reliance (Hexagon) lists document control and training management as core modules with add-on apps — [G2 comparison](https://www.g2.com/compare/qualio-vs-veeva-vault-qualitydocs-vs-etq-octave-attune-eam)
- PolicyStat is sold by RLDatix (not symplr per sources found) — [RLDatix Policy Management](https://rldatix.com/en-nam/products/policy-management)

### Inferences
**Consolidated feature inventory (for synthesis)**
1. Document control core: lifecycle (Draft → In Review → Approved → Effective → Superseded/Obsolete/Withdrawn), effective-date scheduling, Part 11 e-signatures with meaning & re-auth, immutable audit trail, signature manifestation on rendered doc (Veeva), dynamic watermarks/overlays (Veeva), controlled copies with recall tracking (Veeva), uncontrolled-print marking.
2. Change control: change request → impact assessment → multi-document change order → coordinated release/obsolescence (Veeva Document Change Control; MasterControl change-training integration).
3. Periodic review: rule-based review reminders, expiry alerts, dashboards of upcoming/overdue reviews (Veeva, PolicyStat).
4. External requirement linkage: licensed standards libraries (TJC, CALEA, DNV, CARF…), clause/EP-level mapping of policies and evidence (PolicyStat, PowerDMS), standard-change flags; obligation registers with new/amended/deleted impact, horizon scanning, redlining, effective-date lookahead, gap analysis (Ascent, TR, WK, CUBE, Corlytics, Compliance.ai).
5. Training linkage: revision-triggered training/read-and-understood with e-sign (MasterControl, Veeva), attestation by version + quizzes (PolicyTech), notifications on linked-policy revision (PolicyStat), AI flashcards (PowerDMS).
6. Accreditation readiness: electronic self-assessment per standard, proofs of compliance, assessor roles (mock/final), assessor inbox & status-setting, notes, exports (PowerDMS/CALEA).
7. Content-as-a-service: attorney-vetted model policies, legal update feed, section-level flag + redline + accept/customize/reject (Lexipol); template libraries (MCN + EBSCO Dynamic Health).
8. Multi-entity: master/child localized versions with rollup attestation (PolicyTech Enterprise); single library across institutions (MGB/ellucid); entity/business-line obligation applicability (Corlytics, Ascent).
9. AI: cited NL policy Q&A (Lexipol, PowerDMS), AI gap analysis (PowerDMS), AI obligation extraction/mapping (CUBE/4CRisk, Ascent, Corlytics, WK), AI change summaries/tags (WK), with human review.

### Gaps
- The brief's premise "PolicyStat (now Symplr Policy & Document Management)" could not be confirmed; sources found show PolicyStat under RLDatix. symplr's own policy product was not researched.
- Lucidoc: no usable sources retrieved in this session.
- No KLAS or Chartis RiskTech100 data retrieved; no independent reviews beyond G2/Capterra aggregator snippets.
