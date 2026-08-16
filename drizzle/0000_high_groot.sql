CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ip_hash` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_comments_post_id` ON `comments` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_comments_status` ON `comments` (`status`);--> statement-breakpoint
CREATE INDEX `idx_comments_ip_hash` ON `comments` (`ip_hash`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`accent` text DEFAULT '#3F9D4B' NOT NULL,
	`accent_dark` text DEFAULT '#2E7D32' NOT NULL,
	`icon` text DEFAULT 'feather' NOT NULL,
	`blurb` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_slug_unique` ON `modules` (`slug`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`module_id` integer NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`read_time` integer DEFAULT 1 NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`body_md` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_posts_module_id` ON `posts` (`module_id`);