# PT-reseed Development Plan

This document outlines the product roadmap and development phases for the PT-reseed extension.

## 🎯 Phase 1: Cross-Seeding MVP & Stabilization (Current)
*Status: Completed & Deploying*

- [x] **Downloader Architecture**: Update API to fetch full file metadata (supports 8+ clients).
- [x] **Storage Engine**: Migrate to IndexedDB v4 for robust metadata caching.
- [x] **Discovery UI**: Dedicated options page for duplicate visualization and manual reverse search.
- [x] **Passive Discovery**: Display "Locally Stored" badges in regular search results.
- [x] **Action Integration**: "One-Click Cross-Seed" to push found torrents to the exact local path.

## 🚀 Phase 2: Automation & Intelligence (Next Iteration)
*Status: In Planning*

Inspired by the efficiency of "Reseed Puppy", this phase focuses on reducing user intervention and increasing match safety.

- [ ] **Automated Reseed Queue (The Runner)**: 
  - Allow users to select multiple finished torrents to enqueue for background cross-seeding.
  - Implement a background task manager with intelligent rate limiting to respect tracker API limits and prevent account bans.
- [x] **Advanced Matching Logic (L2 & L3)**:
  - [x] **L2 (Fuzzy Match)**: Support matching when the main video file is identical, but minor files (NFOs, samples) differ.
  - [x] **L3 (Deep Scan)**: Fetch the `.torrent` file from the target site and compare piece hashes before injecting into the downloader.

- [ ] **Staging Area UI**: 
  - Instead of direct injection, auto-matched torrents land in a "Pending Review" list for batch approval, preventing unintended data corruption.

## 🌐 Phase 3: Multi-Site Orchestration
*Status: Backlog*

- [ ] **Cross-Client Reseeding**: Scan source data from Downloader A (e.g., qBittorrent for downloading) and reseed to Downloader B (e.g., Transmission for long-term seeding).
- [ ] **Smart Source Tracking**: Automatically extract the `source` or tracker URL from the local `.torrent` to skip searching the origin site, saving API calls.
- [ ] **Auto-Resume Integration**: After a successful "Pause-on-Add" injection and a successful hash check by the downloader, automatically resume the torrent.

## 🛠 Ongoing Enhancements
- **UI/UX Polishing**: Refine dashboard statistics (ECharts) and mobile responsiveness.
- **Site Maintenance**: Continuously add and fix tracker adapters based on community feedback.
- **PTPP Migration**: Maintain compatibility for users migrating history from PT-Plugin-Plus.

## 🤝 Contribution Areas
- **New Sites**: Creating `src/packages/site/` adapters.
- **Locales**: Updating `src/locales/` for better internationalization support.
- **Documentation**: Improving the Wiki and in-app help guides.
