[English](./readme.md) [中文](./readme-zh.md)

## Overview

`memoq-ai-tool` is a local AI translation toolchain for memoQ. It combines a memoQ plugin with a local desktop control plane and gateway so users can manage providers, models, prompts, secrets, and diagnostics outside memoQ itself.

Current maintainer: `LangLink Localization`

This project is developed with substantial AI assistance during planning, implementation, UI iteration, and documentation. Human review and direction still define the product goals, architecture, and release decisions.

## Architecture

The repository currently has two layers:

- Plugin layer: the memoQ plugin entrypoint, tag and formatting preservation, and memoQ-side integration.
- Desktop layer: the Electron desktop application and local gateway, including provider management, prompt orchestration, logging, and installation tooling.

The long-term direction is:

- Thin layer: the memoQ plugin, focused on receiving memoQ payloads and forwarding them to the local desktop service.
- Heavy layer: the desktop application, focused on providers, models, secrets, runtime policy, prompts, logging, and future orchestration features.

## Desktop UI Direction

The desktop app is being reshaped into a task-oriented settings experience:

- `Overview` for health, guidance, and quick actions
- `Integration` for memoQ installation and repair
- `System` for interfaces, networking, LiteLLM, and runtime controls
- `Providers` for real provider routing and credentials
- `Prompts` for model instructions, glossary content, and summary content
- `Logs` for diagnostics and troubleshooting

The current UI direction is a modern Electron settings center with a left sidebar, lower cognitive load, English-first copy, and future-friendly i18n structure.

## Repository Purpose

This repository is used to develop and maintain:

- The local execution path between the memoQ plugin and the desktop app
- The desktop control plane and runtime configuration
- LiteLLM-based model access and provider management
- Logging, diagnostics, and future context orchestration for memoQ workflows

The local desktop persistence model is currently:

- `electron-store` for app configuration
- separate encrypted storage for provider secrets
- daily `logs/YYYY-MM-DD.ndjson` files for request logs

The current functional priority remains the MT path. TM/TB/QA are still in progress.

## Quick Start

### 1. Build the Windows client

```powershell
Set-Location C:\path\to\memoq-ai-tool
pyenv exec python --version
.\build\package-windows.ps1
```

Build constraints:

- Desktop app runtime is pinned to `Node 22`
- Python is expected to be managed through `pyenv`
- `Python 3.11` is the verified packaging target

Default outputs:

- `MultiSupplierMTPlugin\bin\Any CPU\Release\net48\MemoQ.AIGateway.Plugin.dll`
- `GatewayService\dist\*.exe`
- `GatewayService\dist\*.zip`

### 2. Start the desktop gateway in development mode

```bash
cd GatewayService
npm install
npm start
```

Default local endpoints:

- `POST http://127.0.0.1:5271/mt/translate`
- `POST http://127.0.0.1:5271/tm/lookup`
- `POST http://127.0.0.1:5271/tb/search`
- `POST http://127.0.0.1:5271/qa/check`
- `GET  http://127.0.0.1:5271/health`
- `GET  http://127.0.0.1:5271/logs`
- `GET/POST http://127.0.0.1:5271/admin/config`

### 3. Install the memoQ plugin

The recommended path is the desktop app `Integration` page. It copies:

- `MemoQ.AIGateway.Plugin.dll`
- `ClientDevConfig.xml`

Supported memoQ Desktop targets:

- `memoQ 10`
- `memoQ 11`
- `memoQ 12`

Standard install roots:

- `C:\Program Files\memoQ\memoQ-10`
- `C:\Program Files\memoQ\memoQ-11`
- `C:\Program Files\memoQ\memoQ-12`

The desktop app also supports a custom installation root for non-standard memoQ locations.

## Local Testing

### Desktop service checks

```bash
cd GatewayService
npm install
npm test
```

### Windows plugin and packaging

```powershell
Set-Location C:\path\to\memoq-ai-tool
.\scripts\build-windows.ps1 -Configuration Release
```

To run desktop tests and produce Windows release artifacts in one flow:

```powershell
Set-Location C:\path\to\memoq-ai-tool
.\build\package-windows.ps1 -Configuration Release
```

## End-User Installation and Usage

### Install

1. Download the desktop installer or portable package from a release.
2. Launch `memoQ AI Gateway`.
3. Configure the provider, model, and API key in the desktop app.
4. Use the `Integration` page to install the plugin into memoQ Desktop.

### Use

1. Keep the desktop app running.
2. Enable the plugin inside memoQ.
3. When memoQ sends an MT request, the plugin calls the local `127.0.0.1:5271` gateway, and the desktop app forwards the request to the configured provider.

## References

- Default English README:
  [readme.md](./readme.md)
- Chinese README:
  [readme-zh.md](./readme-zh.md)
- Desktop service notes:
  [GatewayService/README.md](./GatewayService/README.md)
- memoQ integration config:
  [doc/ClientDevConfig.xml](./doc/ClientDevConfig.xml)
- Upstream historical fork:
  [JuchiaLu/Multi-Supplier-MT-Plugin](https://github.com/JuchiaLu/Multi-Supplier-MT-Plugin)
