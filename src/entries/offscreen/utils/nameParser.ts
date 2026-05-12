export interface IParsedTorrentName {
  title: string;
  year?: number;
  resolution?: string;
  quality?: string;
  imdbId?: string;
}

export function parseTorrentName(name: string): IParsedTorrentName {
  const result: IParsedTorrentName = { title: name };

  // IMDb ID match: tt\d{7,8}
  const imdbMatch = name.match(/tt\d{7,8}/i);
  if (imdbMatch) {
    result.imdbId = imdbMatch[0].toLowerCase();
  }

  // Year match: 19\d{2} or 20\d{2}
  const yearMatch = name.match(/(19|20)\d{2}/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[0]);
  }

  // Resolution match: 2160p, 1080p, 720p, 480p, 576p
  const resMatch = name.match(/\b(2160p|1080p|1080i|720p|576p|480p|4k)\b/i);
  if (resMatch) {
    result.resolution = resMatch[0].toLowerCase();
  }

  // Quality/Source match
  const qualityMatch = name.match(/\b(Blu-ray|BluRay|BDrip|BRRip|Web-DL|WebDL|Webrip|HDTV|DVDrip)\b/i);
  if (qualityMatch) {
    result.quality = qualityMatch[0].toLowerCase();
  }

  // Title extraction: everything before the year or resolution
  // Common delimiters in scene/PT names
  const separators = [".", " ", "(", "[", "198", "199", "200", "201", "202", "2160p", "1080p", "720p", "4k"];
  let minIndex = name.length;
  for (const sep of separators) {
    const index = name.indexOf(sep);
    if (index !== -1 && index < minIndex && index > 2) {
      // Ensure we don't cut too early (e.g. at the first dot if it's "Mr.Robot")
      // Special check for dots: if it's a dot, we look for common next tokens
      if (sep === "." && !name.substring(index).match(/\b(19|20)\d{2}|2160p|1080p|720p|BluRay|Web-DL\b/i)) {
        continue;
      }
      minIndex = index;
    }
  }

  if (minIndex < name.length) {
    result.title = name.substring(0, minIndex).replace(/[._]/g, " ").trim();
  } else {
    result.title = name.replace(/[._]/g, " ").trim();
  }

  return result;
}
