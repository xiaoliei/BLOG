# 卡通像素港镇 · 开发多视图

用户已确认 harbor-panorama-v2-cartoon.png 的明亮卡通像素风格。该方向取代此前写实黄昏方案。

## 图片与用途

- harbor-panorama-v2-cartoon.png：已确认的主视觉，建筑身份、材质和色彩基准。
- harbor-top-layout-v1.png：高位俯视布局参考，图上方为北；不是严格垂直正投影。
- harbor-four-views-v1.png：南、东、北、西四方向场景概念参考。

## 固定空间关系

01 书店位于西南，绿屋顶，樱花树在西侧。
02 工坊位于东南，橙屋顶，正面齿轮。
03 小屋位于中央，红屋顶，晾衣架在东侧。
04 车站位于西北，蓝屋顶，铁路沿东西方向贯穿北部。
05 天文台位于东北最高台地，蓝色阶梯穹顶。
06 码头位于南侧中央，船位于码头东南水面。

南侧是主页主要观赏方向。石板主路连接书店、小屋和工坊，支路通车站，东北台阶通天文台。

## 使用边界

内置 image_gen 生成。这些图用于美术和布局比对，不是同一个三维模型渲染的工程图；四视图中的门窗朝向、列车节数、铁路和局部地形存在生成差异。建模时以本文固定空间关系和主视觉建筑身份为准，统一门窗、铁路及地形后，从真实模型导出准确四视图；不要逐张照搬差异。未定义精确尺寸。

## 完整生成提示词：俯视布局

Use case: stylized-concept. Reference image is the APPROVED art and architectural identity of a cartoon voxel harbor blog world. Make development reference art, preserve its coarse block sizes, nearest-neighbor pixel textures, bright sunny cyan/green palette, simple game shadows, block clouds, absolutely no photorealism or cinematic lighting. Fixed world arrangement viewed from SOUTH looking NORTH in the source: green-roof two-story cream timber BOOKSTORE southwest; pink cherry tree west of bookstore; red-roof white COTTAGE center; orange-roof brick WORKSHOP with gray gear southeast/east; blue-roof railway STATION northwest with yellow train on east-west tracks; stepped blue-dome white OBSERVATORY northeast on highest hill. Wooden DOCK south-center projects into blue water, small sailboat southeast of dock. Main cobblestone path links bookstore, cottage and workshop, stairs climb northeast to observatory, branch northwest to station. Keep EXACTLY these five buildings, their identities and neighborhood relationship. North is rear of original view. Infer unseen backs simply from existing architecture, no new landmarks. Produce one large square top-down ORTHOGRAPHIC master layout image viewed vertically from above, north UP. Entire irregular grass peninsula coastline visible with blue water margin, all five building roofs recognizable; no sky, clouds or perspective horizon. Clear continuous paths, visible stairs, rail alignment, terraces and dock. Put a small compass N arrow at upper right, and small discrete numbered white markers at buildings: 01 bookstore, 02 workshop, 03 cottage, 04 station, 05 observatory, 06 dock. No other text, no UI, no legend. This is a colorful polished voxel game level map, not a flat vector diagram. Preserve roof shapes and colors, place telescope on observatory roof. Enough spacing to read the topology clearly.

## 完整生成提示词：四方向

Use case: stylized-concept. Reference image is the APPROVED art and architectural identity of a cartoon voxel harbor blog world. Make development reference art, preserve its coarse block sizes, nearest-neighbor pixel textures, bright sunny cyan/green palette, simple game shadows, block clouds, absolutely no photorealism or cinematic lighting. Fixed world arrangement viewed from SOUTH looking NORTH in the source: green-roof two-story cream timber BOOKSTORE southwest; pink cherry tree west of bookstore; red-roof white COTTAGE center; orange-roof brick WORKSHOP with gray gear southeast/east; blue-roof railway STATION northwest with yellow train on east-west tracks; stepped blue-dome white OBSERVATORY northeast on highest hill. Wooden DOCK south-center projects into blue water, small sailboat southeast of dock. Main cobblestone path links bookstore, cottage and workshop, stairs climb northeast to observatory, branch northwest to station. Keep EXACTLY these five buildings, their identities and neighborhood relationship. North is rear of original view. Infer unseen backs simply from existing architecture, no new landmarks. Image 1 is approved architectural style. Image 2 is the master plan and authoritative building placement. Create a wide high-resolution 2x2 FOUR VIEW development turnaround sheet, four equally sized panels separated by white gutters, each showing the SAME ENTIRE island at the SAME SCALE from a genuinely DIFFERENT cardinal direction, elevated orthographic camera at 30 degrees downward, all terrain and roofs inside each panel. Minimal pale blue sea background, no distant scenery, no clouds obscuring geometry. Small panel labels exactly: "SOUTH / FRONT", "EAST / RIGHT", "NORTH / BACK", "WEST / LEFT". Top left south camera looking north: bookstore left foreground, workshop right, station left rear, observatory right rear. Top right east camera looking west: workshop near left foreground, observatory near right, bookstore far left and station far right. Bottom left north camera looking south: observatory left foreground and station right foreground, bookstore rear right, workshop rear left; SHOW ACTUAL PLAIN REAR WALLS not mirrored fronts. Bottom right west camera looking east: station near left and bookstore near right, observatory far left and workshop far right. All building main doors face south, so doors and awning are visible from south but not north. The pink cherry tree remains west of bookstore in all views, dock remains south center. Enforce the same terrain footprint and height terraces across views. No rearranging buildings to improve composition. Represent unseen backs with simple timber/cream or brick walls and small square windows. Retain exactly the same green, red, orange, blue roofs and blue observatory dome. Bright coarse cartoon voxel rendering with chunky blocks and pixel textures, clean directional lighting, vivid lime grass, cyan water, no realism. These are modeling reference views, not four artistic variations.
