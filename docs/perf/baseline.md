# 性能基线（优化前 · 2026-09-02）

测量协议：本地 `python3 -m http.server:8111`；DevTools 移动仿真 390×844（DPR2, touch）；
网络 DevTools "Slow 4G" 实时节流；每页 3 次导航取中位；采集器经 initScript 注入
（PerformanceObserver: LCP buffered / layout-shift / longtask）。

## 4 页指标（预算：详情 LCP≤1.5s 首页≤2.0s / CLS≤0.05 / 长任务≤2）

| 页 | LCP 中位（3 次） | CLS 冷缓存 | CLS 暖缓存 | 加载长任务 | TBT | DOM 节点 |
|---|---|---|---|---|---|---|
| index | 672ms（232/728/672）✅ | **0.4256 ❌** | 0 / 0 ✅ | 0 | 0 | 481 ✅ |
| kp/01 | 368ms（812/172/368）✅ | **0.1402 ❌** | 0.0004 / 0.0004 ✅ | ≤1 | ≤20ms | 574 ✅ |
| graph | 264ms（176/452/264）✅ | 0.0267 ✅ | 同左 | ≤1 | ≤17ms | 540 ✅ |
| review | 124~156ms ✅ | ~0 ✅ | 0 / 0.0027 ✅ | 0 | 0 | 72 ✅ |

Lighthouse（MCP 精简版，index 移动端）：A11y 96 / BestPractices 100 / SEO 100；
唯一失败审计 `link-in-text-block`（正文链接仅靠颜色区分）。

## 资源体积（gzip）

| 资源 | 原始 | gzip | 预算 | 结论 |
|---|---|---|---|---|
| assets/app.js | 45.9KB | **15.6KB** | ≤50KB | ✅ 不做 minify/拆分 |
| assets/style.css | 17.2KB | **4.7KB** | ≤30KB | ✅ |
| kp/01 HTML | 36.1KB | **13.2KB** | ≤25KB | ✅ 不做 HTML 压缩 |
| index/review/graph HTML | — | 4.2/5.6/3.1KB | — | ✅ |

## SW 安装下载量

- CORE 预缓存 70 条（含全部 62 个 kp HTML）：原始 **2.58MB**，gzip 估算 **0.91MB**
- 预算 ≤300KB → **超标 ~3 倍 ❌**

## 交互（INP 侧）

| 交互 | 同步耗时 | 新增长任务 | 结论 |
|---|---|---|---|
| kp/01 做题点击（判题+错题本写入） | **1.1ms** | 0 | ✅ |
| graph 边类型开关（全量重绘） | **1.7ms** | 0 | ✅ |
| review 出 10 题混合卷 | 异步渲染 | 0 | ✅ |

## 几何快照（移动视口，回归对比用）

见 geometry-before.json（4 页关键容器 boundingRect + body 尺寸 + 节点数）。
