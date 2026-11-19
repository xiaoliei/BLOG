import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHeadings, rehypeHeadingIds, slugifyHeading } from '../src/world/reader-toc.ts';

interface Node { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[]; }

test('extracts h2/h3 headings and skips fenced code', () => {
  const markdown = ['# 一级标题', '## 缘起', '### 拆与重搭', '```md', '## 代码里的标题', '```', '## 排水渠'].join('\n');
  assert.deepEqual(extractHeadings(markdown), [
    { id: '缘起', text: '缘起', level: 2 },
    { id: '拆与重搭', text: '拆与重搭', level: 3 },
    { id: '排水渠', text: '排水渠', level: 2 },
  ]);
});

test('slugs keep CJK, drop inline markup and de-duplicate repeated titles', () => {
  assert.equal(slugifyHeading('Hello, World!'), 'hello-world');
  assert.equal(slugifyHeading('**加粗** 与 `代码`'), '加粗-与-代码');
  assert.deepEqual(extractHeadings(['## 同一节', '## 同一节'].join('\n')).map(item => item.id), ['同一节', '同一节-2']);
});

test('extracts setext underlined headings the same as ATX', () => {
  /* 「正文一段 ---」是 setext h2；「---」跟在列表后是分割线，不产生标题；「排水渠 ===」是 setext h2。 */
  const markdown = ['缘起', '====', '### 拆与重搭', '正文一段', '---', '- 列表项', '---', '排水渠', '==='].join('\n');
  assert.deepEqual(extractHeadings(markdown), [
    { id: '缘起', text: '缘起', level: 2 },
    { id: '拆与重搭', text: '拆与重搭', level: 3 },
    { id: '正文一段', text: '正文一段', level: 2 },
    { id: '排水渠', text: '排水渠', level: 2 },
  ]);
});

test('rehype plugin writes ids to h2/h3 in document order', () => {
  const tree: Node = { type: 'root', children: [
    { type: 'element', tagName: 'h2', properties: {}, children: [] },
    { type: 'element', tagName: 'p', properties: {}, children: [] },
    { type: 'element', tagName: 'h3', properties: {}, children: [] },
    { type: 'element', tagName: 'h4', properties: {}, children: [] },
  ] };
  rehypeHeadingIds({ ids: ['a', 'b'] })(tree);
  assert.deepEqual(tree.children?.map(node => node.properties?.id), ['a', undefined, 'b', undefined]);
});