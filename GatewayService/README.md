# memoQ AI Gateway（桌面服务）

`GatewayService/` 是 `memoq-ai-tool` 仓库中的桌面控制面与本地网关层，用于承接 memoQ 插件的外部调用能力。

当前维护方：`LangLink Localization`

该模块不是独立起源的全新项目，而是建立在本仓库整体架构演进上的一部分：

- 插件层来源于原始 fork 项目的持续改造。
- 桌面控制面与本地模型接入层是当前仓库新增的实现。
- 当前模型访问统一通过 LiteLLM 管理，以减少直接对接不同 provider 的重复工作。

当前架构目标是让 `MultiSupplierMTPlugin` 退化为 memoQ 适配薄层，而让桌面服务承接模型配置、运行时状态、日志和后续编排能力。该方向仍在持续开发中。

## 已支持的网关接口

- `POST /mt/translate`
- `POST /tm/lookup`
- `POST /tb/search`
- `POST /qa/check`
- `GET /health`
- `GET /logs`
- `GET /admin/config`
- `POST /admin/config`
- `GET /admin/config/secrets/:providerId`
- `POST /admin/config/secrets/:providerId`

## 启动

```bash
cd GatewayService
npm install
npm start
```

首次启动会在 `%APPDATA%\\memoq-ai-gateway`（Linux/macOS 为当前用户目录）下自动创建本地运行目录。

当前存储策略：

- 配置：使用 `electron-store`
- 敏感字段：独立加密存储，不放入主配置
- 日志：按天写入 `logs/YYYY-MM-DD.ndjson`
- LiteLLM：作为随桌面应用一起分发的内置 sidecar 运行时打包，不要求最终用户额外安装 Python 或 LiteLLM；发布资源目录默认使用更短的 `llmrt` 路径以规避 Windows 长路径问题

## 日志检索

在 `http://127.0.0.1:5271/` 页面，可按以下维度过滤日志：

- 接口（MT/TM/TB/QA）
- 供应商
- 模型
- 文档 ID
- 项目 ID
- 段落哈希
- 时间区间
- 状态（成功/失败）
- 简单关键词
- 模型
- 请求 ID

详情参数：
- `includePayload=1`：返回 requestPayload / responsePayload
- `limit` / `offset`：分页参数
- `keyword`：对错误、provider、payload 等字段做简单包含匹配

## 默认策略

- 日志保留：`30` 天（可在桌面页配置）
- 日志脱敏：开启（`maskSensitive=true`）
- 文本哈希：开启（`hashTextForLog=true`）
- 原始请求体入库：开启（`storeRawPayload=true`）

## 备注

- 当前阶段以 MT 主链路为主，TM/TB/QA 仍有占位实现和在研部分。
- 桌面侧已经支持通过内置 LiteLLM sidecar 管理真实模型访问，默认提供了 `OpenAI GPT-5 mini` 预置项，可在桌面界面中填写密钥后使用。
- `GET/POST /admin/config/secrets/:providerId` 使用 Windows DPAPI（当前用户作用域）优先存储。
  若非 Windows 环境会自动降级到本机 AES 文件密钥。
- 旧版配置里如果仍有 provider 密钥内嵌在主配置中，服务启动时会自动迁移到独立 secret store。
- 后续会继续把更多 memoQ 交互逻辑、上下文处理和审计能力从插件层迁入桌面控制面。

## 发布打包

Windows 发布包会在构建阶段先准备两类资源：

- memoQ 插件 DLL 与 `ClientDevConfig.xml`
- 内置 LiteLLM 运行时（基于构建机 Python 创建虚拟环境并安装 `litellm[proxy]`）

常用命令：

```bash
cd GatewayService
npm run prepare:litellm
npm run package
npm run make
```

当前输出目录：

- `npm run package` 产物位于 `GatewayService/out/`
- `npm run make` 的安装包与发布产物也位于 `GatewayService/out/`
- 旧的 `GatewayService/dist/` 属于历史遗留的 `electron-builder` 时代目录，不再作为当前构建输出
