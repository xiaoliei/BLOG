## Purpose

为作者侧提供内容管理的写路径 API：经 Cloudflare Access 鉴权后，可对文章与栏目执行增删改查，支持草稿/发布状态流转与 Vditor 编辑的 markdown 正文管理。

## ADDED Requirements

### Requirement: 管理端点鉴权

所有 `/api/admin/*` 端点 SHALL 验证请求中的 Cloudflare Access 身份凭证（JWT）；未携带有效凭证的请求 SHALL 返回 401，且 SHALL NOT 执行任何数据变更。

#### Scenario: 未鉴权访问被拒

- **WHEN** 客户端未携带 Access 凭证请求 `GET /api/admin/posts`
- **THEN** 系统返回 401，不返回任何文章数据

#### Scenario: 鉴权凭证无效

- **WHEN** 客户端携带过期或伪造的 Access JWT 请求任意 admin 端点
- **THEN** 系统返回 401

#### Scenario: 有效凭证放行

- **WHEN** 客户端携带 Access 签发的有效 JWT 请求
- **THEN** 系统正常处理该请求

### Requirement: 文章增删改查

系统 SHALL 提供文章 CRUD 端点：列表（含草稿，支持 status/moduleId 筛选）、单篇查询、创建、更新、删除；创建与更新的请求体 SHALL 校验标题必填、slug 唯一且符合 URL 安全字符集。

#### Scenario: 创建文章

- **WHEN** 作者提交合法的新文章数据（title、slug、moduleId、bodyMd 等）
- **THEN** 系统创建记录并返回 201 与完整文章对象

#### Scenario: slug 重复被拒

- **WHEN** 作者创建文章时使用已存在的 slug
- **THEN** 系统返回 409，并指明冲突字段

#### Scenario: 标题缺失被拒

- **WHEN** 创建或更新文章时 title 为空
- **THEN** 系统返回 400 与校验错误信息

#### Scenario: 列表含草稿

- **WHEN** 作者请求 `GET /api/admin/posts`
- **THEN** 系统返回 published 与 draft 的全部文章，含更新时间，按更新时间倒序

#### Scenario: 删除文章

- **WHEN** 作者删除一篇已有评论的文章
- **THEN** 系统删除文章及其关联评论，返回 204

### Requirement: 草稿与发布状态流转

系统 SHALL 支持文章 status 在 draft 与 published 间切换：draft→published（发布）与 published→draft（下架）均为显式操作；未发布文章对公开 API 不可见（见 public-content-api）。

#### Scenario: 发布草稿

- **WHEN** 作者对 draft 文章执行发布
- **THEN** 系统将 status 置为 published，记录发布时间，文章立即出现在公开列表

#### Scenario: 下架文章

- **WHEN** 作者对 published 文章执行下架
- **THEN** 系统将 status 置为 draft，公开 API 立即（或缓存过期后至多 60 秒内）不再返回该文章

### Requirement: 栏目增删改查

系统 SHALL 提供栏目 CRUD 端点；删除含文章的栏目 SHALL 被拒绝并提示先迁移文章；栏目排序字段可更新。

#### Scenario: 更新栏目信息

- **WHEN** 作者修改栏目标题与简介
- **THEN** 系统保存并返回更新后的栏目

#### Scenario: 删除非空栏目被拒

- **WHEN** 作者删除仍含文章的栏目
- **THEN** 系统返回 409 与迁移提示，栏目保持不变

#### Scenario: 调整栏目排序

- **WHEN** 作者更新栏目 sort 字段
- **THEN** 公开栏目列表按新排序返回
