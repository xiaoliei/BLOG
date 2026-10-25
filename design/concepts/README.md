# 像素域 · 已确认的概念

用户已确认 `harbor-panorama-v2-cartoon.png`：明亮白昼、卡通方块、粗颗粒像素纹理、鲜绿草地、蓝色水面、平直方块云。

v1 的写实黄昏效果已被替代，不作为实现目标。实际场景以 Three.js 几何构建，概念图只用于美术参考及 WebGL 失败的静态替代预览。图像由内置 image_gen 生成；没有把图片贴在正常主页上代替三维交互。

## 生成提示词要点

以用户附图为风格参考：LARGE simple block units, hard cubic silhouettes, bright saturated lime grass, sky blue water, nearest-neighbor low-resolution pixel textures, sunny cyan sky, rectangular white clouds, simple clean game lighting. Avoid realistic stonework, weathered materials, cinematic sunset, raytraced reflections, depth of field and dense microdetail.

构图：斜俯视海岸像素域；近景绿色屋顶书店、中央红屋顶小屋、右侧橙色工坊、左后蓝屋顶车站与黄色列车、右后山坡蓝色天文台；樱花树、码头、帆船、花草和街猫。无商标、无游戏主角、无 UI。

## 动画实现分镜

0–0.45 秒：从点击时真实待机姿态起步；时钟、月球与提示同步淡出。

0.35–2.45 秒：视线目标连续移向地球背侧的真实港镇，镜头同步推进；地球与小岛一起旋转，视线跟踪实际小岛的位置，场景与相机不切换。

约 1.9–2.65 秒：地球背面与小岛逐渐转向镜头，小岛建筑随拉近变得清晰；不添加立体云、不遮屏换景。雾距跟随真实观察距离，避免竖屏落点被雾遮住。2.1–3.05 秒海面平滑扩展，衔接主页海域。

3.2–4.6 秒：视线保持港镇中心，镜头减速到现有响应式全景位；4.15 秒开始逐步显示标题、标签与目录，结束后开放交互。天空与光照衔接当地时间。

使用原版 `mc_head.glb`，保留原始贴图与启动页姿态；同一份实际港镇几何放在背侧。铁路远景复用原存档桥段与材质延伸至可见范围以外，并平滑淡出，避免进入时暴露有限长度的断头。概念图中的云只属于历史美术参考，当前过场不生成立体云。页面录像、关键帧与状态报告见 `.shots/rail-original-model/`，轨迹连续性、相机转向上限和背侧旋转坐标由 `scripts/entry-flight.test.mjs` 覆盖。
