# ADR-001：是否为学习站引入 React 与 Three.js

- 状态：已决策（NO-GO，含条件重议通道）
- 日期：2026-09-03
- 关联：docs/adr/benefit-scan.md（受益点盘点）、docs/perf/report.md（性能预算基线）
- 构建证据：/tmp/stack-test（esbuild 0.28.2，命令见附录 A），版本 three 0.185.1 / react 19.2.8 / react-dom 19.2.8 / preact 10.29.8 / ogl 1.0.11 / gsap 3.15.0

## 1. 背景

站点为备考学习机：纯静态、零运行时依赖、62 页共享引擎 app.js（gzip 15.6KB）。
访客为中国大陆中低端手机+不稳定网络，包体积一等成本。性能预算（Slow 4G）：
详情 LCP ≤1.5s、INP ≤100ms、CLS ≤0.05、app.js gzip ≤50KB、SW 安装 ≤300KB。
北极星：任何增强必须回答"提升哪条学习效果"。

## 2. 候选方案与实测数据

| 方案 | 产物 gzip（本机实测） | 首屏增量 | 构建链 | 与 app.js 共存 | 维护成本 |
|---|---|---|---|---|---|
| A vanilla（基线） | 15.6KB（现状） | 0 | 无 | — | 最低 |
| B vanilla + Three islands | Three 按需打包 **133.9KB**（islands 真实口径；全量导出 187KB） | 非试点页 0；试点页点击后 +134KB（Slow4G ≈+0.95s） | 一次性 esbuild | 动态 import 隔离，互不感知 | 中（版本升级 3D API 变动） |
| C React islands + Three | 702KB min / **193.6KB** | 同上 +React 运行时 | Vite/esbuild MPA | 需挂载点与状态桥接 | 高（两套范式） |
| D1 Preact | 5.5KB | 0 | 一次性 esbuild | 需桥接 | 中 |
| D2 vanilla + OGL | **14.5KB**（≈ app.js 全量） | 非试点页 0；试点页 +14.5KB（≈+0.2s） | 一次性 esbuild | 同 B | 中低（API 面小） |
| E vanilla + GSAP | 28.4KB | 试点页 | 一次性 esbuild | 全局可复用 | 中低 |

许可证核查：Three.js MIT、React MIT、Preact MIT、OGL MIT、GSAP 标准许可（插件分商业许可，核心免费）——均无合规障碍。
WebGL 兼容：POC 机 WebGL2/WebGL1 均可用；低端旧机 WebGL 不可用时需整段降级到 2D（等价于再做一遍 2D 版）。

## 3. POC 试点（05 存储层次：3D 金字塔 vs 现有 2D）

实现：同页并排 A（2D SVG 精简复刻）/ B（Three.js，动态 import）/ C（OGL，动态 import），
统一四控（播放/暂停/单步/变速）+ 3D 拖拽旋转 + 各舞台 rAF 帧率计。
测量（CPU 4x 节流模拟低端机）：

| 项 | 2D 基线 | Three.js | OGL |
|---|---|---|---|
| 包增量 | 0 | 187KB gz（库模式保守口径）/ 134KB（构建期摇树口径） | 39KB gz（库模式）/ 14.5KB（摇树） |
| 加载+解析（缓存热） | — | 86ms | 22ms |
| 三舞台并发稳态帧率 | 121fps | 121fps（合并采样） | 同左 |
| 学习信息承载 | 层名标签 + 逐帧解说 + 量化结论 | 仅几何堆叠，**无层名/无解说**（补齐需 sprite 文字，旋转场景可读性差） | 同 B |
| 表现力 | 教材标准表达 | 立体感强，可拖旋转 | 同 B |

