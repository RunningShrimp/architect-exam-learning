# 性能优化前后对比报告（2026-09-02）

协议：本地 http.server:8111 · DevTools 移动仿真 390×844 · Slow 4G 实时节流 · 每页 3 次取中位 ·
LCP/CLS/长任务经 initScript 注入 PerformanceObserver 采集 · 冷缓存用 ignoreCache+query-bust+fetch 延迟法确定性复现。
原始数据：baseline.md / geometry-before.json / geometry-after.json。

## 1. 预算达标总表

| 指标 | 预算 | 基线 | 优化后 | 结论 |
|---|---|---|---|---|
| SW 首访安装下载 | ≤300KB | **0.91MB gzip（70 条）❌** | **45KB gzip（9 条外壳）** | ✅ -95% |
| 详情页 LCP | ≤1.5s | 368ms（812 冷） | 248ms（全冷实测） | ✅ |
| 首页 LCP | ≤2.0s | 672ms | 256ms | ✅ |
| CLS | ≤0.05 | index **0.5545**、kp **0.1402**（冷）❌ | **0 / 0**（同法复现） | ✅ |
| INP 侧（做题点击） | ≤100ms | 1.1ms 同步 / 0 长任务 | 1.1ms / 0 | ✅ 未改动 |
| INP 侧（图谱边开关重绘） | ≤100ms | 1.7ms | 1.7ms | ✅ 未改动 |
| 长任务 >50ms 每页 | ≤2 | 0~1 | 0~1 | ✅ |
| app.js gzip | ≤50KB | 15.6KB | 15.6KB | ✅ 不 minify |
| style.css gzip | ≤30KB | 4.7KB | 4.9KB（+预留高度规则） | ✅ |
| 单页 HTML gzip | ≤25KB | 13.2KB | 13.3KB（+内嵌朗读脚本） | ✅ 不压缩 |
| index 首屏 DOM | ≤1500 | 481 | 493 | ✅ 不懒渲染 |
| graph 掉帧告警 | 0 | 0 | 0 | ✅ |
| Lighthouse A11y | — | 96（link-in-text-block ❌） | **100** | ✅ |

## 2. 实施清单（证据 → 改动 → 复测）

### A. SW 首访安装量（P0）
- 证据：CORE 70 条（含全部 62 个 kp HTML）合计 2.58MB / 0.91MB gzip，超预算 3 倍。
- 改动：sw v6/v7 —— 安装期仅预缓存 9 条外壳；kp HTML 改 **network-first + 运行时缓存**（刷新即最新）；音频独立 Cache 按需缓存 + **FIFO 30MB 上限**；页面缓存键去 query 防膨胀。
- 复测：外壳 9 条 128KB / **45KB gzip** ✅；三缓存（shell/pages/audio）结构验证 ✅。

### B. 冷缓存 CLS（P1）
- 证据：Slow4G 首访 index CLS 0.4256 / kp 0.1402；layout-shift sources 定位 = `#domain-sections` 注入推移静态内容；注入前后 section 高度对拍差 +394/+182/+1143px；另发现 CSS HTTP 缓存曾致预留规则未生效（改用 ignoreCache 复测）。
- 改动：地图容器 `aspect-ratio:800/420`；朗读条/仪表盘/雷达/域列表按实测高度 `min-height` 预留；静态「怎么用」区前移；域列表改 `<details>` 默认折叠（展开属用户交互豁免，页面总高 -35%）。
- 复测：index 最坏情形 CLS **0.5545→0**；kp/01 全冷 **0.1402→0**（LCP 248ms）。

### C. 无障碍顺带修复（P2）
- 证据：基线 LH 唯一失败审计 `link-in-text-block`（score 0）。
- 改动：正文语境链接加下划线（导航/胶囊/按钮不受影响）。
- 复测：A11y 96→**100**。

## 3. 回归验证结果

- 功能：判题/逐选项解析 ✅；答满 5 题 → SM-2 写入（ef 1.96 / int 1 / 结果框）✅；错题本 +7 记录 ✅；复习中心混合卷/错题本渲染 ✅；TTS 三层回退状态「🎧 预生成音频 · Xiaoxiao」✅；音频 HEAD 200 ✅；上下页导航 ✅；图谱边开关 1.7ms ✅。
- SW 双场景：v6→v7 老访客一次刷新完成接管且旧缓存自动清理 ✅；**离线打开已访问页** ✅（断网下 kp/02 自缓存 200 返回；kp/01 断网整页渲染，5 张测验卡齐全）。
- 视觉：4 页几何快照逐项比对——kp/01、graph 逐像素一致；review 仅错题数据高度差；index 为有意布局优化（见 geometry-after 注记），无横向溢出。

## 4. 未达标项

无。

## 5. 记录不做（或不划算）的优化

- **app.js minify/拆分**：gzip 15.6KB，为预算 31%；拆 TTS/SM-2 模块需动态 import 引入瀑布，收益为负。
- **HTML minify + src/ 目录**：gzip 13.3KB 达标，维护双份源码不值。
- **index 懒渲染**：DOM 481 远低预算；折叠已解决 CLS 与信息密度。
- **graph 换 Canvas**：交互重绘 1.7ms，SVG 绰绰有余。
- **localStorage 读写合并**：做题路径实测 1.1ms 无长任务，无证据支持优化。
- 已知取舍：kp 页 network-first 意味着**首次访问后的离线可用**依赖第二次访问的运行时缓存（此前 precache 全站则是 2.4MB 首访代价）；音频 LRU 为 FIFO 近似（30MB 内最旧先出）。
