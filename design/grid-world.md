# 像素域格子世界

像素域以已有 3D 场景为迁移基准：五栋建筑、道路主干、海岸、铁路西向延伸及码头保持原有空间关系。概念图用于补充细节，不替代实际场景布局。世界是格子数据和模型实例；Three.js 场景只是它的渲染结果。

## 开发与发布

```sh
npm run world:generate  # 生成世界，验证后写入存档及派生网格
npm run world:validate  # 只读验证已保存的世界和像素域空间规则
npm run test:world      # 模型、空间、存档、遮挡和旧有路由测试
npm run build          # 打包已保存的地图；不会重新生成或部署
```

修改模型或生成器后运行生成命令，将 `public/world/harbor.world.json` 和 `public/world/harbor.mesh.json` 一同提交。生成使用固定种子和排序；不写时间戳。同一输入得到字节一致的文件。生成器先验证数据、实际支撑面、道路连通和铁路净空，再通过临时文件替换输出。

Windows 下若开发服务器持有资产文件导致替换报 `EPERM`，生成命令会进行有限重试；仍失败时先停止开发服务器，再重新生成。失败不会删除已有存档。

`harbor.world.json` 是唯一地图数据来源。`harbor.mesh.json` 是可丢弃的性能缓存，绑定世界文件的 SHA-256；缺失、损坏或来源不匹配时，客户端从已校验的世界数据重新计算网格。世界文件不可用时沿用静态预览和博客目录。

## 代码职责

| 模块 | 内容 |
| --- | --- |
| `src/world/models.js` | 模型注册、状态校验、旋转、几何与占用 |
| `src/world/data.js` | 世界容器、占用索引、原子操作、支撑、RLE 存档 |
| `src/world/harbor-layout.js`、`layout.js` | 离线布局配置、原有地形与道路采样 |
| `src/world/generate.js` | 实体地形、空心建筑、屋顶、植被及装饰的离线搭建 |
| `src/world/harbor-validation.js` | 道路支撑、净空、入口连通、地基与列车检查 |
| `src/world/mesher.js`、`mesh-cache.js` | 精确表面裁剪、共面合并及派生缓存 |
| `src/world/render-world.js` | Three.js 网格、材质、任意三角形模型实例化及拾取 |
| `src/world/entities.js`、`voxel.js` | 动态实体模型与动画；旧 box 工具只用于实体局部几何 |
| `src/world/town.js`、`engine.js` | 存档场景接入、异步加载、镜头与生命周期 |

旧的运行时建筑拼景模块已移除。`places.js` 只保存博客业务信息；运行时地点坐标、标签与镜头来自存档，不再引用离线布局。

## 坐标与占用

- 整数 `(x,y,z)` 表示格子最小角，X 东、Y 上、Z 南；一格为 `0.5` 场景单位。
- `worldToCell` 向下取整，负坐标同样成立。分块为 `16³` 格。
- 半砖、楼梯和竖半砖可以只填满部分体积，但默认独占所在格子。
- 多格实例以整数格锚点放置，保存一次；占用索引由模型、朝向和状态重建。
- 静态模型朝向为 `south / west / north / east`，相邻朝向旋转 90°；旋转中心为锚点格子的水平中心。多格对象旋转后可以占用锚点负侧格子。
- 地点的 `position / entry / label` 和动态实体 `position` 使用场景单位；方块坐标、实例 `anchor` 和支撑查询使用格子单位。
- 楼梯朝向表示升高方向；`half` 为 `bottom / top`，形态包括 `straight / inner-left / inner-right / outer-left / outer-right`。左右按默认朝南模型的局部 X 轴定义，再随模型旋转。
- 栅栏连接根据同高度相邻格的连接能力计算，不写入存档。上、下半砖同材质合并时变为整砖。
- 门保存宽、高、铰链侧与开关状态；更新先验证全部目标格及保守开启扫掠范围，失败不改变原对象。本次没有开门 UI。

模型几何、空间占用、碰撞代理、支撑要求彼此独立。任意三角形模型使用显式盒状碰撞代理，支持查询以代理为准，不声称进行三角形精确物理模拟。花草、灯具、门、长椅等有底部支撑校验；建筑构件不要求每一格独立接地，以允许屋檐和桥梁结构。

