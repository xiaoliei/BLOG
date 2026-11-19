/* 正文目录：从 Markdown 提取二、三级标题，并为正文标题生成锚点。
 * 渲染时 rehypeHeadingIds 按「文档顺序」把同一批 id 写回 h2/h3，
 * 因此目录与正文一定对得上，不依赖从 React children 反推文本。 */

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}(#{2,3})\s+(.+?)\s*#*\s*$/;
/* Setext 底线写法：上一行是段落文字，本行是 === （h1）或 --- （h2）。
 * 渲染器会把它们产出为标题，这里必须同样识别，否则目录与正文错位。 */
const SETEXT = /^\s{0,3}(=+|-+)\s*$/;
/* 这些行不会成为 setext 标题的正文：ATX 标题、引用、列表、表格分隔行。 */
const NOT_PARAGRAPH = /^\s{0,3}(#{1,6}\s|>|([-*+]|\d{1,9}[.)])\s|\|)/;

/** 去掉行内 Markdown/HTML，只留标题文字。 */
function plainText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[\\*_~]/g, '')
    .trim();
}

/** 锚点 id：保留中日韩文字与数字，空格转连字符，重复标题追加序号。 */
export function slugifyHeading(text: string): string {
  const slug = plainText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return slug || 'section';
}

/** 逐行扫描，跳过围栏代码块；识别 ATX 与 Setext 标题；返回按文档顺序排列的标题。 */
export function extractHeadings(markdown: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const used = new Map<string, number>();
  let fence: string | null = null;
  /* 上一行非空且非特殊行时暂存其文字，若是 setext 底线行则按该级别出标题。 */
  let pending: { text: string } | null = null;
  const push = (raw: string, level: 2 | 3) => {
    const text = plainText(raw);
    if (!text) return;
    const base = slugifyHeading(text);
    const seen = (used.get(base) || 0) + 1;
    used.set(base, seen);
    headings.push({ id: seen === 1 ? base : `${base}-${seen}`, text, level });
  };
  for (const line of markdown.split(/\r?\n/)) {
    const marker = line.match(FENCE)?.[1]?.[0];
    if (marker) {
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      pending = null;
      continue;
    }
    if (fence !== null) continue;
    const setext = line.match(SETEXT)?.[1];
    if (setext && pending) {
      /* === / --- 只在上一行是正文文字时才是 setext 底线（--- 单独出现是分割线，不算标题）。 */
      push(pending.text, 2);
      pending = null;
      continue;
    }
    const match = line.match(HEADING);
    if (match) { pending = null; push(match[2] || '', match[1]?.length === 2 ? 2 : 3); continue; }
    if (!line.trim() || NOT_PARAGRAPH.test(line)) { pending = null; continue; }
    pending = { text: line.trim() };
  }
  return headings;
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** rehype 插件：把 ids 按文档顺序写到 h2/h3 上（在 sanitize 之后运行）。 */
export function rehypeHeadingIds({ ids }: { ids: string[] }) {
  return (tree: unknown): void => {
    let index = 0;
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && (node.tagName === 'h2' || node.tagName === 'h3')) {
        const id = ids[index];
        index += 1;
        if (id) node.properties = { ...(node.properties || {}), id };
      }
      for (const child of node.children || []) walk(child);
    };
    walk(tree as HastNode);
  };
}