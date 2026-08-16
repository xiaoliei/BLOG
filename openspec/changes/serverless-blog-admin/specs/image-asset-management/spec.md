## Purpose

为博客提供图片资产的存储与访问能力：后台编辑器上传的图片存入 R2 对象存储，通过公开 URL 在前台文章正文中引用，P4 阶段交付。

## ADDED Requirements

### Requirement: 图片上传

系统 SHALL 提供 `POST /api/admin/upload` 端点（Access 鉴权），接受图片二进制（jpeg/png/gif/webp，单文件至多 5MB），存入对象存储并返回可公开访问的 URL。

#### Scenario: 上传编辑器贴图

- **WHEN** 作者在 Vditor 中粘贴剪贴板图片
- **THEN** 图片经该端点上传成功，返回的 URL 直接插入正文 markdown

#### Scenario: 非图片类型被拒

- **WHEN** 上传扩展名或 MIME 不在允许列表内的文件
- **THEN** 系统返回 400 与允许类型说明

#### Scenario: 超限文件被拒

- **WHEN** 上传超过 5MB 的图片
- **THEN** 系统返回 413

### Requirement: 图片公开访问

已上传图片 SHALL 通过稳定 URL（含不可预测的文件名）对外提供读取，响应 SHALL 携带长周期缓存指令；未鉴权请求 SHALL NOT 能列举或删除存储中的对象。

#### Scenario: 正文引用图片

- **WHEN** 读者浏览包含上传图片的文章
- **THEN** 图片 URL 可直接加载，浏览器可长缓存

#### Scenario: 不可枚举

- **WHEN** 任意客户端尝试调用列举或删除对象的接口
- **THEN** 系统返回 401/403，公开路径仅支持读取已上传对象
