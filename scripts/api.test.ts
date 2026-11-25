import test from 'node:test';
import assert from 'node:assert/strict';
import { getStaticPosts, swr } from '../src/lib/api.ts';
import { ApiError } from '../src/lib/http.ts';
import { ALL_POSTS, MODULES } from '../src/config/blog.ts';

/* 静态回退的契约测试。
   前端有两处靠「行里有没有 slug 键」区分 API 行与内置快照行：
   src/world/PlacePanel.tsx 的 toCard 和 src/world/ArticleReader.tsx 的邻居过滤。
   静态行一旦被加上 slug（哪怕是 undefined），这两处就会把示例行当成可跳转文章。 */

test('静态行不含 slug/id，供 UI 判别 API 行与示例行', () => {
	const rows = getStaticPosts();
	assert.ok(rows.length > 0, '内置快照不应为空');
	for (const row of rows) {
		assert.equal('slug' in row, false, `${row.title} 不应带 slug`);
		assert.equal('id' in row, false, `${row.title} 不应带 id`);
		assert.equal('views' in row, false, `${row.title} 不应带 views`);
	}
});

test('静态行的 key 在「栏目/日期/标题」组合下唯一（PlacePanel 用它当 React key）', () => {
	const keys = getStaticPosts().map((row) => row.key);
	const dup = keys.filter((key, i) => keys.indexOf(key) !== i);
	assert.deepEqual(dup, [], `重复的 key 会让筛选切换时列表错位：${[...new Set(dup)].join('; ')}`);
	assert.equal(keys.length, ALL_POSTS.length, '行数必须与 ALL_POSTS 一致');
});

test('按栏目筛选只返回该栏目的行，且 moduleTitle 跟随栏目定义', () => {
	for (const mod of MODULES) {
		const rows = getStaticPosts({ moduleId: mod.id });
		assert.equal(rows.length, mod.posts.length, `${mod.id} 行数不符`);
		assert.ok(rows.every((row) => row.moduleTitle === mod.title), `${mod.id} 的 moduleTitle 应取栏目定义`);
		assert.ok(rows.every((row) => row.moduleAccent === mod.accent), `${mod.id} 的 moduleAccent 应取栏目定义`);
	}
	assert.deepEqual(getStaticPosts({ moduleId: 'not-a-module' }), []);
});

test('静态行字段与类型声明一致（避免调用方读到 undefined）', () => {
	for (const row of getStaticPosts()) {
		for (const field of ['key', 'moduleSlug', 'moduleTitle', 'moduleAccent', 'moduleAccentDark', 'title', 'date', 'excerpt'] as const) {
			assert.equal(typeof row[field], 'string', `${row.key}.${field} 必须是字符串`);
		}
		assert.equal(typeof row.readTime, 'number');
		assert.ok(Array.isArray(row.tags));
	}
});
/* SWR 缓存失效契约（src/lib/api.ts）。
   旧实现里后台刷新拿到 404 时错误被吞掉、localStorage 里的旧正文永不删除，
   文章下架后读过它的读者仍能一直看到正文。 */

test('SWR：后台刷新遇到 404 时清除过期缓存，404 不重试，过旧的缓存不再直接返回', async () => {
	const g = globalThis as unknown as { localStorage?: unknown };
	const previous = g.localStorage;
	const store = new Map<string, string>();
	g.localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
	};
	try {
		let calls = 0;
		const notFound = () => {
			calls += 1;
			return Promise.reject(new ApiError(404, null, 'HTTP 404'));
		};

		/* 无缓存时直接联网：404 只请求一次（不重试） */
		await assert.rejects(swr('test:missing', notFound), /HTTP 404/);
		assert.equal(calls, 1, '404 不应重试');

		/* 10 分钟前的缓存：先返回旧值，后台刷新发现 404 后必须清除 */
		store.set('swr:test:stale', JSON.stringify({ data: { ok: true }, at: Date.now() - 10 * 60_000 }));
		assert.deepEqual(await swr('test:stale', notFound), { ok: true });
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(store.has('swr:test:stale'), false, '404 后旧缓存必须被删除');

		/* 1 小时前的缓存：不再直接返回，联网失败就报错，且同样清掉 */
		store.set('swr:test:ancient', JSON.stringify({ data: { ok: true }, at: Date.now() - 60 * 60_000 }));
		await assert.rejects(swr('test:ancient', notFound), /HTTP 404/);
		assert.equal(store.has('swr:test:ancient'), false, '超过上限的缓存应被清除');
	} finally {
		g.localStorage = previous;
	}
});
