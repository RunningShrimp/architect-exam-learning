# poc/ —— 框架与 3D 引入评估 POC（隔离实验区）

> ADR-001 评估载体，**拍板前不合并进学习路径、不部署**；可随时整体删除本目录。

打开方式：

```bash
python3 -m http.server 8000
# http://localhost:8000/poc/index.html     目录（入口零 vendor 加载）
# http://localhost:8000/poc/city3d.html    POC-1 3D 城市知识地图
# http://localhost:8000/poc/cache3d.html   POC-2 缓存命中率仓库动画
```

- 强制渲染层：页面 URL 加 `?renderer=webgpu|webgl|canvas2d|svg`
- vendor：three r185 自托管（MIT）已提升至根目录 `vendor/`；import maps 免构建；引擎正式版在 `assets/scene-engine.js`
- 场景 = JSON 配置（config-*.json）+ 共享引擎（engine.js）——AI 维护改配置不改代码
- 实验页：experiment-regen.html / experiment-regen2d.html（5B 再生成实验载体）
- 本目录页面不进 Service Worker 预缓存；已实测非 POC 页零回归（docs/perf/report.md 方法）
