# PT-depiler Development Plan

This document outlines the current roadmap and upcoming tasks for the PT-depiler project.

## 🎯 Immediate Priorities
- **Site Adaptations**: Continue adding and fixing adapters for PT sites based on community requests in [Issue Templates](../../ISSUE_TEMPLATE/站点适配.md).
- **Bug Fixes**: Address reported issues regarding data extraction, UI glitches, and downloader connectivity.
- **PTPP Migration**: Enhance the migration logic for historical data from PT-Plugin-Plus.

## 🛠 Ongoing Enhancements
- **UI/UX Polishing**:
  - Refine the dashboard and statistics views with better ECharts integration.
  - Improve mobile responsiveness for the options page.
  - Add more customization options for the content-script UI (speed-dial, badges).
- **Functional Features**:
  - Improve H&R (Hit and Run) tracking and notification.
  - Optimize the "Auto-Extend Cookie" logic to ensure long-term site connectivity.
  - Expand Douban/Bangumi integration for easier "Search to Download" workflows.

## 🚀 Strategic Goals
- **Performance Optimization**: Reduce the footprint of the background service worker and optimize IndexedDB queries.
- **Stability**: Ensure full compatibility across Chrome, Edge, and Firefox (handling MV3 differences).
- **Extensibility**: Refactor site adapters to be more declarative, making it easier for contributors to add new sites without deep coding knowledge.

## 🤝 Contribution Areas
- **New Sites**: Creating `src/packages/site/` adapters.
- **Locales**: Updating `src/locales/` for better internationalization support.
- **Documentation**: Improving the Wiki and in-app help guides.
