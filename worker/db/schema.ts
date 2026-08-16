import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/* ============================================================
   小礼工坊 D1 数据模型（SQLite via Drizzle）
   modules / posts / comments 三表
   ============================================================ */

export const modules = sqliteTable("modules", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	slug: text("slug").notNull().unique(),
	title: text("title").notNull(),
	accent: text("accent").notNull().default("#3F9D4B"),
	accentDark: text("accent_dark").notNull().default("#2E7D32"),
	icon: text("icon").notNull().default("feather"),
	blurb: text("blurb").notNull().default(""),
	sort: integer("sort").notNull().default(0),
});

export const posts = sqliteTable(
	"posts",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		slug: text("slug").notNull().unique(),
		moduleId: integer("module_id")
			.notNull()
			.references(() => modules.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		date: text("date").notNull(),
		tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
		readTime: integer("read_time").notNull().default(1),
		excerpt: text("excerpt").notNull().default(""),
		bodyMd: text("body_md").notNull().default(""),
		/** 'draft' | 'published' */
		status: text("status").notNull().default("draft"),
		views: integer("views").notNull().default(0),
		publishedAt: text("published_at"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(t) => [index("idx_posts_module_id").on(t.moduleId)],
);

export const comments = sqliteTable(
	"comments",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		postId: integer("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		author: text("author").notNull(),
		body: text("body").notNull(),
		/** 'pending' | 'approved' | 'rejected' */
		status: text("status").notNull().default("pending"),
		/** SHA-256 截断的提交 IP 指纹（限频/审计用，不存明文 IP） */
		ipHash: text("ip_hash").notNull().default(""),
		createdAt: text("created_at").notNull(),
	},
	(t) => [
		index("idx_comments_post_id").on(t.postId),
		index("idx_comments_status").on(t.status),
		index("idx_comments_ip_hash").on(t.ipHash),
	],
);

export type ModuleRow = typeof modules.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