门前装饰也属于存档：书店保留书架、遮阳棚、悬挂书牌，并补充小黑板与花箱；工坊包含工作台、工具架和堆叠木箱；小屋、车站和天文台配置门灯、花箱，车站增加挂钟，天文台增加铭牌。墙灯、工具架和铭牌通过挂点检查背后的实际墙体；花箱、黑板和木箱检查底部支撑。各装饰保留地点归属，点击可以进入对应博客栏目。

## 使用数据接口

```js
import { World, serializeWorld, parseWorld } from './src/world/data.js';

const world = new World();
world.setBlock([0, 0, 0], { model: 'cube', color: '#ad753d' });
world.setBlock([1, 0, 0], { model: 'cube', color: '#ad753d' });
world.placeInstance({
  id: 'front-door',
  anchor: [0, 1, 0],
  state: { model: 'door', color: '#ad753d', props: { width: 2, height: 5 } },
});

world.getOccupant([1, 4, 0]); // 同一扇门，而不是独立的门上半部分
world.removeAt([1, 4, 0]);   // 完整移除门和它的所有占用引用
const restored = parseWorld(serializeWorld(world));
```

`setBlock` 默认拒绝覆盖；离线作者工具可显式传入 `{ replace: true }`。实例占用不能被方块写入隐式覆盖。实例修改通过 `updateInstance(id, patch)` 完成，状态作为完整对象传入。底层 Map 是引擎内部存储，不应直接修改。

`querySupport({x,z,below})` 使用格子单位，返回最高且不超过 `below` 的实际表面高度。`dirtyChunks` 记录修改涉及的分块及其邻块。首版渲染器在加载时构建场景，尚未接入实时编辑和增量重建。

## 新增模型

简单模型可用 `registerBoxModel(id, boxes, options)`，每个盒子包含局部 `min`、`max` 和可选颜色；不是把模型限制成一个大立方体。

复杂模型可用 `registerMeshModel(id, {positions, collisionBoxes, support})`。`positions` 是非索引三角形顶点数组；模型外观支持任意三角形，空间占用保守涵盖视觉范围与碰撞代理。相同模型和状态使用 InstancedMesh；拾取命中真实三角形。任意模型默认不提供不可靠的遮挡剔除。

模型注册必须同时能被生成器和客户端导入，不能只在生成脚本中注册。模型定义变化时更新 `REGISTRY_VERSION` 并重新生成；网格算法变化时更新 `MESH_VERSION`。存档不携带脚本或任意远程资源路径。

## 存档约定

顶层保存格式版本、注册表版本、世界 ID、尺度、边界、种子、环境、地点、实体、状态调色板、分块和实例。调色板的 `0` 是空气，其他项包含 `model / color / props` 和可选博客地点归属。

分块内部索引为 `x + z*16 + y*256`，RLE 为交替的 `[数量, 调色板索引, ...]`，每块解码后必须恰好 4096 格。空块省略；重复分块、无效状态、实例重叠及未知版本拒绝加载。文件上限 32 MB，最多 4096 分块、200 万非空气方块和 2 万实例。

不保存访客视角、当前动画进度、派生占用索引或几何对象。当前格式版本为 1；不存在旧独立地图需要迁移，未来升级需增加显式迁移。

## 验证与视觉对照

开发地址的 `?worldDebug&view=front&trainTime=0&motion=reduce#home` 固定正面视图；`view` 还可取 `top / east / back / west`。开发诊断支持 `world=missing`、`earth=missing`、`renderer=off`，用于回退路径检查。

迁移前后五视角截图、移动端和交互验证结果在本地 `.shots/grid-before/` 与 `.shots/grid-after/`，它们不是生产资源。道路校验使用实际支撑面及 1.5 场景单位净空；铺装上的书架、立柱等会从可通行格中排除，然后验证剩余网络连通五个入口与码头。

仍使用原有 React / Three.js 技术栈。没有引入玩家物理、在线编辑器或云端存档；本次地图作为项目版本管理的静态资产发布。
