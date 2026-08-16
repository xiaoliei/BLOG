/* ============================================================
   一次性 seed 脚本：读 src/config/blog.js 导出数据灌入 D1
   ------------------------------------------------------------
   用法：
     npm run seed          # 本地 D1（wrangler dev 用的 .wrangler/state）
     npm run seed:remote   # 远程 D1（需 wrangler login）
   行为：
     - 站点设置：DEFAULT_SETTINGS upsert（id=1，幂等，始终执行）
     - 栏目：id 作为 slug，sort 按出现顺序
     - 文章：slug 用「日期 + 标题短哈希」保证 URL 安全且稳定
     - excerpt 作为正文占位，全部 published
     - 已有内容数据时跳过（幂等：表非空则先报告后退出）
     - 结束输出 seed 源行数 vs D1 实际行数比对报告
   ============================================================ */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { MODULES, SITE } from "../src/config/blog.js";
import { DEFAULT_SETTINGS } from "../src/config/site-settings.js";

const REMOTE = process.argv.includes("--remote");
const DB = "blog-db";
const wrangler = (args, parseJson = false) => {
  const r = spawnSync(
    process.execPath,
    [join("node_modules", "wrangler", "bin", "wrangler.js"), ...args, ...(parseJson ? ["--json"] : [])],
    { encoding: "utf8" },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`wrangler ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
};

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const shortHash = (s) =>
  createHash("sha256").update(s).digest("hex").slice(0, 6);
const now = new Date().toISOString();

/* ---------- 1. 幂等检查 ---------- */
const countOf = (table) => {
  const out = wrangler(
    ["d1", "execute", DB, REMOTE ? "--remote" : "--local", "--command", `SELECT COUNT(*) AS n FROM ${table}`],
    true,
  );
  const parsed = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
  return parsed[0].results[0].n;
};

const existingModules = countOf("modules");
const existingPosts = countOf("posts");

/* ---------- 2. 站点设置：DEFAULT_SETTINGS upsert（幂等，始终执行） ---------- */
const s = DEFAULT_SETTINGS;
const settingsStmt = `INSERT INTO site_settings (id, name, tagline, since, description, author, email, github, latest_sub, modules_sub, about_title, about_text, footer_brand, footer_tagline, footer_nav_title, footer_contact_title, footer_bottom, updated_at) VALUES (1, ${q(s.name)}, ${q(s.tagline)}, ${s.since}, ${q(s.description)}, ${q(s.author)}, ${q(s.email)}, ${q(s.github)}, ${q(s.latestSub)}, ${q(s.modulesSub)}, ${q(s.aboutTitle)}, ${q(s.aboutText)}, ${q(s.footerBrand)}, ${q(s.footerTagline)}, ${q(s.footerNavTitle)}, ${q(s.footerContactTitle)}, ${q(s.footerBottom)}, ${q(now)}) ON CONFLICT(id) DO NOTHING;`;

const tmp = mkdtempSync(join(tmpdir(), "blog-seed-"));
const sqlFile = join(tmp, "seed.sql");

try {
  console.log(`[seed] 写入站点设置 → ${REMOTE ? "远程" : "本地"} D1…`);
  writeFileSync(sqlFile, settingsStmt, "utf8");
  wrangler(["d1", "execute", DB, REMOTE ? "--remote" : "--local", "--file", sqlFile]);
  const settingsN = countOf("site_settings");

  /* ---------- 3. 内容幂等检查 ---------- */
  if (existingModules > 0 || existingPosts > 0) {
    console.log(`[seed] D1 已有内容数据（modules=${existingModules}, posts=${existingPosts}），跳过内容 seed（站点设置已同步）。`);
    console.log("[seed] 如需重灌内容，请先清空表：wrangler d1 execute blog-db --local --command 'DELETE FROM posts; DELETE FROM modules;'");
    console.log(`[seed] settings : 源 1 行 → D1 ${settingsN} 行 ${settingsN === 1 ? "✓" : "✗ 不一致"}`);
    process.exit(settingsN === 1 ? 0 : 1);
  }

  /* ---------- 4. 生成内容 INSERT SQL ---------- */
  const expectedModules = MODULES.length;
  const expectedPosts = MODULES.reduce((n, m) => n + m.posts.length, 0);

  const stmts = [];
  MODULES.forEach((m, i) => {
    stmts.push(
      `INSERT INTO modules (slug, title, accent, accent_dark, icon, blurb, sort) VALUES (${q(m.id)}, ${q(m.title)}, ${q(m.accent)}, ${q(m.accentDark)}, ${q(m.icon)}, ${q(m.blurb)}, ${i});`,
    );
  });
  MODULES.forEach((m, mi) => {
    m.posts.forEach((p) => {
      const slug = `${p.date}-${shortHash(p.title)}`;
      const body = `${p.excerpt}\n\n> 完整正文正在整理归档，当前为摘要占位。`;
      stmts.push(
        `INSERT INTO posts (slug, module_id, title, date, tags, read_time, excerpt, body_md, status, views, published_at, created_at, updated_at) VALUES (${q(slug)}, ${mi + 1}, ${q(p.title)}, ${q(p.date)}, ${q(JSON.stringify(p.tags))}, ${p.readTime}, ${q(p.excerpt)}, ${q(body)}, 'published', 0, ${q(now)}, ${q(now)}, ${q(now)});`,
      );
    });
  });
  writeFileSync(sqlFile, stmts.join("\n"), "utf8");

  /* ---------- 5. 前置校验：slug 唯一性 ---------- */
  const postSlugs = [];
  MODULES.forEach((m) => m.posts.forEach((p) => postSlugs.push(`${p.date}-${shortHash(p.title)}`)));
  const dup = postSlugs.filter((s, i) => postSlugs.indexOf(s) !== i);
  const dupModules = MODULES.map((m) => m.id).filter((s, i, a) => a.indexOf(s) !== i);
  if (dup.length || dupModules.length) {
    throw new Error(`slug 冲突：modules=${dupModules.join(",")} posts=${dup.join(",")}`);
  }

  /* ---------- 6. 执行 ---------- */
  console.log(`[seed] 写入 ${expectedModules} 个栏目、${expectedPosts} 篇文章 → ${REMOTE ? "远程" : "本地"} D1…`);
  wrangler(["d1", "execute", DB, REMOTE ? "--remote" : "--local", "--file", sqlFile]);

  /* ---------- 7. 行数比对报告 ---------- */
  const modN = countOf("modules");
  const postN = countOf("posts");
  console.log("\n========== seed 行数比对报告 ==========");
  console.log(`站点：${SITE.name}`);
  console.log(`modules : 源 ${expectedModules} 篇 → D1 ${modN} 行 ${modN === expectedModules ? "✓" : "✗ 不一致"}`);
  console.log(`posts   : 源 ${expectedPosts} 篇 → D1 ${postN} 行 ${postN === expectedPosts ? "✓" : "✗ 不一致"}`);
  console.log(`settings: 源 1 行 → D1 ${settingsN} 行 ${settingsN === 1 ? "✓" : "✗ 不一致"}`);
  console.log("=======================================\n");
  if (modN !== expectedModules || postN !== expectedPosts || settingsN !== 1) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
