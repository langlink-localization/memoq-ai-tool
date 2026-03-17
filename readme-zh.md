[English](./readme.md) [中文](./readme-zh.md)

## 项目概述

`memoq-ai-tool` 是一个面向 memoQ 的本地 AI 翻译工具链。它把 memoQ 插件与本地桌面控制面、本地网关结合起来，让用户可以在 memoQ 之外管理 provider、模型、prompt、密钥和诊断能力。

当前维护方：`LangLink Localization`

本项目在需求梳理、实现、UI 迭代和文档整理过程中都使用了大量 AI 协助。最终的产品目标、架构方向和发布决策仍由人工负责审核和主导。

## 架构说明

当前仓库主要由两层组成：

- 插件层：负责 memoQ 插件入口、标签与格式保真，以及 memoQ 侧集成。
- 桌面层：负责 Electron 桌面应用与本地网关，包括 provider 管理、prompt 编排、日志和安装工具。

当前长期方向是：

- 薄层：memoQ 插件，只负责接收 memoQ payload 并转发给本地桌面服务。
- 重层：桌面应用，负责 provider、模型、密钥、运行策略、prompt、日志以及后续编排能力。

## 桌面端 UI 方向

桌面应用正在重构为更面向任务的设置中心：

- `Overview`：健康状态、引导和快捷操作
- `Integration`：memoQ 安装与修复
- `System`：接口、网络、LiteLLM 和运行时控制
- `Providers`：真实 provider 路由与凭据
- `Prompts`：模型指令、术语表内容和摘要内容
- `Logs`：诊断与排障

当前 UI 方向是：更接近现代 Electron 设置中心，使用左侧侧边栏导航，降低认知负担，默认英文文案，并为后续 i18n 留出结构空间。

## 仓库作用

本仓库用于开发和维护：

- memoQ 插件与桌面应用之间的本地执行链路
- 桌面控制面与运行配置
- 基于 LiteLLM 的模型访问与 provider 管理
- memoQ 工作流中的日志、诊断与后续上下文编排能力

当前桌面端本地持久化策略：

- 配置使用 `electron-store`
- provider 密钥使用独立加密存储
- 请求日志按天写入 `logs/YYYY-MM-DD.ndjson`

当前功能重点仍然是 MT 主链路，TM/TB/QA 还在持续推进中。

## 快速开始

### 1. 构建 Windows 客户端

```powershell
Set-Location C:\path\to\memoq-ai-tool
pyenv exec python --version
.\build\package-windows.ps1
```

构建约束：

- 桌面端运行时固定为 `Node 22`
- Python 建议通过 `pyenv` 管理
- 当前验证通过的打包版本为 `Python 3.11`

默认输出：

- `MultiSupplierMTPlugin\bin\Any CPU\Release\net48\MemoQ.AIGateway.Plugin.dll`
- `GatewayService\dist\*.exe`
- `GatewayService\dist\*.zip`

### 2. 开发模式启动桌面网关

```bash
cd GatewayService
npm install
npm start
```

默认本地接口：

- `POST http://127.0.0.1:5271/mt/translate`
- `POST http://127.0.0.1:5271/tm/lookup`
- `POST http://127.0.0.1:5271/tb/search`
- `POST http://127.0.0.1:5271/qa/check`
- `GET  http://127.0.0.1:5271/health`
- `GET  http://127.0.0.1:5271/logs`
- `GET/POST http://127.0.0.1:5271/admin/config`

### 3. 安装 memoQ 插件

推荐使用桌面应用中的 `Integration` 页面。它会复制：

- `MemoQ.AIGateway.Plugin.dll`
- `ClientDevConfig.xml`

当前支持的 memoQ Desktop 目标版本：

- `memoQ 10`
- `memoQ 11`
- `memoQ 12`

默认安装根目录：

- `C:\Program Files\memoQ\memoQ-10`
- `C:\Program Files\memoQ\memoQ-11`
- `C:\Program Files\memoQ\memoQ-12`

如果 memoQ 安装在非标准目录，桌面应用也支持手动指定自定义安装根目录。

## 本地测试

### 桌面服务验证

```bash
cd GatewayService
npm install
npm test
```

### Windows 插件与整包验证

```powershell
Set-Location C:\path\to\memoq-ai-tool
.\scripts\build-windows.ps1 -Configuration Release
```

如果要同时跑桌面测试并输出 Windows 发布产物：

```powershell
Set-Location C:\path\to\memoq-ai-tool
.\build\package-windows.ps1 -Configuration Release
```

## 普通用户如何安装和使用

### 安装

1. 从 release 下载桌面安装包或便携包。
2. 启动 `memoQ AI Gateway`。
3. 在桌面应用中配置 provider、模型和 API key。
4. 使用 `Integration` 页面把插件安装到 memoQ Desktop。

### 使用

1. 保持桌面应用运行。
2. 在 memoQ 中启用插件。
3. 当 memoQ 发起 MT 请求时，插件会调用本机 `127.0.0.1:5271` 网关，再由桌面应用转发到已配置的 provider。

## 参考资料

- 默认英文 README：
  [readme.md](./readme.md)
- 中文 README：
  [readme-zh.md](./readme-zh.md)
- 桌面服务说明：
  [GatewayService/README.md](./GatewayService/README.md)
- memoQ 集成配置：
  [doc/ClientDevConfig.xml](./doc/ClientDevConfig.xml)
- 上游历史 fork：
  [JuchiaLu/Multi-Supplier-MT-Plugin](https://github.com/JuchiaLu/Multi-Supplier-MT-Plugin)
