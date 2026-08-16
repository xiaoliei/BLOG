## Purpose

定义前台内容运行时行为：博客前台从构建期静态 import 切换为运行时 API 拉取，包含加载态、缓存策略、markdown 正文渲染与错误兜底，保证读者体验在数据源迁移后不劣化。

## ADDED Requirements

### Requirement: 前台数据拉取

前台首页 SHALL 通过 public-content-api 获取栏目与文章列表，加载期间 SHALL 展示骨架屏（skeleton）占位；数据返回后渲染与现有版式一致的内容。

#### Scenario: 首屏加载

- **WHEN** 读者打开博客首页且 API 未返回
- **THEN** 文章列表与栏目区域展示骨架占位，页面结构不跳动

#### Scenario: 数据返回渲染

- **WHEN** API 返回栏目与文章数据
- **THEN** 骨架替换为真实内容，样式与迁移前一致

### Requirement: API 失败兜底

public-content-api 请求失败（网络错误或 5xx）时，前台 SHALL 展示可重试的错误态，SHALL NOT 白屏或崩溃；启动页（LandingPage）与 3D 场景 SHALL NOT 受数据加载失败影响。

#### Scenario: 接口不可用

- **WHEN** 首页加载时 API 请求失败
- **THEN** 内容区展示错误提示与重试按钮，启动页与背景动画正常

### Requirement: 客户端缓存

前台 SHALL 对栏目与文章列表使用带过期时间的客户端缓存（再次访问时先用缓存渲染、后台静默刷新），文章详情弹层打开 SHALL 触发浏览量计数提交（遵循 60 秒去重）。

#### Scenario: 二次访问秒开

- **WHEN** 读者短期内再次访问首页且缓存未过期
- **THEN** 立即用缓存数据渲染，同时静默请求最新数据并按需更新

#### Scenario: 打开文章详情

- **WHEN** 读者打开文章详情弹层
- **THEN** 前台提交一次浏览计数，60 秒内重复打开同一篇不重复提交

### Requirement: Markdown 正文渲染

文章详情 SHALL 将 markdown 正文渲染为 HTML（支持 GFM 表格/代码块/图片），SHALL 对渲染输出做安全过滤防 XSS，文章内图片采用懒加载。

#### Scenario: 渲染富文本正文

- **WHEN** 读者打开含表格、代码块与图片的文章
- **THEN** 正文正确渲染各元素，样式与站点 tokens 一致

#### Scenario: 恶意内容过滤

- **WHEN** 文章正文包含 script 标签或内联事件属性
- **THEN** 渲染输出中这些内容被移除，不执行

### Requirement: 评论区前台展示

文章详情弹层 SHALL 展示该文章 approved 状态评论列表（昵称、时间、内容）与评论提交表单（昵称 + 内容）；提交后展示"待审核"提示，审核通过前不显示在前台。

#### Scenario: 阅读评论

- **WHEN** 读者打开文章详情
- **THEN** 弹层展示已放行评论，按时间正序

#### Scenario: 提交评论

- **WHEN** 读者填写昵称与内容并提交
- **THEN** 表单显示待审核提示并清空，刷新后评论在通过审核前不可见
