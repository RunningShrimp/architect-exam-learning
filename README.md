# 🏙️ 架构师学堂 · 系统架构设计师学习站

面向「中国软考高级 · 系统架构设计师」的**离线 PWA 学习站**。
零基础友好，零外部依赖（无 CDN / 无库 / 无网络字体 / 无外链图片），断网可用。

**教学设计**：统一隐喻世界观「软件系统 = 一座城市」贯穿全站；每个知识点页落实认知负荷理论、双重编码、主动回忆、SM-2 间隔重复、交错练习、生成效应（费曼检验）等学习科学机制。

## 本地预览

```bash
cd 本仓库目录
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

> ⚠️ 直接双击以 `file://` 打开时：页面可看、测试可做，但「进度保存 / 语音朗读 / 知识图谱 / Service Worker 离线缓存」受浏览器限制可能不可用。请优先使用本地服务器或部署后的线上地址。

## 站点结构

| 入口 | 说明 |
|---|---|
| `index.html` | 城市地图 + 学习仪表盘（总进度 / 各域掌握度雷达 / 连续天数 / 待复习数） |
| `kp/NN-*.html` | 62 个知识点页，NN 为按依赖拓扑排序的学习序号，从 `kp/01-*.html` 顺序学即可 |
| `review.html` | 复习中心：SM-2 到期队列 + 跨域交错混合卷 + 错题本 |
| `graph.html` | 知识图谱：依赖边（前置）与关联边（相关），点节点跳转 |

每个知识点页固定十段结构：一句话核心 → Hook 场景题 + 前置点回忆 → 知识卡片（可朗读）→ 生活类比与口诀 → 动画演示（播放/暂停/单步/变速）→ 动手实验室 → 随堂测试（含交错练习题与案例分析）→ 概念桥 → 费曼检验 → 三句话小结。

## 语音朗读（三层音源，自动降级）

朗读按钮按以下顺序自动选择音源，UI 上会显示当前模式：

1. **🎧 预生成音频**（首选）：`audio/kp-NN-*.mp3`，微软神经音色 `zh-CN-XiaoxiaoNeural`、语速 -10%、24kbps 单声道，带 SRT 字幕跟随，离线可用、与访客设备无关；
2. **🎤 浏览器增强**：无音频文件时（含 file:// 直开），用系统 speechSynthesis 择优音色（Natural/Neural 优先）朗读页面内嵌的同一份口语脚本；
3. **🧩 兼容模式**：两者皆不可用时直读页面 DOM（表格按口语规则转写，永不逐格朗读）。

**重新生成朗读脚本与音频**（内容更新后执行，支持断点续跑）：

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -i https://mirrors.aliyun.com/pypi/simple/ edge-tts
python3 scripts/gen_narration.py                      # 重新生成脚本并更新页面内嵌
./.venv/bin/python scripts/synth_tts.py --shrink      # 批量合成(--only 05 可只合成某页)
```

换音色：改 `scripts/synth_tts.py` 顶部 `VOICE`（如 `zh-CN-YunxiNeural` 男声），删掉 `audio/` 后重跑即可。

## 数据与隐私



- 全部学习进度存在**你自己的浏览器** localStorage 中（键前缀 `ce_v1_`），不上传任何服务器。
- 更换浏览器 / 清理浏览器数据会丢失进度；如需迁移，可复制 localStorage 中 `ce_v1_` 开头的键值。

## 部署（GitHub Pages）

```bash
gh repo create architect-exam-learning --public --source=. --push
gh api repos/{owner}/{repo}/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

> 发版提示：`sw.js` 的缓存名 `architect-exam-v1` 命中即用旧副本；以后更新内容后需把版本号递增（如 `-v2`）用户才能拿到新页面。

国内访问备选：Cloudflare Pages / Vercel 导入本仓库即可（纯静态，无需构建命令，输出目录为根目录）。

## 免责声明

本站所有例题均为**原创仿真题**（标注「仿真题」），不复制真题原文；知识点口径以《系统架构设计师教程（第2版）》（清华大学出版社）与官方考试大纲为准。
