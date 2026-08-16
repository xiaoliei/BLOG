## Purpose

为读者侧提供博客内容的只读 HTTP API：栏目列表、已发布文章列表与详情（含 markdown 正文），以及文章浏览量的计数自增，是前台 SPA 的唯一数据来源。

## ADDED Requirements

### Requirement: 栏目列表查询

系统 SHALL 提供 `GET /api/public/modules` 端点，返回全部栏目（id、标题、主题色、图标、简介、排序、文章数），按 sort 字段升序排列。

#### Scenario: 正常获取栏目列表

- **WHEN** 客户端请求 `GET /api/public/modules`
- **THEN** 系统返回 200，body 为栏目数组，按 sort 升序，每项含文章计数字段

#### Scenario: 无栏目

- **WHEN** 数据库中无任何栏目记录
- **THEN** 系统返回 200 与空数组

### Requirement: 已发布文章列表查询

系统 SHALL 提供 `GET /api/public/posts` 端点，支持 `moduleId`（栏目筛选）与 `limit`（条数上限）查询参数，仅返回 status 为 published 的文章，按日期倒序，列表项 SHALL NOT 包含正文字段。

#### Scenario: 获取最新文章

- **WHEN** 客户端请求 `GET /api/public/posts?limit=6`
- **THEN** 系统返回 200，至多 6 篇 published 文章，按日期倒序，每项含 id/slug/标题/日期/标签/阅读时长/摘要/浏览量，不含正文

#### Scenario: 按栏目筛选

- **WHEN** 客户端请求 `GET /api/public/posts?moduleId=life`
- **THEN** 系统仅返回 moduleId 为 life 的 published 文章

#### Scenario: limit 缺省与越界

- **WHEN** 请求不含 limit 参数，或 limit 大于 50
- **THEN** 系统分别返回全部匹配文章、至多 50 篇

### Requirement: 文章详情查询

系统 SHALL 提供 `GET /api/public/posts/:slug` 端点，返回单篇 published 文章完整字段（含 markdown 正文与浏览量）；草稿文章 SHALL 返回 404。

#### Scenario: 获取已发布文章详情

- **WHEN** 客户端请求 `GET /api/public/posts/some-slug`
- **THEN** 系统返回 200，含 title/date/tags/readTime/excerpt/bodyMd/views/moduleId 全部字段

#### Scenario: 草稿不可见

- **WHEN** 客户端请求一篇 status 为 draft 的文章 slug
- **THEN** 系统返回 404

#### Scenario: 不存在的 slug

- **WHEN** 客户端请求的 slug 在数据库中不存在
- **THEN** 系统返回 404

### Requirement: 浏览量计数自增

系统 SHALL 提供 `POST /api/public/posts/:slug/views` 端点，对已发布文章的浏览量原子自增 1，返回自增后的值；同一客户端对同一文章 60 秒内的重复请求 SHALL NOT 重复计数。

#### Scenario: 首次浏览计数

- **WHEN** 客户端 A 请求 `POST /api/public/posts/some-slug/views`
- **THEN** 系统将该文章 views 原子 +1，返回新值

#### Scenario: 短时重复浏览去重

- **WHEN** 同一客户端 60 秒内对同一 slug 再次请求该端点
- **THEN** 系统返回当前值但不重复自增

#### Scenario: 对草稿计数

- **WHEN** 客户端对 draft 状态文章的 slug 请求计数
- **THEN** 系统返回 404，浏览量不变

### Requirement: 公开 API 缓存策略

`GET /api/public/*` 响应 SHALL 携带边缘缓存指令，published 内容的列表/详情 GET 请求在边缘缓存至少 60 秒；`POST` 端点与 404 响应 SHALL NOT 被边缘缓存。

#### Scenario: 列表响应可缓存

- **WHEN** 任意客户端请求 `GET /api/public/modules`
- **THEN** 响应头包含缓存指令（如 s-maxage≥60），重复请求在缓存有效期内由边缘命中返回

#### Scenario: 404 不缓存

- **WHEN** 客户端请求不存在的 slug，随后该文章被创建并发布
- **THEN** 后续请求在缓存过期前 MAY 返回 404，但过期后 SHALL 返回 200 最新内容
