<p align="center">
  <img alt="Logo" width="100" src="./public/icons/logo/128.png?raw=true">
</p>

<p align="center">
    <a href="../../releases?include_prereleases/latest" title="GitHub Releases"><img src="https://img.shields.io/github/v/release/pt-plugins/PT-reseed.svg?include_prereleases"></a>
    <a href="../../releases" title="GitHub Download"><img src="https://img.shields.io/github/downloads/pt-plugins/PT-reseed/total.svg?label=Downloads"></a>
    <img src="https://img.shields.io/badge/Used-TypeScript%20Vue-blue.svg">
    <a href="./LICENSE" title="GitHub license"><img src="https://img.shields.io/github/license/pt-plugins/PT-reseed.svg?label=License" alt="GitHub license"/></a>
    <a href="https://deepwiki.com/pt-plugins/PT-reseed"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"/></a>
</p>

### 🚀 关于 Introduction

PT-reseed 是在原 [PT-Plugin-Plus](https://github.com/pt-plugins/PT-Plugin-Plus) 基础上，
基于浏览器最新的 [Manifest v3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) 标准开发的一款浏览器插件（Web Extensions），
一个可以提升 PT 站点使用效率的工具。

适用于各 PT 站，可使下载种子等各项操作变化更简单、快捷。配合下载服务器（如 Transmission、qBittorrent 等），可一键下载指定的种子。

### 🖥️ 功能 Features

- **多站点支持**：兼容 NexusPHP、Unit3D、Gazelle 等多种类型的 PT 站点，提供聚合搜索相同关键字的种子、批量下载等功能
- **下载器集成**：支持 qBittorrent、Transmission、Deluge、ruTorrent、Synology Download Station、Aria2 等多种下载器，并保存下载历史记录
- **备份服务器管理**：集成 WebDav、Gist、CookieCloud、Google Drive、DropBox、OWSS 等备份服务，方便数据同步
- **智能搜索**：增强搜索功能，支持多站点同时搜索并合并结果
- **用户信息管理**：集中显示和管理各站点的用户信息和统计数据
- **地址栏快速搜索**：在浏览器地址栏中输入 `ptd` 后按 Tab 键即可快速调用智能搜索功能
- **辅种与查重 (New)**：分析下载器中已完成的种子，识别跨站重复资源，并支持基于元数据的全站反向辅种搜索。详细设计请参考 [设计文档](./docs/feature-torrent-analysis.md)
- 更多功能请参考 [Wiki](../../wiki)

### 📄 项目文档 Documentation

- **项目概览**：查看 [PROJECT.md](./PROJECT.md) 了解技术栈与架构
- **开发路线图**：查看 [PLAN.md](./PLAN.md) 了解当前优先级与未来计划

### 🔧 安装 Installation

#### 1. 从 Github Action 或者 Release 中获取并安装

[![Build Action Release](../../actions/workflows/action_build.yml/badge.svg)](../../actions/workflows/action_build.yml)

我们使用 Github Action 自动构建了基于 master 分支的最新版本，你可以在 [Github Action](../../actions/workflows/action_build.yml)
或者 [Release](../../releases) 页面中下载最新的版本。

#### 3. 从源码构建

请预先准备好 [Git](https://git-scm.com/) 、 [Node.js](https://nodejs.org/en) 和 [pnpm](https://pnpm.io/) 环境。
建议使用 [VSCode](https://code.visualstudio.com/) 或 [WebStorm](https://www.jetbrains.com/webstorm/) 作为开发工具。

```bash
git clone https://github.com/pt-plugins/PT-reseed
cd PT-reseed
pnpm install
# pnpm dev
pnpm build:dist    # or pnpm build:dist-firefox
```

### 📝 改动说明 Changelog

PT-reseed 并不是对 PT-Plugin-Plus 的简单移植，而是对其进行了全面的重构和改进，以获得更好的使用体验。

> 目前，PT-reseed 仅支持**已适配站点**的PTPP历史用户数据迁移。
> 请勿将 [PT-Plugin-Plus](https://github.com/pt-plugins/PT-Plugin-Plus) 或者 [PT 助手](https://github.com/ronggang/PT-Plugin) 的配置文件直接导入 PT-reseed。

更新记录请见： [CHANGELOG.md](./CHANGELOG.md)

### 💁‍♂️ 贡献 Contributors

✨ 欢迎 Star & 提 Issue，共同完善 PT-reseed！ 有兴趣贡献的开发者请阅读[行为准则](./CODE_OF_CONDUCT.md)

> 请不要在 Issue 中提出一般性问题。Issue 仅用于报告错误、提出改进建议或请求新功能。

我们还有一个 [help wanted](../../labels/%22help%20wanted%22) 的问题列表，您可能会感兴趣。

![Alt](https://repobeats.axiom.co/api/embed/9d98187b3a4c57e8c3a7087ff45d61bc03741af0.svg "Repobeats analytics image")

### 📝 许可证 License

PT-reseed 是一个开源项目，遵循 [MIT 许可证](http://opensource.org/licenses/MIT)

Copyright (c) 2020-present [pt-plugins](https://github.com/pt-plugins)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=pt-plugins/PT-reseed&type=Date)](https://www.star-history.com/#pt-plugins/PT-reseed&Date)

--------------

特别感谢以下所有为本项目做出贡献的人 😍！

[![Contributors](https://contrib.rocks/image?repo=pt-plugins/PT-reseed)](../../graphs/contributors)
