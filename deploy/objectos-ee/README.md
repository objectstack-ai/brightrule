# 在 ObjectOS 企业版上运行明规

本目录在官方企业版镜像上加一层，产出一个能直接运行明规（含制度问询的检索插件）的镜像。

## 为什么要加一层

企业版用制品方式启动应用时（`OS_COMPOSED_ARTIFACT_URL`），只加载应用的元数据和钩子函数，不加载应用的代码插件；企业版镜像里也没有这些插件依赖的 `@objectstack/service-knowledge`、`@objectstack/embedder-openai` 和 `pg`。明规的知识服务、向量检索和条款索引都是代码插件，不加这一层它们不会运行。平台问题见 [objectstack-ai/objectstack#36647](https://github.com/objectstack-ai/objectstack/issues/36647)，修复后可以去掉这一层。

这一层做三件事：

1. 把明规的生产依赖装进 `/srv/brightrule/node_modules`，不动企业版自己的依赖；
2. 放入制品 `dist/` 和从 `src/qa` 编译出的问询插件；
3. 把企业版原配置改名为 `ee-base.config.ts`（内容不变），新的入口配置 `ee-host.config.ts` 导入它，再追加问询插件。

## 构建

前提：Docker、pnpm，能拉取企业版镜像。基础镜像版本必须与 `package.json` 里 `@objectstack/*` 的版本一致（当前 18.6.0）。

```bash
deploy/objectos-ee/build.sh
```

可选环境变量：`IMAGE`（产出镜像名，默认 `brightrule-objectos-ee:local`）、`OS_EE_IMAGE`（基础镜像，默认 `ghcr.io/objectstack-ai/objectos-ee:18.6.0`）。多余参数原样传给 `docker build`。例如构建机走 TLS 拦截代理时，把代理证书作为构建密钥传入：

```bash
deploy/objectos-ee/build.sh --secret id=ca,src=/path/to/proxy-ca.crt
```

离线交付用 `docker save` 打包。企业版每次升级都要重新构建。

## 运行

1. 准备一个装有 pgvector 扩展的 PostgreSQL 数据库（`CREATE EXTENSION vector;`）。
2. 复制 `ee.env.example` 到仓库外，填入许可证、数据库、密钥和向量模型。**DeepSeek 没有向量化接口**，向量模型要另配（本地 bge-m3、通义 `text-embedding-v3`、硅基流动等）。
3. 启动：

   ```bash
   docker run -d --name brightrule -p 3000:3000 --env-file /path/to/brightrule.env brightrule-objectos-ee:local
   ```

4. 启动日志里应看到：
   - `ObjectOS Enterprise — LICENSED`
   - `[brightrule-host] adding app code plugins: com.objectstack.service.knowledge, com.objectstack.plugin.knowledge-vector, ai.objectstack.brightrule.qa`
5. 在 Console 的「系统设置 → AI 与向量化」里选 DeepSeek（OpenAI 兼容），填 API key，模型用 `deepseek-flash`。
6. 首个注册的账号是管理员（单组织部署）。不要设置 `OS_AI_STUDIO_AGENTS=ask`：只开 ask 会进入「只查询」模式，转人工动作会被收回。

## 现状与限制

- **表单问询**（「制度问询 → 我要问询」）走 pgvector 语义检索，已可用。
- **AI 对话（`ask`）用不上本应用的技能和向量检索**：平台的 `ask` 不加载应用技能，`search_knowledge` 工具也没有注册。目前对话的回答来自 `ask` 自带的数据查询能力。见 [objectstack-ai/cloud#4935](https://github.com/objectstack-ai/cloud/issues/4935)、[objectstack-ai/cloud#4933](https://github.com/objectstack-ai/cloud/issues/4933)。
- 选 DeepSeek 时 `ask` 的 `query_data` 工具每次都会失败（DeepSeek 不支持 `json_schema` 结构化输出），模型会改用别的工具，多耗一轮。见 [objectstack-ai/cloud#4934](https://github.com/objectstack-ai/cloud/issues/4934)。
- **MCP**（`/api/v1/mcp`）上「制度问询」技能会作为提示词 `brightrule-brightrule_policy_inquiry` 下发，外部客户端可以直接用；MCP 上没有知识检索工具，走的是制度目录路线。见 [objectstack-ai/objectstack#36650](https://github.com/objectstack-ai/objectstack/issues/36650)。

评测数据见 [`docs/evaluation-2026-11-23.md`](../../docs/evaluation-2026-11-23.md)。
