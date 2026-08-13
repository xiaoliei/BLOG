/* ============================================================
   BLOG_OS 站点与内容配置（正常博客首页）
   文章内容继承自旧世界地图数据，仅调整数据形态。
   ============================================================ */

export const SITE = {
  name: 'BLOG_OS',
  author: 'KAI',
  since: 2019,
  tagline: '用代码、文字与像素，记录这个世界的存档点。',
  description: '前端开发者 / 像素爱好者 / 游戏玩家。这里记录我如何用代码一砖一瓦搭出自己的世界。',
  email: 'hello@blog-os.dev',
  github: 'https://github.com/',
};

/* 栏目：title / 简介 / 主题色 / 图标 / 文章 */
export const MODULES = [
  {
    id: 'life',
    title: '生活杂记',
    accent: '#F1C40F',
    accentDark: '#B7950B',
    icon: 'home',
    blurb: '一切冒险的起点。柴火、钟声与琐碎日常的存档点。',
    posts: [
      {
        title: '在方块大陆里搭了个新书架',
        date: '2026-07-28',
        tags: ['日常', '家居'],
        readTime: 4,
        excerpt: '把旧书架拆了重搭，顺便给小镇西街修了一条排水渠。生活就是在 1×1 的方块里不断微调。',
      },
      {
        title: '雨季来了，记得给屋顶换瓦',
        date: '2026-07-12',
        tags: ['日常', '修理'],
        readTime: 3,
        excerpt: '连续三天下雨，镇北三栋房的瓦片渗水。总结了一份换瓦流程和防潮小贴士。',
      },
      {
        title: '邻居家的猫又偷了我的鱼',
        date: '2026-06-30',
        tags: ['日常', '宠物'],
        readTime: 2,
        excerpt: '今天在码头抓到一只灰色短毛猫，身上有红项圈。失主请来钟楼认领，附赠鲑鱼一条。',
      },
    ],
  },
  {
    id: 'reading',
    title: '读书笔记',
    accent: '#52BE80',
    accentDark: '#229954',
    icon: 'book',
    blurb: '藏在橡木林深处的书塔，收集读过的每一本书的批注。',
    posts: [
      {
        title: '《设计中的设计》读书摘记',
        date: '2026-07-20',
        tags: ['设计', '笔记'],
        readTime: 8,
        excerpt: '重新读了一遍原研哉，重点记下“白”与“留白”的关系，以及他关于信息建筑的三层理解。',
      },
      {
        title: '重读《游戏设计艺术》：透镜的用法',
        date: '2026-06-18',
        tags: ['游戏', '设计'],
        readTime: 10,
        excerpt: '一百个透镜太多，真正常用的是好奇、惊喜与悬念那几面。整理了一份自己的透镜清单。',
      },
      {
        title: '《禅与摩托车维修艺术》随想',
        date: '2026-05-09',
        tags: ['哲学', '随想'],
        readTime: 6,
        excerpt: '良质到底是什么？骑车修车和写代码一样，都是让自己进入“当下”的练习。',
      },
    ],
  },
  {
    id: 'projects',
    title: '项目作品',
    accent: '#7FB3D8',
    accentDark: '#5499C7',
    icon: 'code',
    blurb: '建在山顶的堡垒，陈列所有完成与未完成的项目。',
    posts: [
      {
        title: 'BLOG_OS v2：把博客做成了体素世界',
        date: '2026-07-25',
        tags: ['项目', 'React'],
        readTime: 12,
        excerpt: '从启动页到方块大陆，一次把个人站改造成游戏地图的完整记录：架构、配色与踩坑。',
      },
      {
        title: '用 200 行代码写了个体素地形生成器',
        date: '2026-06-22',
        tags: ['项目', 'Canvas'],
        readTime: 9,
        excerpt: '基于值噪声的 fBm 地形：海洋、山脉、沙漠与河流的生成思路，附关键代码片段。',
      },
      {
        title: '像素风图标库：从手绘到 SVG',
        date: '2026-05-15',
        tags: ['项目', '设计'],
        readTime: 7,
        excerpt: '用字符串网格定义 16×16 像素图标，再渲染成 SVG 的整套工作流。',
      },
    ],
  },
  {
    id: 'travel',
    title: '游记见闻',
    accent: '#4CAF50',
    accentDark: '#2E7D32',
    icon: 'map',
    blurb: '篝火、松涛与沿途风景。去过的每个地方都留下一段文字。',
    posts: [
      {
        title: '徒步记录：沿西河走到入海口',
        date: '2026-07-15',
        tags: ['游记', '徒步'],
        readTime: 11,
        excerpt: '三天两夜，从西河源头出发，穿过两片橡木林，最后在珊瑚灯塔看了场日落。',
      },
      {
        title: '沙漠边缘的旧日遗迹',
        date: '2026-06-08',
        tags: ['游记', '遗迹'],
        readTime: 9,
        excerpt: '风化的石柱上刻着看不懂的符号。拍了 47 张照片，回来拼了一个 3D 草模。',
      },
      {
        title: '矿洞里的萤石矿脉',
        date: '2026-04-19',
        tags: ['游记', '洞穴'],
        readTime: 6,
        excerpt: '深红矿洞第七层发现了一整条萤石脉，比火把亮多了。附一组矿灯光照对比。',
      },
    ],
  },
  {
    id: 'tech',
    title: '技术深潜',
    accent: '#E74C3C',
    accentDark: '#C0392B',
    icon: 'cpu',
    blurb: '越挖越深。前端、性能与底层原理的硬核笔记都堆在这里。',
    posts: [
      {
        title: 'React 渲染原理：从 render 到 commit',
        date: '2026-07-22',
        tags: ['React', '原理'],
        readTime: 15,
        excerpt: '把 Fiber 协调、优先级与并发特性讲成一条矿脉图，挖到哪一层心里就更有数。',
      },
      {
        title: 'Canvas 像素地图的优化笔记',
        date: '2026-06-27',
        tags: ['Canvas', '性能'],
        readTime: 10,
        excerpt: '6144 个瓷砖如何做到 16ms 内画完：离屏缓存、脏矩形与避免 shadowBlur 的教训。',
      },
      {
        title: 'CSS steps() 与像素级转场动画',
        date: '2026-05-30',
        tags: ['CSS', '动画'],
        readTime: 5,
        excerpt: '用 steps(6, end) 模拟逐帧方块动画，比逐帧 sprite 轻量得多。',
      },
      {
        title: 'WebGL 内存泄漏排查手记',
        date: '2026-04-11',
        tags: ['WebGL', '调试'],
        readTime: 8,
        excerpt: '纹理没释放、上下文没清理，一次真实的 Three.js 泄漏从 300MB 降到 80MB。',
      },
    ],
  },
  {
    id: 'about',
    title: '关于我',
    accent: '#1ABC9C',
    accentDark: '#148F77',
    icon: 'user',
    blurb: '大陆最东端的灯塔，也是我的自我介绍与联系方式。',
    posts: [
      {
        title: '你好，我是这座大陆的建造者',
        date: '2026-01-01',
        tags: ['关于'],
        readTime: 5,
        excerpt: '前端开发者 / 像素爱好者 / 游戏玩家。这里记录我如何用代码一砖一瓦搭出自己的世界。',
      },
      {
        title: '2026 上半年做了什么',
        date: '2026-07-01',
        tags: ['总结'],
        readTime: 6,
        excerpt: '半年复盘：三个项目、一次重构、若干次半途而废，以及下学期的路线图。',
      },
      {
        title: '联系我 / 合作通道',
        date: '2026-01-01',
        tags: ['联系'],
        readTime: 2,
        excerpt: '邮箱与社交账号均放在灯塔一楼信箱里，来信必复（最迟三天）。',
      },
    ],
  },
  {
    id: 'lab',
    title: '创意实验',
    accent: '#E67E22',
    accentDark: '#CA6F1E',
    icon: 'flask',
    blurb: '熔炉永远开着。奇奇怪怪的创意原型和玩具代码都在这里锻造。',
    posts: [
      {
        title: '把终端模拟器做成了小游戏',
        date: '2026-07-05',
        tags: ['实验', '终端'],
        readTime: 7,
        excerpt: '一个用方向键控制的 shell 迷宫，输入命令解谜。原型 300 行，很好玩。',
      },
      {
        title: 'CSS 像素风力发电站',
        date: '2026-06-02',
        tags: ['实验', 'CSS'],
        readTime: 4,
        excerpt: '纯 CSS 转动的风车叶片，用了 steps() 和 transform-origin 的小技巧。',
      },
      {
        title: '生成式像素角色：一晚上做了 64 个村民',
        date: '2026-04-28',
        tags: ['实验', '生成'],
        readTime: 6,
        excerpt: '用 16×16 模板 + 随机置换生成了一整套 NPC 头像，附生成代码。',
      },
    ],
  },
  {
    id: 'archive',
    title: '归档',
    accent: '#9B59B6',
    accentDark: '#7D3C98',
    icon: 'archive',
    blurb: '风沙掩埋的旧文章，像遗迹一样值得偶尔回来看看。',
    posts: [
      {
        title: '2025 年全部文章归档索引',
        date: '2025-12-31',
        tags: ['归档'],
        readTime: 3,
        excerpt: '按时间与主题整理成的一张表格，附每篇文章的一句话摘要。',
      },
      {
        title: '旧站迁移记录：从静态页到 React',
        date: '2025-10-20',
        tags: ['归档', '重构'],
        readTime: 9,
        excerpt: '第一版是纯静态 HTML + 本地 vendor，最后迁移到 Vite + React 的过程与取舍。',
      },
      {
        title: '2019 年的第一篇博客',
        date: '2019-03-17',
        tags: ['归档', '怀旧'],
        readTime: 2,
        excerpt: '当年还在用 CSS 画圣诞树，文章很幼稚，但那是所有故事的第一块砖。',
      },
    ],
  },
];

export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.id, m]));

/* 全部文章（带所属栏目），按日期倒序 */
export const ALL_POSTS = MODULES.flatMap((module) =>
  module.posts.map((post) => ({ ...post, moduleId: module.id, moduleTitle: module.title, moduleAccent: module.accent, moduleAccentDark: module.accentDark })),
).sort((a, b) => (a.date < b.date ? 1 : -1));

export const POST_COUNT = ALL_POSTS.length;
