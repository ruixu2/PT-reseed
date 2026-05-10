# PT-depiler (Project Overview)

PT-depiler is a modern browser extension (Manifest V3) designed to enhance the efficiency of Private Tracker (PT) users. It is a complete rewrite and successor to the original [PT-Plugin-Plus](https://github.com/pt-plugins/PT-Plugin-Plus), optimized for performance and modern web standards.

## 🚀 Core Features
- **Multi-Site Integration**: Supports numerous PT site architectures (NexusPHP, Unit3D, Gazelle, etc.) with aggregated search and user stat tracking.
- **Downloader Management**: One-click push to clients like qBittorrent, Transmission, Aria2, etc.
- **Data Synchronization**: Built-in support for WebDav, Gist, CookieCloud, and major cloud drives for configuration backup.
- **User Statistics**: Centralized dashboard for tracking upload/download, ratio, and seeding progress across all configured sites.
- **Smart Search**: Integrated keyword and IMDb/Douban-based search across multiple trackers.

## 🛠 Tech Stack
- **Framework**: [Vue 3](https://vuejs.org/) (Composition API)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/) with `vite-plugin-web-extension`
- **UI Library**: [Vuetify 3](https://vuetifyjs.com/)
- **State Management**: [Pinia](https://pinia.vuejs.org/)
- **Storage**: IndexedDB (via `idb`) and Web Extension Storage API
- **Utilities**: Axios, ECharts, VueUse, date-fns

## 🏗 Architecture
The project follows the standard Web Extension structure:
- **Background**: Handles long-running tasks, messaging, and API requests.
- **Content Scripts**: Injected into PT sites to provide on-page enhancements (download buttons, info extraction).
- **Options Page**: The main dashboard for configuration, statistics, and history.
- **Offscreen**: Used for tasks requiring a DOM environment not available in Service Workers (MV3).
- **Packages (`src/packages/`)**:
  - `site`: Site-specific adapters and metadata.
  - `downloader`: Integration logic for various download clients.
  - `backupServer`: Providers for data synchronization.
  - `mediaServer`: Integration with Emby/Plex/Jellyfin.
  - `social`: Integrations with sites like Douban or Bangumi.

## 📦 Build & Development
- **Install**: `pnpm install`
- **Dev**: `pnpm dev`
- **Build**: `pnpm build:dist` (Chrome/Edge) or `pnpm build:dist-firefox` (Firefox)
