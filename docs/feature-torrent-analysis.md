# Feature Design: Cross-Seeding & Torrent Analysis

## 🎯 Objective
Enable users to identify identical content across different torrents (from various trackers or public BT) to facilitate cross-seeding and storage optimization.

## 🔍 Matching Logic Levels

### Level 0: InfoHash Match
- **Criteria**: `torrentA.infoHash === torrentB.infoHash`
- **Result**: Identical torrent. All metadata (files, pieces, structure) is exactly the same.
- **Action**: Direct cross-seed.

### Level 1: Semantic Content Match
- **Criteria**:
    - Total length is identical.
    - File structure (paths) and individual file sizes are identical.
- **Reasoning**: Many trackers change the `private` flag, add `comment` or `source` fields, which changes the InfoHash even if the data payload is the same.
- **Action**: Valid cross-seed candidate. Requires "Skip Hash Check" or re-hashing in the downloader.

### Level 2: Fuzzy Content Match
- **Criteria**:
    - Major files match in size and name (e.g., the `.mkv` file).
    - Minor files (NFO, sample, screenshots) might differ or be missing.
- **Action**: Partial cross-seed. User might need to move/rename files or selectively download.

### Level 3: Piece Hash Comparison (Deep Scan)
- **Criteria**: Compare the `pieces` field from the `.torrent` files.
- **Note**: Requires fetching and parsing the full `.torrent` file for both candidates. This is the most accurate method to ensure data integrity before attempting to seed.

## 🌐 Cross-Site Discovery
The system will help users find where their local content exists across the PT landscape.

### 1. Metadata Extraction
For each finished torrent in the downloader, extract:
- **Primary**: InfoHash (for identical matches).
- **Secondary**: IMDb ID, Douban ID, TMDB ID (extracted from torrent name or downloader tags).
- **Tertiary**: Cleaned title (Name + Year) and Total Size.

### 2. Search Strategy
- **Passive Discovery**: When a user searches for a movie, highlight results that match the `totalSize` and `fileList` of a locally finished torrent.
- **Active Discovery (Reverse Search)**:
    - User selects a local torrent.
    - System triggers a search across all configured PT sites using the extracted IDs or Title.
    - Matches are filtered by `Level 1` or `Level 2` similarity logic.

### 3. Source Identification
- Identify if the torrent originated from a specific PT site (via `source` field in `.torrent` or tracker URL).
- Exclude the source site from "Discovery" results to focus on new cross-seeding opportunities.

## 🤖 Automation & Task Queue (Reseed Puppy Inspiration)
To achieve higher efficiency, the system will implement an automated background task logic similar to "Reseed Puppy".

### 1. The "Reseed Runner"
- **Background Worker**: A task runner in the background script that processes a queue of local torrents.
- **Batch Processing**: Instead of one-by-one manual clicks, users can select a batch of torrents to "Search & Match".
- **Rate Limiting**: Intelligent search delays to respect tracker rules (API limits) and avoid getting blocked.

### 2. Intelligent Match Logic (L1+)
- **Metadata Richness**: Beyond just size, cache the folder structure and first/last file fragments if possible.
- **Source Exclusion**: Automatically skip searching the site where the torrent was originally downloaded from.
- **Client Mapping**: Support different downloaders for source and target (e.g., scan qB, reseed to TR).

### 3. Workflow Evolution
1.  **Selection**: User selects multiple "Finished" torrents.
2.  **Enqueue**: Torrents are added to the "Automated Reseed Queue".
3.  **Discovery**: System performs background searches using IMDb/Title.
4.  **Auto-Verification**: Matches are automatically verified by size and file list.
5.  **Staging**: Results are placed in a "Pending Review" list or auto-injected in "Paused" state based on user settings.

## 🛠 Proposed Workflow
1.  **Scanner**: Periodic or manual scan of all configured downloaders via their APIs.
2.  **Metadata Cache**: Store basic info (name, size, file list, infoHash) in IndexedDB to avoid hammering downloader APIs.
3.  **Analyzer**:
    - Group torrents by `totalSize`.
    - Within each size group, compare file lists.
    - Flag potential matches.
4.  **UI**:
    - A dedicated "Cross-Seeding" page in the extension options.
    - Table showing "Content Groups" with multiple trackers.
    - Status indicators: "Seeding", "Downloading", "Missing on Tracker X".
5.  **Actions**:
    - "Add to [Downloader]": Auto-inject a matching torrent from another tracker using the existing local data path.

## 🚀 Technical Requirements
- Update `Downloader` interface to support fetching detailed file lists.
- New `CrossSeedManager` in `src/entries/background/`.
- New UI components using Vuetify.