**学习价值裁决（一票否决条款）**：3D 版多出来的只有"可旋转的立体感"；
存储层次的考点（命中率、层次关系、访问路径）全部已被 2D 动画承载，且 2D 版文字信息更完整。
找不到任何"3D 比现有 2D 多教会了什么"的证据 → 触发 NO-GO。
其余强 3D 候选（流水线/分层/风格谱系）在盘点阶段即被评 为低价值（教材与真题的表达形态均为 2D）。
React 受益点盘点为 **0 个**（无复杂状态、无高频重渲染），连带方案 C 直接出局。

## 4. 决策

**NO-GO：不引入 React 与 Three.js。** OGL/GSAP 保留为"条件重议"备选（见 6）。

理由一句话：React 没有受益点（0 个），Three.js 有受益点但 POC 证明其增益是"观感"而非"学习效果"，
且 134~187KB gz 的包成本违反包体积一等成本原则。

## 5. 后果与预算重签表

**不重签任何预算**（NO-GO 的直接后果）。若未来触发条件重议（见 6），预先约定重签上限：

| 预算 | 现值 | 重议允许上限 | 必须换来的量化收益 |
|---|---|---|---|
| app.js gzip ≤50KB | 15.6KB | 不变（3D 走 islands 不计入） | — |
| 试点页新增 islands 包 | 0 | ≤30KB gz（仅 OGL 级） | 对照实验证明学习增益（前测/后测正确率或回忆率提升） |
| 试点页 LCP | ≤1.5s | 不变（islands 点击后加载） | — |
| SW 安装量 | ≤300KB（现 45KB） | 不变（3D chunk 进运行时缓存，禁止 precache） | — |
| 低端机帧率 | — | ≥30fps | 可交互旋转+单步演示 |

## 6. 条件重议通道（什么情况重新开题）

1. 出现**空间本征结构**的新知识点页（如三维坐标系、真实 3D 拓扑），且 vanilla/2D 表达被学员测试证明不足；
2. sherpa-onnx/浏览器端出现 <30KB gz 的合格 3D 或空间可视化方案；
3. 出现需要组件化的批量重复 UI（当前 0 个）——届时优先 Preact（5.5KB）而非 React。

## 7. 渐进迁移路线（仅当未来 GO 时生效；本次不执行）

试点单页 islands（动态 import + 预留占位防 CLS）→ 对照实验≥2 周 → 达标才复制到下一页；
回滚 = 移除挂载点脚本一行 + SW 版本号递增，非试点页永不改动。

## 8. SW 缓存约定（本次已确认无需变更）

现网 v7 已满足：HTML network-first、音频/页面运行时缓存、外壳 precache 45KB。
未来任何 islands chunk 一律运行时缓存（fetch ③ 分支已覆盖 assets/），安装量不破 300KB。

## 附录 A：构建与测量命令

```bash
cd /tmp/stack-test
npm install --registry=https://registry.npmmirror.com three react react-dom preact ogl gsap esbuild
./node_modules/.bin/esbuild entry-three.js --bundle --minify --format=iife --outfile=dist/three.js   # 515KB / gzip 133.9KB
./node_modules/.bin/esbuild entry-react-three.js --bundle --minify --format=iife --outfile=dist/react-three.js  # 702KB / 193.6KB
./node_modules/.bin/esbuild entry-preact.js  --bundle --minify --format=iife --outfile=dist/preact.js  # 12.9KB / 5.5KB
./node_modules/.bin/esbuild entry-ogl.js     --bundle --minify --format=iife --outfile=dist/ogl.js     # 48KB / 14.5KB
./node_modules/.bin/esbuild entry-gsap.js    --bundle --minify --format=iife --outfile=dist/gsap.js    # 70KB / 28.4KB
gzip -c dist/<file> | wc -c
```

## 附录 B：POC 复现

POC 页源码：docs/adr/poc/poc.html（需先按附录 A 构建 dist/three-esm.js、dist/ogl-esm.js 置于同目录 dist/ 下，
`python3 -m http.server` 打开；动态 import 口径为全量库导出 187KB/39KB gz，比真实 islands 摇树口径更保守）。
