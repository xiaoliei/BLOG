/* BLOG_OS article registry */

export const ARTICLES = [
  {
    id: 'CU_04',
    index: '04',
    series: 'MATERIALS',
    title: 'Oxidized Copper Block',
    author: 'KAI',
    date: '2026-06-14',
    ref: 'DOC_001',
    model: 'assets/models/cu_block.glb',
    accent: '#4DA29B',
    tags: ['MATERIALS', 'OXIDATION', 'COPPER'],
    summary: '铜块的四阶段氧化路径与 patina 着色器实现。',
    props: [
      { label: 'HARDNESS 硬度', value: 3.0, max: 10, cls: 'accent' },
      { label: 'BLAST_RES 抗爆性', value: 6.0, max: 15, cls: 'warn' },
      { label: 'LUMINANCE 亮度', value: 0.0, max: 1, cls: 'cyan' },
      { label: 'OXIDATION 氧化状态', value: 0.62, max: 1, cls: 'cyan' },
      { label: 'CONDUCTIVITY 导电率', value: 0.73, max: 1, cls: 'accent' },
    ],
    sections: [
      {
        h: '01 · 标本概述',
        p: [
          'CU_04 是洞穴与山崖更新（1.17）以来被记录最多的金属标本之一。铜块在大气中会经历四个阶段：<b>原版铜</b> → <b>暴露</b> → <b>风化</b> → <b>氧化</b>。本文档对应氧化阶段中后期样本，表面覆盖层状青绿锈蚀（patina），在随机刻 4096 次后完全稳定。',
          '与多数金属不同，铜的氧化层并不会削弱结构，反而形成致密保护膜。体素模拟中我们将其建模为 <span class="inline-code">CuO₂ + Cu₂(OH)₂CO₃</span> 的混合层，厚度按噪声场生长。',
        ],
      },
      {
        h: '02 · 体素结构与渲染',
        p: [
          '展示模型为 3×3×3 微体素结构，每个微体素携带独立的颜色与法线，总三角面 324。氧化层覆盖概率由三维值噪声驱动：顶面优先腐蚀，侧面次之，底面保持铜色。',
          '线框包裹层由 <span class="inline-code">EdgesGeometry</span> 生成，橙色描边用于标注当前可交互标本的包围盒，辅助右侧属性面板的数值对应。',
        ],
      },
    ],
    code: {
      file: 'cu_patina.glsl',
      lang: 'GLSL',
      src: `// cu_patina.glsl — 体素铜块氧化着色器
#version 330 core
in vec3 vNormal;
in vec3 vPos;
uniform float uTime;
uniform float uOxidation;   // 0.0 .. 1.0

// 三维值噪声：驱动锈蚀与 patina 分布
float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z);
}

vec3 patina(vec3 copper, vec3 normal) {
    float n = vnoise(vPos * 1.8 + uTime * 0.02);
    float top = max(normal.y, 0.0);
    float mask = clamp(uOxidation * (0.35 + 0.65 * top) + n * 0.25, 0.0, 1.0);
    vec3 rust = vec3(0.706, 0.384, 0.165);
    vec3 teal = vec3(0.302, 0.635, 0.608);
    vec3 patinaMix = mix(rust, teal, n);
    return mix(copper, patinaMix, mask);
}

void main() {
    vec3 base = vec3(0.784, 0.459, 0.200);
    vec3 col = patina(base, normalize(vNormal));
    float diff = max(dot(normalize(vNormal), normalize(vec3(0.5, 0.8, 0.4))), 0.0);
    fragColor = vec4(col * (0.55 + 0.45 * diff), 1.0);
}`,
    },
  },
  {
    id: 'IR_07',
    index: '07',
    series: 'TECHNICAL',
    title: 'Reinforced Iron Frame',
    author: 'KAI',
    date: '2026-06-28',
    ref: 'DOC_002',
    model: 'assets/models/iron_block.glb',
    accent: '#CFCFCF',
    tags: ['TECHNICAL', 'PHYSICS', 'FRAME'],
    summary: '承重结构在红石脉冲下的应力模拟与 tick 优化。',
    props: [
      { label: 'HARDNESS 硬度', value: 5.0, max: 10, cls: 'accent' },
      { label: 'BLAST_RES 抗爆性', value: 8.0, max: 15, cls: 'warn' },
      { label: 'LUMINANCE 亮度', value: 0.0, max: 1, cls: 'cyan' },
      { label: 'OXIDATION 氧化状态', value: 0.12, max: 1, cls: 'cyan' },
      { label: 'CONDUCTIVITY 导电率', value: 0.95, max: 1, cls: 'accent' },
    ],
    sections: [
      {
        h: '01 · 结构概述',
        p: [
          'IR_07 是活塞门与重型闸机的标准承力件。其体素框架由 11×11 深板岩基座与多层铁框架组成，每 tick 承受最高 4 组红石信号的交替应力。',
          '仿真中我们把每个体素抽象为刚体节点，用邻接表缓存相邻块；实测帧耗从 2.1ms 降至 0.4ms，瓶颈集中在邻接重建而非应力求解。',
        ],
      },
      {
        h: '02 · 代码摘要',
        p: [
          '以下片段是红石脉冲驱动下的应力传播核心。关键在于 <b>双缓冲状态</b>：当前 tick 只读取 <span class="inline-code">prev</span>，避免同帧级联污染。',
        ],
      },
    ],
    code: {
      file: 'frame_tick.cpp',
      lang: 'C++',
      src: `// frame_tick.cpp — 承重框架红石 tick 仿真
#include <array>
#include <vector>

struct Voxel {
    uint8_t  material;      // 0=deepslate, 1=iron, 2=redstone
    float    stress;
    float    prev;
};

static const std::array<int, 6> DX { 1, -1, 0, 0, 0, 0 };
static const std::array<int, 6> DY { 0, 0, 1, -1, 0, 0 };
static const std::array<int, 6> DZ { 0, 0, 0, 0, 1, -1 };

void tick(std::vector<Voxel>& world, int sx, int sy, int sz) {
    const float kDamp = 0.82f;
    #pragma omp parallel for
    for (int i = 0; i < static_cast<int>(world.size()); ++i) {
        Voxel& v = world[i];
        if (v.material == 0) {          // deepslate: rigid
            v.prev = v.stress;
            continue;
        }
        int x = i % sx;
        int y = (i / sx) % sy;
        int z = i / (sx * sy);
        float acc = 0.0f;
        for (int d = 0; d < 6; ++d) {
            int nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
            if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
            acc += world[nz * sx * sy + ny * sx + nx].prev;
        }
        v.stress = v.prev * kDamp + acc * 0.12f;
    }
    for (Voxel& v : world) v.prev = v.stress;
}`,
    },
  },
  {
    id: 'DS_02',
    index: '02',
    series: 'ARCHITECTURE',
    title: 'Deepslate Vault Cell',
    author: 'KAI',
    date: '2026-07-05',
    ref: 'DOC_003',
    model: 'assets/models/deepslate_block.glb',
    accent: '#3A3A3E',
    tags: ['ARCHITECTURE', 'VAULT', 'DEEPSLATE'],
    summary: '深板岩保险库单元的区块校验与抗爆隔离设计。',
    props: [
      { label: 'HARDNESS 硬度', value: 3.5, max: 10, cls: 'accent' },
      { label: 'BLAST_RES 抗爆性', value: 9.0, max: 15, cls: 'warn' },
      { label: 'LUMINANCE 亮度', value: 0.0, max: 1, cls: 'cyan' },
      { label: 'INTEGRITY 结构完整度', value: 0.88, max: 1, cls: 'cyan' },
      { label: 'SEAL_RATE 密封系数', value: 0.97, max: 1, cls: 'accent' },
    ],
    sections: [
      {
        h: '01 · 保险库概述',
        p: [
          'DS_02 位于 Y=8 以下的深板岩层，作为实验体素群的物理隔离舱。墙体采用 3 层深板岩夹 1 层空气缓冲，抗爆评级 9.0，可在 TNT 连环爆炸下保持内部实体零损伤。',
          '区块验证采用 Merkle 式体素哈希：每次写入都会重算 16³ 子区块的根哈希，与档案系统同步。',
        ],
      },
      {
        h: '02 · 校验流程',
        p: [
          '校验器在后台线程每 100 tick 运行一次；若哈希失配，触发 <span class="inline-code">VAULT_LOCK</span> 状态并回滚到最近快照。',
        ],
      },
    ],
    code: {
      file: 'vault_verify.cpp',
      lang: 'C++',
      src: `// vault_verify.cpp — 体素区块哈希校验
#include <cstdint>
#include <array>

struct ChunkKey {
    int32_t cx, cz;
    uint64_t revision;
};

static uint64_t hash_voxel(uint16_t id, uint8_t light, uint16_t meta) {
    uint64_t h = 1469598103934665603ULL;   // FNV-1a
    auto mix = [&](uint64_t v) {
        h ^= v;
        h *= 1099511628211ULL;
    };
    mix(id);
    mix(light);
    mix(meta);
    mix(static_cast<uint64_t>(id) << 17);
    return h;
}

uint64_t chunk_root_hash(const std::array<uint16_t, 4096>& voxels) {
    uint64_t root = 0x9E3779B97F4A7C15ULL;
    for (size_t i = 0; i < voxels.size(); ++i) {
        if (voxels[i] != 0) {
            root ^= hash_voxel(voxels[i], (i % 16), (i / 16) % 16);
            root = (root << 31) | (root >> 33);   // 循环左移 31
        }
    }
    return root;
}`,
    },
  },
  {
    id: 'NQ_00',
    index: '00',
    series: 'MATERIALS',
    title: 'Netherite Alloy Matrix',
    author: 'KAI',
    date: '2026-07-18',
    ref: 'DOC_004',
    model: 'assets/models/netherite_block.glb',
    accent: '#46343C',
    tags: ['MATERIALS', 'NETHERITE', 'ALLOY'],
    summary: '下界合金矩阵的伪随机纹理生成与抗爆上限。',
    props: [
      { label: 'HARDNESS 硬度', value: 8.0, max: 10, cls: 'accent' },
      { label: 'BLAST_RES 抗爆性', value: 12.0, max: 15, cls: 'warn' },
      { label: 'LUMINANCE 亮度', value: 0.15, max: 1, cls: 'cyan' },
      { label: 'OXIDATION 氧化状态', value: 0.0, max: 1, cls: 'cyan' },
      { label: 'CONDUCTIVITY 导电率', value: 0.41, max: 1, cls: 'accent' },
    ],
    sections: [
      {
        h: '01 · 合金矩阵',
        p: [
          'NQ_00 由 4 个下界残骸碎片与 4 个金锭烧炼而成，晶体结构呈各向异性：沿 X 轴抗剪强度最高，沿 Y 轴略低。体素模型中用橙黑双色噪声表征合金纹理。',
          '它是目前档案库中抗爆性最高的非管理方块，实测可承受凋灵之首 3 次直接命中。',
        ],
      },
      {
        h: '02 · 纹理噪声',
        p: [
          '合金纹理不需要贴图，改用片段着色器中的分形噪声实时生成，模型面数保持极低。',
        ],
      },
    ],
    code: {
      file: 'netherite_noise.glsl',
      lang: 'GLSL',
      src: `// netherite_noise.glsl — 下界合金矩阵纹理
#version 330 core
in vec3 vPos;
uniform float uSeed;

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; ++i) {
        v += a * hash21(p + uSeed * 0.13);
        p = p * 2.03 + vec2(13.7, 7.1);
        a *= 0.5;
    }
    return v;
}

vec3 alloy(vec2 uv) {
    float n = fbm(uv * 7.0);
    vec3 black = vec3(0.18, 0.12, 0.16);
    vec3 ember = vec3(0.72, 0.28, 0.14);
    vec3 core  = vec3(0.28, 0.20, 0.23);
    vec3 col = mix(black, ember, smoothstep(0.62, 0.82, n));
    col = mix(col, core, 0.25);
    return col;
}

void main() {
    vec2 uv = vPos.xy * 3.0;
    vec3 col = alloy(uv);
    float sheen = pow(max(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
    fragColor = vec4(col + sheen * vec3(0.35, 0.12, 0.06), 1.0);
}`,
    },
  },
  {
    id: 'QZ_11',
    index: '11',
    series: 'TECHNICAL',
    title: 'Quartz Resonator Array',
    author: 'KAI',
    date: '2026-08-01',
    ref: 'DOC_005',
    model: 'assets/models/quartz_block.glb',
    accent: '#EAE3D2',
    tags: ['TECHNICAL', 'SIGNAL', 'QUARTZ'],
    summary: '石英谐振阵列的频段扫描与信号解码流水线。',
    props: [
      { label: 'HARDNESS 硬度', value: 1.8, max: 10, cls: 'accent' },
      { label: 'BLAST_RES 抗爆性', value: 3.0, max: 15, cls: 'warn' },
      { label: 'LUMINANCE 亮度', value: 0.55, max: 1, cls: 'cyan' },
      { label: 'RESONANCE 谐振系数', value: 0.97, max: 1, cls: 'cyan' },
      { label: 'FIDELITY 保真度', value: 0.92, max: 1, cls: 'accent' },
    ],
    sections: [
      {
        h: '01 · 阵列概述',
        p: [
          'QZ_11 由 8 个石英谐振体构成环形阵列，用于解析主控台下方数据流中的周期性信号。亮度 0.55 说明其晶体在充能状态下会自发辐射。',
          '阵列以 20Hz 采样，64 位 FFT 后取峰值频段，交由解码器映射为存档系统的指令流。',
        ],
      },
      {
        h: '02 · 解码流水线',
        p: [
          '以下代码演示从 IQ 采样到指令帧的完整流水线：前置滤波、频峰检测、符号映射。',
        ],
      },
    ],
    code: {
      file: 'resonator_decode.cpp',
      lang: 'C++',
      src: `// resonator_decode.cpp — 石英谐振信号解码
#include <complex>
#include <vector>

struct IQSample {
    float i, q;
};

std::vector<uint8_t> decode_frame(const std::vector<IQSample>& iq, float carrier) {
    std::vector<uint8_t> bits;
    bits.reserve(iq.size());

    for (const auto& s : iq) {
        // 混频下变频到基带
        std::complex<float> z(s.i, s.q);
        std::complex<float> lo(std::cos(carrier), -std::sin(carrier));
        std::complex<float> base = z * lo;

        // 低通：一阶 IIR
        static std::complex<float> lp(0.0f, 0.0f);
        lp = lp * 0.86f + base * 0.14f;

        // 符号判决
        bits.push_back(lp.real() > 0.0f ? 1 : 0);
    }
    return bits;
}`,
    },
  },
];

export function getArticle(id) {
  return ARTICLES.find((a) => a.id === id) || ARTICLES[0];
}

export function prevArticle(id) {
  const i = ARTICLES.findIndex((a) => a.id === id);
  return ARTICLES[(i - 1 + ARTICLES.length) % ARTICLES.length];
}

export function nextArticle(id) {
  const i = ARTICLES.findIndex((a) => a.id === id);
  return ARTICLES[(i + 1) % ARTICLES.length];
}
