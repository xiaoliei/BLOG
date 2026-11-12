/* ============================================================
   前端消费的 API 线上数据形状（手写镜像）
   ------------------------------------------------------------
   来源（保持同步）：
   - 栏目/文章列表列：worker/routes/public.ts 与 worker/routes/admin/*.ts
   - 数据库行：worker/db/schema.ts（Drizzle $inferSelect）
   - 设置：类型直接转发 worker/lib/settings.ts（那里由 DEFAULT_SETTINGS 推导）
   ============================================================ */

/* ============================================================
   设置行 <-> 公开 JSON 的映射是 Worker 独有的逻辑，类型也归 Worker 所有。
   这里只做转发，避免前端再维护一份同名同形的接口定义。
   ============================================================ */
export type { SiteSettings, SiteSettingsWithMeta } from "../../worker/lib/settings.ts";

export type PostStatus = "draft" | "published";
export type CommentStatus = "pending" | "approved" | "rejected";

/** 栏目列表行（含 postCount 子查询，见 worker/routes/admin/modules.ts 与 public.ts） */
export interface ModuleSummary {
	id: number;
	slug: string;
	title: string;
	accent: string;
	accentDark: string;
	icon: string;
	blurb: string;
	sort: number;
	postCount: number;
}

/** POST/PATCH /admin/modules 的响应：裸 modules 行，没有列表接口才有的 postCount。
 *  见 worker/routes/admin/modules.ts 的 .returning()。 */
export type ModuleRow = Omit<ModuleSummary, "postCount">;

/** 公开文章列表行（不含正文）。
 *  moduleAccent* 由 listColumns 无条件 innerJoin 选出，线上响应里恒为字符串；
 *  静态回退行不带这两个字段，走的是 StaticPostItem，不是本类型。 */
export interface PostListItem {
	id: number;
	slug: string;
	moduleId: number;
	moduleSlug: string;
	moduleTitle: string;
	moduleAccent: string;
	moduleAccentDark: string;
	title: string;
	date: string;
	tags: string[];
	readTime: number;
	excerpt: string;
	views: number;
}

/** 公开文章详情（含正文） */
export interface PostDetail extends PostListItem {
	bodyMd: string;
	status: PostStatus;
	publishedAt: string | null;
}

/** 后台文章列表行（无 moduleSlug/moduleAccent，多 status/时间戳） */
export interface AdminPostRow {
	id: number;
	slug: string;
	moduleId: number;
	moduleTitle: string;
	title: string;
	date: string;
	tags: string[];
	readTime: number;
	excerpt: string;
	status: PostStatus;
	views: number;
	publishedAt: string | null;
	updatedAt: string;
}

/** 后台文章详情 = GET /posts/:id 的裸数据库行（worker/routes/admin/posts.ts select().from(posts)）。
 *  注意不能继承 AdminPostRow：moduleTitle 只在列表接口 join 出，详情接口不返回。 */
export interface AdminPostDetail extends Omit<AdminPostRow, "moduleTitle"> {
	moduleId: number;
	bodyMd: string;
	createdAt: string;
}

/** POST/PATCH /admin/posts 的响应：裸 posts 行（同 AdminPostDetail）。 */
export type AdminPostRecord = AdminPostDetail;

export interface PublicComment {
	id: number;
	author: string;
	body: string;
	createdAt: string;
}

export interface AdminCommentRow {
	id: number;
	postId: number;
	postTitle: string;
	postSlug: string;
	author: string;
	body: string;
	status: CommentStatus;
	ipHash: string;
	createdAt: string;
}
