// 此处放置一些全局都可以用的助手函数、常量定义

// 仓库相关
export const REPO_NAME = "pt-plugins/PT-reseed";
export const REPO_URL = `https://github.com/${REPO_NAME}`;
export const REPO_API = `https://api.github.com/repos/${REPO_NAME}`;

export const GROUP_QQ = "https://jq.qq.com/?_wv=1027&k=7d6xEo0L";

// 环境相关
export const isProd = import.meta.env.PROD;
export const isDebug = !isProd;

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function applyPathMapping(savePath: string, fromClient: string, toClient: string, mappings: any[]): string {
  if (!mappings || mappings.length === 0 || !savePath) return savePath;
  let newPath = savePath;
  for (const mapping of mappings) {
    if (mapping.search && mapping.replace !== undefined) {
      if (
        (!mapping.fromClient || mapping.fromClient === fromClient) &&
        (!mapping.toClient || mapping.toClient === toClient)
      ) {
        try {
          const regex = new RegExp(mapping.search, "g");
          newPath = newPath.replace(regex, mapping.replace);
        } catch (e) {
          // Fallback to simple replace if invalid regex
          newPath = newPath.split(mapping.search).join(mapping.replace);
        }
      }
    }
  }
  return newPath;
}
