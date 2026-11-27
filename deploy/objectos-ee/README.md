# 在 ObjectOS 企业版上运行明规

明规没有代码插件（条款索引、知识服务、向量检索和表单问询已在 brightrule#19 下线），只有元数据和纯元数据的钩子。所以直接用官方企业版镜像，挂上明规的制品即可，不用再构建派生镜像。

## 产出制品

```bash
pnpm install
pnpm build        # 产出 dist/objectstack.json
```

企业版镜像的版本要与 `package.json` 里 `@objectstack/*` 的版本一致（当前 19.0.0-next.0）。

## 运行

1. 准备一个 PostgreSQL 数据库（不需要 pgvector）。
2. 复制 `ee.env.example` 到仓库外，填入许可证、数据库和密钥。
3. 启动，把 `dist/` 挂进容器，并指向其中的制品：

   ```bash
   docker run -d --name brightrule -p 3000:3000 \
     --env-file /path/to/brightrule.env \
     -v "$PWD/dist:/srv/brightrule/dist:ro" \
     -e OS_COMPOSED_ARTIFACT_URL=file:///srv/brightrule/dist/objectstack.json \
     -e OS_CLOUD_URL=off \
     ghcr.io/objectstack-ai/objectos-ee:19.0.0-next.0
   ```

   离线交付时用 `docker save` 打包企业版镜像，`dist/` 单独拷过去。明规更新时只需替换 `dist/` 并重启容器。

4. 启动日志里应看到 `ObjectOS Enterprise — LICENSED`。
5. 在 Console 的「系统设置 → AI」里选 DeepSeek（OpenAI 兼容），填 API key，模型用 `deepseek-flash`。
6. 首个注册的账号是管理员（单组织部署）。

## 现状与限制

- **AI 对话（`ask`）用不上本应用的技能**：平台的 `ask` 不加载应用技能，目前对话的回答来自 `ask` 自带的数据查询能力。见 [objectstack-ai/cloud#4935](https://github.com/objectstack-ai/cloud/issues/4935)。
- 选 DeepSeek 时 `ask` 的 `query_data` 工具每次都会失败（DeepSeek 不支持 `json_schema` 结构化输出），模型会改用别的工具，多耗一轮。见 [objectstack-ai/cloud#4934](https://github.com/objectstack-ai/cloud/issues/4934)。
- **MCP**（`/api/v1/mcp`）上「制度问询」技能会作为提示词 `brightrule-brightrule_policy_inquiry` 下发，外部客户端可以直接用，走制度目录加读正文的路线。

评测数据见 [`docs/evaluation-2026-11-23.md`](../../docs/evaluation-2026-11-23.md)（评测时还有表单问询和向量检索，已下线）。
