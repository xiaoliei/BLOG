# 草堂 GrassBlog — 背景样式 Demo

参考 [xiaoli.team](https://xiaoli.team/)（草堂 GrassForum）背景样式制作的
纯背景演示页：**只保留背景层，不包含任何内容模块**（无顶栏、无文章列表、
无侧栏、无页脚文字）。零依赖，任何静态服务器即可打开。

## 页面组成

从上到下共三层背景：

1. **绿色 Hero 色带** `#4CAF50`（原站 `themePrimaryColor`），底部铺原站
   `hero-bottom-lightwool.png` 羊毛饰条，结构与原站 `.Hero` 一致
   （`background: url(...) bottom #4CAF50 repeat-x; padding-bottom: 30px`）；
2. **中部留白**：全页平铺原站 `bg-wool-light.png` 浅色羊毛纹理
   （原站 `.App` 背景同款）；
3. **蓝色页脚色带** `#0e77a4`，顶部铺原站 `footer-top-lightwool.png`
   羊毛饰条，尺寸与原站 `.footer` 一致（固定 `height: 210px`、
   `padding-top: 85px`；桌面端 `padding-left: 150px`，移动端 `0 25px`）。

另复刻原站自定义 CSS 中的自定义滚动条：10px 宽，滑块 `#0e77a4`、
轨道 `#e8ecf3`。

`assets/` 下的三张 PNG 为原站背景图副本（来源：
<https://xiaoli.team/img/bg-wool-light.png>、
<https://xiaoli.team/img/hero-bottom-lightwool.png>、
<https://xiaoli.team/img/footer-top-lightwool.png>）。

## 运行

```bash
node ../scripts/dev-server.js   # http://localhost:8000/xiaoli-home/
```

也可以直接把整个 `xiaoli-home/` 目录交给任意静态服务器。

## 文件

```
├── index.html      # 三个背景层：hero 色带 + 中部羊毛纹理 + 页脚色带
├── css/style.css   # 背景样式（引用 assets 原图），无任何内容模块样式
├── assets/         # 原站背景图副本（bg-wool / hero-bottom / footer-top）
└── preview/        # 无头 Chrome 渲染截图（桌面 1440px / 移动 390px）
```
