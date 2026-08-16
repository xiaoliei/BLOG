## Purpose

站点级文本（站点元信息、关于我、页脚）从硬编码配置迁移为后台可编辑、前台经公开
API 读取的运行时内容，使作者无需改代码即可维护整站文案。

## ADDED Requirements

### Requirement: 站点设置存储与公开读取

系统 SHALL 存储单份站点设置（站名、标语、开始时间、描述、作者、邮箱、GitHub 链接、
首页「最新文章」「文章栏目」区块描述、关于我标题与正文、页脚品牌文本、页脚标语、
页脚栏目标题与底部文案），并通过
`GET /api/public/settings` 公开返回全部字段；公开响应 SHALL 带 `s-maxage=60`
边缘缓存。设置表尚未初始化时，公开端点 SHALL 返回与 seed 一致的内置默认值，
SHALL NOT 返回 500 或空响应。

#### Scenario: 读者获取站点设置

- **WHEN** 读者请求 `GET /api/public/settings` 且设置已初始化
- **THEN** 系统返回 200 与完整设置对象（含站点、关于我、页脚三组字段）

#### Scenario: 公开设置响应可被边缘缓存

- **WHEN** 读者请求 `GET /api/public/settings`
- **THEN** 响应头包含 `Cache-Control` 且 `s-maxage=60`

#### Scenario: 设置表未初始化

- **WHEN** `site_settings` 表为空时读者请求 `GET /api/public/settings`
- **THEN** 系统返回内置默认设置对象，不报错

### Requirement: 后台站点设置管理

系统 SHALL 提供 `GET /api/admin/settings` 读取与 `PATCH /api/admin/settings`
部分更新站点设置；所有 admin 端点 SHALL 沿用 Access 鉴权。更新请求体 SHALL
校验字段格式（站名/标语/描述/作者等文本长度受限、开始时间为四位年份整数、
邮箱与 GitHub 链接为合法格式）；校验失败 SHALL 返回 400。保存成功后系统 SHALL
失效 `GET /api/public/settings` 的边缘缓存，使新值至多 60 秒内对读者生效。
设置表为空时首次更新 SHALL 自动创建设置行（upsert）。

#### Scenario: 后台读取站点设置

- **WHEN** 作者请求 `GET /api/admin/settings`
- **THEN** 系统返回当前设置对象（未初始化时返回默认值）

#### Scenario: 更新站点文本

- **WHEN** 作者通过 `PATCH /api/admin/settings` 修改站名、标语或页脚文案
- **THEN** 系统保存变更并返回 200 与更新后的完整设置对象

#### Scenario: 非法设置值被拒

- **WHEN** 作者提交非法值（如开始时间不是四位年份、超长文本、非法邮箱）
- **THEN** 系统返回 400 与字段级校验错误，且不保存任何变更

#### Scenario: 首次更新自动建行

- **WHEN** `site_settings` 表为空时作者执行 `PATCH /api/admin/settings`
- **THEN** 系统创建设置行并保存更新，返回更新后的设置对象

#### Scenario: 更新后缓存失效

- **WHEN** 作者更新站点设置后读者请求 `GET /api/public/settings`
- **THEN** 新值在边缘缓存失效后（至多 60 秒）返回给读者

### Requirement: 后台站点设置界面

`/admin` 后台 SHALL 提供「站点设置」入口与表单页，表单按「站点信息 / 关于我 /
页脚」分组展示可编辑字段；页面加载时读取当前设置，保存时提交部分更新，成功后
SHALL 给出明确反馈，失败时 SHALL 展示错误信息且不丢失已填内容。

#### Scenario: 打开站点设置页

- **WHEN** 作者在后台导航点击「站点设置」
- **THEN** 页面展示分组表单并载入当前设置值

#### Scenario: 保存设置成功

- **WHEN** 作者修改字段并点击保存且校验通过
- **THEN** 页面提示保存成功，表单保持最新值

#### Scenario: 保存设置失败

- **WHEN** 作者提交非法值或网络失败
- **THEN** 页面展示错误信息，已填内容不丢失

### Requirement: 前台应用站点设置

博客首页 SHALL 从 `GET /api/public/settings` 获取并渲染 Hero（站名、标语、
EST 开始年份与统计）、关于我模块（标题、角色描述、正文）与页脚模块（品牌文本、
标语、栏目标题、底部文案）；数据到达前 SHALL 先用内置默认值渲染（不白屏、
不布局跳动），请求失败时 SHALL 保持默认值展示。页面文档标题 SHALL 反映设置中的站名。

#### Scenario: Hero 使用站点设置

- **WHEN** 首页加载且 settings 已返回
- **THEN** Hero 站名、标语与 EST 年份使用 settings 中的值渲染

#### Scenario: 关于我模块使用站点设置

- **WHEN** settings 已返回
- **THEN** 关于我模块的标题、角色描述与正文使用 settings 中的值渲染

#### Scenario: 页脚模块使用站点设置

- **WHEN** settings 已返回
- **THEN** 页脚品牌、标语、栏目标题与底部文案使用 settings 中的值渲染

#### Scenario: 设置未返回时使用默认值

- **WHEN** 首页首帧 settings 尚未返回或请求失败
- **THEN** 页面以内置默认值渲染 Hero、关于我与页脚，不白屏、不布局跳动

#### Scenario: 首页区块描述使用站点设置

- **WHEN** settings 已返回
- **THEN** 「最新文章」与「文章栏目」区块标题下方的描述使用 settings 中的值渲染

#### Scenario: 文档标题同步站名

- **WHEN** settings 中的站名可用
- **THEN** 页面 `document.title` 使用该站名
