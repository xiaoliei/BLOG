## Purpose

让游客读者对已发布文章发表评论（昵称 + 内容），通过蜜罐、IP 限频与默认待审三层防线控制垃圾内容，由作者在后台审核放行。

## ADDED Requirements

### Requirement: 游客评论提交

系统 SHALL 提供 `POST /api/public/posts/:slug/comments` 端点，接受昵称（1–24 字符）与内容（1–500 字符），仅对 published 文章开放；提交成功后评论进入 pending 状态，SHALL NOT 立即公开展示。

#### Scenario: 正常提交评论

- **WHEN** 游客对已发布文章提交合法昵称与内容
- **THEN** 系统创建 pending 状态评论，返回 201 与提交成功提示

#### Scenario: 字段校验失败

- **WHEN** 昵称为空、超过 24 字符，或内容为空、超过 500 字符
- **THEN** 系统返回 400 与具体校验错误

#### Scenario: 对草稿评论

- **WHEN** 游客对 draft 状态文章的 slug 提交评论
- **THEN** 系统返回 404，不创建评论

### Requirement: 蜜罐反垃圾

评论提交接口 SHALL 包含一个对人类不可见的蜜罐字段；蜜罐字段非空的提交 SHALL 被静默丢弃（返回伪装成功响应，不落库）。

#### Scenario: 机器人填了蜜罐

- **WHEN** 提交请求中蜜罐字段包含任意内容
- **THEN** 系统返回 201 伪装成功，但数据库中不产生该评论

### Requirement: IP 提交限频

同一 IP 对评论接口的提交 SHALL 受 30 秒 1 条的限制；超限提交 SHALL 返回 429。

#### Scenario: 超频提交被拒

- **WHEN** 同一 IP 在 30 秒内提交第 2 条评论
- **THEN** 系统返回 429 与稍后再试提示

### Requirement: 已审核评论公开查询

系统 SHALL 提供 `GET /api/public/posts/:slug/comments`，仅返回 approved 状态评论，按时间正序；pending 与 rejected 评论对公开接口不可见。

#### Scenario: 读取已放行评论

- **WHEN** 客户端请求某文章的评论列表
- **THEN** 系统仅返回 approved 评论及昵称、内容、时间，不暴露状态与 IP 信息

### Requirement: 作者评论审核

系统 SHALL 提供 `GET /api/admin/comments`（按状态筛选）、`PATCH /api/admin/comments/:id`（approve / reject）与删除端点，均要求 Access 鉴权。

#### Scenario: 审核队列

- **WHEN** 作者请求 `GET /api/admin/comments?status=pending`
- **THEN** 系统返回全部待审评论，含文章标题、昵称、内容、提交时间

#### Scenario: 放行评论

- **WHEN** 作者对一条 pending 评论执行 approve
- **THEN** 系统将状态置为 approved，该评论立即出现在公开评论列表

#### Scenario: 拒绝并删除垃圾评论

- **WHEN** 作者对一条评论执行删除
- **THEN** 系统删除该评论记录，返回 204
