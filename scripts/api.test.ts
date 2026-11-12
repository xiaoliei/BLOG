import test from 'node:test';
import assert from 'node:assert/strict';
import { getStaticPosts } from '../src/lib/api.ts';
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