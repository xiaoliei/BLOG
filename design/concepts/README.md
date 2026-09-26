# 小礼港镇 · 已确认的概念

用户已确认 `harbor-panorama-v2-cartoon.png`：明亮白昼、卡通方块、粗颗粒像素纹理、鲜绿草地、蓝色水面、平直方块云。

v1 的写实黄昏效果已被替代，不作为实现目标。实际场景以 Three.js 几何构建，概念图只用于美术参考及 WebGL 失败的静态替代预览。图像由内置 image_gen 生成；没有把图片贴在正常主页上代替三维交互。

## 生成提示词要点

以用户附图为风格参考：LARGE simple block units, hard cubic silhouettes, bright saturated lime grass, sky blue water, nearest-neighbor low-resolution pixel textures, sunny cyan sky, rectangular white clouds, simple clean game lighting. Avoid realistic stonework, weathered materials, cinematic sunset, raytraced reflections, depth of field and dense microdetail.

构图：斜俯视海岸港镇；近景绿色屋顶书店、中央红屋顶小屋、右侧橙色工坊、左后蓝屋顶车站与黄色列车、右后山坡蓝色天文台；樱花树、码头、帆船、花草和街猫。无商标、无游戏主角、无 UI。

## 动画实现分镜

0–0.35 秒：时钟与提示退出，原地球继续保持视角。

0.35–2.1 秒：地球放大，逐渐转向落点，近景方块云进入。

2.1–3.2 秒：云层遮住尺度交接，镜头从高处接近港镇。

3.2–4.2 秒：云层离开，镜头减速停在全景位，地点标签与目录出现。

图像概念不代表逐帧动画已验证；实际证据见 `.impeccable/review` 与项目测试说明。
