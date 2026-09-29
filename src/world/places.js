// Blog identities only. Spatial data is loaded from the world save.
export const PLACES = [
  { id: 'bookshop', name: '街角书店', short: '书店', color: '#318047', modules: ['reading'], description: '推开绿屋檐下的门，在文字里停留一会儿。', detail: '读书笔记' },
  { id: 'workshop', name: '小礼工坊', short: '工坊', color: '#bb5626', modules: ['projects', 'tech', 'lab'], description: '从一个小想法开始，把代码搭成自己的世界。', detail: '项目 · 技术 · 实验' },
  { id: 'cottage', name: '河岸小屋', short: '小屋', color: '#bf5051', modules: ['life'], description: '猫在晒太阳，风吹过院子。这里收藏平凡日子的片段。', detail: '生活杂记' },
  { id: 'station', name: '旅行车站', short: '车站', color: '#296b9c', modules: ['travel', 'archive'], description: '带上一点好奇心，去看看街道以外的风景。', detail: '游记 · 时间归档' },
  { id: 'observatory', name: '山坡天文台', short: '天文台', color: '#4865a3', modules: ['about'], description: '在世界的高处，认识这座小镇的建造者。', detail: '关于小礼' },
];
export const PLACE_MAP = Object.fromEntries(PLACES.map(p => [p.id, p]));
export function placeForModule(moduleSlug) {
  return PLACES.find(place => place.modules.includes(moduleSlug)) || null;
}
export function readWorldRoute(hash) {
  const post = /^#post\/([a-z0-9-]+)$/.exec(hash);
  if (post) return { home: true, place: null, post: post[1] };
  const match = /^#home(?:\/([^/]+))?$/.exec(hash);
  return { home: Boolean(match), place: match && PLACE_MAP[match[1]] ? match[1] : null };
}
export const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const ease = t => 1 - Math.pow(1 - clamp(t), 3);
