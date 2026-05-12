/**
 * DF-Animes - Brazilian Portuguese anime private tracker (TBDEV-based)
 */
import { type ISiteMetadata } from "../types";

const categories: Record<number, string> = {
  1: "Anime (Episódio)",
  2: "Anime (Completo)",
  3: "Anime (OVA)",
  4: "Anime (Filme)",
  5: "Anime (Hentai)",
  6: "Anime (Live Action)",
  7: "Música",
  8: "Desenho Animado",
  9: "Toku",
  10: "HQ/Scan",
  11: "Game",
  12: "Software",
  13: "Outros",
};

export const siteMetadata: ISiteMetadata = {
  version: 1,
  id: "dfanime",
  name: "DF-Animes",
  description: "DF-Animes is a Brazilian private tracker focused on anime content",
  tags: ["Anime"],
  timezoneOffset: "-0300",

  type: "private",

  urls: ["http://ok.df-animes.org/"],

  category: [
    {
      name: "Category",
      key: "cat",
      options: Object.entries(categories).map(([key, name]) => ({ value: Number(key), name })),
      cross: { mode: "append" },
    },
  ],

  search: {
    keywordPath: "params.search",
    requestConfig: {
      url: "/browse.php",
    },

    selectors: {
      rows: { selector: 'table.torrenttable > tbody > tr:has(a[href*="browse.php?cat="])' },
      id: { selector: 'a[href*="details.php?id="]', attr: "href", filters: [{ name: "querystring", args: ["id"] }] },
      title: { selector: 'a[href*="details.php?id="]' },
      url: { selector: 'a[href*="details.php?id="]', attr: "href" },
      link: { selector: 'a[href*="download.php?id="]', attr: "href" },
      time: { selector: "td:nth-child(4)", filters: [{ name: "parseTime" }] },
      size: { selector: "td:nth-child(5)", filters: [{ name: "parseSize" }] },
      category: {
        selector: 'a[href*="browse.php?cat="]',
        attr: "href",
        filters: [{ name: "querystring", args: ["cat"] }, (cat: string) => categories[Number(cat)] || "Other"],
      },
      seeders: { selector: "td:nth-child(7)" },
      leechers: { selector: "td:nth-child(8)" },
      completed: { selector: "td:nth-child(6)" },
    },
  },

  userInfo: {
    pickLast: ["id", "name"],
    process: [
      {
        requestConfig: { url: "/" },
        selectors: {
          id: {
            selector: '.menu a[href*="userdetails.php?id="]',
            attr: "href",
            filters: [{ name: "querystring", args: ["id"] }],
          },
          name: {
            selector: '.menu a[href*="userdetails.php?id="]',
          },
        },
      },
      {
        requestConfig: { url: "/userdetails.php" },
        assertion: { id: "params.id" },
        selectors: {
          uploaded: {
            selector: ['td.rowhead:contains("Uploaded") + td'],
            filters: [{ name: "parseSize" }],
          },
          downloaded: {
            selector: ['td.rowhead:contains("Downloaded") + td'],
            filters: [{ name: "parseSize" }],
          },
          levelName: {
            selector: ['td.rowhead:contains("Class") + td'],
          },
          ratio: {
            selector: ['td.rowhead:contains("Ratio") + td', 'td.rowhead:contains("Share ratio") + td'],
            filters: [{ name: "parseNumber" }],
          },
          bonus: {
            selector: ['a[href*="mybonus.php"]'],
            filters: [{ name: "parseNumber" }],
          },
          joinTime: {
            selector: ['td.rowhead:contains("Joined") + td'],
            filters: [{ name: "parseTime" }],
          },
          seeding: {
            selector: ['td.rowhead:contains("Seeding") + td', 'td.rowhead:contains("Currently seeding") + td'],
            filters: [{ name: "parseNumber" }],
          },
          seedingSize: {
            selector: ['td.rowhead:contains("Seeding size") + td'],
            filters: [{ name: "parseSize" }],
          },
          messageCount: {
            selector: ['a[href*="messages.php"]'],
            filters: [{ name: "parseNumber" }],
          },
        },
      },
    ],
  },
};
