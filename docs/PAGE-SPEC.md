# 知识点页面生成规范（子代理必读 · 全站契约）

本文档是全部 `kp/*.html` 页面的唯一标准。生成前请再 Read 一遍 `assets/app.js`（API 以代码为准）与 `assets/kp-index.json`（你负责的知识点行）。

## 0. 产出路径与命名

- 路径：`kp/NN-slug.html`，NN 为两位序号，slug 用 `assets/kp-index.json` 中该点的 `slug`，一字不差。
- 页面 `<title>`：`NN · 标题 · 架构师学堂`（标题用 json 中的 `title`）。

## 1. 页面骨架（复制此模板，替换大写占位与内容）

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NN · 标题 · 架构师学堂</title>
<meta name="description" content="一句话核心">
<link rel="manifest" href="../manifest.webmanifest">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<header id="topbar" class="topbar"></header>
<main class="wrap">
  <div class="kp-head">
    <span class="badge">域中文名</span><span class="badge freq">考频 ★★★★★</span><span class="badge diff">难度 ★★★☆☆</span>
    <!-- 每个依赖一个：<span class="badge dep"><a href="MM-slug.html">前置 NN</a></span> -->
    <h1>NN · 标题</h1>
  </div>

  <section class="sec" id="sec1"><h2><span class="secno">1</span>一句话核心</h2>
    <p class="core-line">一句话核心（30字以内，来自 kp-index 的 oneliner，可微调）</p>
    <div id="city-map"></div>
  </section>

  <section class="sec" id="sec2"><h2><span class="secno">2</span>先想后学：真实工程场景</h2>
    <div class="callout"><span class="t">🏗️ 场景</span>问题描述（真实工程场景，先不给答案）</div>
    <details class="fold"><summary>💡 点开看思路与答案</summary>…</details>
    <h3>30秒温故知新</h3>
    <p>学新之前先回忆前置点（标注前置点编号与标题）：</p>
    <div id="quiz-recall"></div>
  </section>

  <section class="sec" id="sec3"><h2><span class="secno">3</span>知识卡片</h2>
    <div id="tts-bar"></div>
    <div class="kc-text" id="kc-text">
      <h3>是什么</h3><p>…</p>
      <h3>解决什么问题</h3><p>…</p>
      <h3>核心机制</h3><p>…</p>
      <h3>关键细节</h3><p>…（含公式/分类表，用 table.tbl）</p>
      <div class="callout trap"><span class="t">⚠️ 易错点</span>…</div>
    </div>
  </section>

  <section class="sec" id="sec4"><h2><span class="secno">4</span>生活类比与口诀</h2>
    <p>展开城市隐喻…（明确说明：类比在哪里成立、在哪里失效）</p>
    <table class="tbl">…类比项 ↔ 概念项 对应表…</table>
    <div class="rhyme">押韵口诀（4~8句）</div>
  </section>

  <section class="sec" id="sec5"><h2><span class="secno">5</span>动画演示</h2>
    <p>这段动画说明…（一句话）</p>
    <div class="demo-stage" id="demo1-stage"><!-- 内联 SVG/Canvas 画布 --></div>
    <div id="demo1-ctl"></div><!-- app.js 会自动填充 播放/暂停/单步/重置/速度/解说 -->
  </section>

  <section class="sec" id="sec6"><h2><span class="secno">6</span>动手实验室</h2>
    <div class="lab" id="lab1"><h4>实验一：…</h4> …即时反馈 <div class="lab-feedback" id="lab1-fb"></div></div>
    <div class="lab" id="lab2"><h4>实验二：…</h4> …</div>
  </section>

  <section class="sec" id="sec7"><h2><span class="secno">7</span>随堂测试</h2>
    <h3>仿真单选 ×5（含 1~2 道先前知识点交错题）</h3>
    <div id="quiz-main"></div>
    <h3>案例分析 ×2</h3>
    <div id="case1"></div><div id="case2"></div>
    <h3>变式迁移</h3>
    <p>换个场景考同一概念：</p>
    <div id="quiz-variant"></div>
  </section>

  <section class="sec" id="sec8"><h2><span class="secno">8</span>概念桥</h2>
    <h3>向前：我建立在这些已学点之上</h3><div id="bridge-prev"></div>
    <p>（每个依赖一句话：它给了本点什么）</p>
    <h3>向后：我为这些后续点埋下伏笔</h3><div id="bridge-next"></div>
    <ul class="foreshadow"><li>…</li></ul>
    <h3>易混概念对比</h3>
    <table class="tbl"><tr><th></th><th>概念X</th><th>概念Y</th></tr>
      <tr><td>差异点</td><td>…</td><td>…</td></tr>
      <tr><td>易错点</td><td>…</td><td>…</td></tr>
      <tr><td>一句话区分</td><td colspan="2">…</td></tr></table>
  </section>

  <section class="sec" id="sec9"><h2><span class="secno">9</span>费曼检验</h2>
    <p>假设听众是12岁孩子，用大白话解释本知识点，关键词会自动点亮：</p>
    <textarea id="feynman-input" placeholder="比如：你可以这样讲——…"></textarea>
    <div id="feynman-feedback"></div>
  </section>

  <section class="sec" id="sec10"><h2><span class="secno">10</span>小结</h2>
    <ul class="summary-3"><li>① …</li><li>② …</li><li>③ …</li></ul>
    <div id="kp-nav" class="kp-nav"></div>
  </section>
</main>
<footer class="site-footer">架构师学堂 · 例题均为原创仿真题 · 进度保存在本机浏览器</footer>
<script>
window.KP_CONF = {
  id: 'NN', domain: 'DOMAIN_KEY', loc: 'LOC_KEY', root: '..',
  title: '标题', prev: 'MM-prevslug.html', prevTitle: 'MM · 上一站标题',
  next: 'KK-nextslug.html', nextTitle: 'KK · 下一站标题',
  keywords: ['关键词1','关键词2','关键词3','关键词4','关键词5']
};
</script>
<script>
window.KP_BOOT = function (CX) {
  CX.renderQuiz('#quiz-recall', [ {…前置点回忆题，kpId 指向前置点…} ], { mode: 'recall' });
  CX.renderQuiz('#quiz-main', [ /* 5 题 */ ], { kpId: 'NN', mode: 'test' });
  CX.renderCase('#case1', { stem:'…', q:'…', ref:'…', points:['…','…'], frame:'…' });
  CX.renderCase('#case2', { … });
  CX.renderQuiz('#quiz-variant', [ {…} ], { kpId: 'NN', mode: 'variant' });
  CX.depChain('#bridge-prev', ['MM'], 'prev');
  CX.depChain('#bridge-next', ['KK'], 'next');
  var anim = CX.makeAnim('#demo1-ctl', { steps: 10, duration: 10, onTick: function (t) { /* 重绘 SVG/Canvas */ } });
};
</script>
<script defer src="../assets/app.js"></script>
</body>
</html>
```

## 2. 引擎 API 契约（只调用，不重写）

页面内联脚本只能通过 `window.KP_BOOT = function(CX){…}` 使用引擎（`CX = CityExam`）。可用：

| API | 说明 |
|---|---|
| `CX.renderQuiz(sel, questions, opts)` | 判题/逐选项解析/错题本/SM-2 全自动。`opts={kpId:'NN', mode:'test'|'recall'|'variant'}`。**test 且带 kpId 时自动计分并写 SM-2**。 |
| `CX.renderCase(sel, data)` | 案例分析折叠卡。`data={stem,q,ref,points:[…],frame:'…',kpId:'NN'}` |
| `CX.makeAnim(ctlSel, cfg)` | 自动注入 播放/暂停/单步/重置/速度滑杆/解说行。`cfg={steps, duration(秒), onTick(t 0~1)}`。t 从 0 到 1；用 t 重绘画布。 |
| `CX.setCap(ctlSel, text)` | 更新动画一句话解说 |
| `CX.depChain(sel, ids, dir)` | 依赖链胶囊（自动带链接与悬浮提示），`dir='prev'|'next'` |
| `CX.bindFeynman('#feynman-input', keywords, '#feynman-feedback')` | 通常不用手调：KP_CONF.keywords 存在时引擎自动绑定 |
| `CX.utils.$ / CX.utils.$$ / CX.esc / CX.el` | 小工具 |

单题数据格式（renderQuiz 的 questions 元素）：
```js
{ q: '题干（可用「」引用场景）',
  opts: [ {t:'选项文本', why:'逐选项解析：为什么对/为什么错，一句话点到本质'} , … ],
  ans: 2,               // 正确选项下标（从0起）
  tag: '交错复习:10',    // 可选，交错题必须写「交错复习:前置编号」
  src: '仿真题' }        // 一律“仿真题”
```

## 3. 动画与实验室硬性要求

- 动画：**必须**有 播放/暂停/单步/变速（makeAnim 已保证）+ 至少 1 个参数滑块（你自己加 `<input type=range>`，input 事件里直接重绘）。图形用手写 SVG（推荐，返回字符串 innerHTML）或 Canvas。每个关键帧一句话解说（用 CX.setCap 或 onFrame 分段）。
- 实验室：2~3 个交互。推荐形式：拖拽排序（HTML5 dragstart/dragover）、连线匹配（点击配对）、参数实验（滑块调参看结果）。**做错时反馈必须指出错在哪一步**，而不是只说“错了”。

## 4. 内容质量标准（自检清单，生成后逐条自查）

1. [ ] 零基础可读：术语首现必解释；先具体例子后抽象定义；无未解释的英文缩写。
2. [ ] 十段齐全，段落顺序不变；一句话核心 ≤30 字；小结恰好 3 句。
3. [ ] Hook 是真实工程场景问题，先问后答（details 折叠）。
4. [ ] 前置回忆题 kpId 指向真实前置点（查 kp-index 的 deps）；本页无 deps 时考同域最近前序点。
5. [ ] 5 道单选里 1~2 道是先前知识点交错题（tag 写「交错复习:编号」）；全部选项都有 why 解析；全部原创仿真题。
6. [ ] 案例分析 2 道：有参考答案 + ≥3 条评分要点 + 高分答题框架。
7. [ ] 变式题换了场景考同一概念。
8. [ ] 类比表含「类比失效边界」一行/一条；口诀押韵、≤8 句。
9. [ ] 易混对比表选本点最易混的一对概念。
10. [ ] KP_CONF 的 id/domain/loc/prev/next/keywords 与 kp-index.json 一致；prev/next 取全站序号 NN±1 的文件名。
11. [ ] 无任何外部资源引用（无 http(s):// 的 img/script/link href；纯文本引用来源可以）；无 CDN、无外链图片、无 iframe。
12. [ ] 文件在浏览器 console 无 JS 报错（自查语法）。
13. [ ] 费曼关键词 5~8 个，是本点核心术语（不是长句）。
14. [ ] 学术诚实：不出现真题原题、不编造「某年真题第X题」；引用数据注明「一般认为/教材口径」。

## 5. 统一隐喻世界观（防止隐喻冲突，必须沿用）

**软件系统 = 一座城市**。各域城市分区与固定比喻：

| 域 | 分区 | 固定比喻（不得改写） |
|---|---|---|
| 硬件 | 🏗️ 地基与电厂 | CPU=市政府，Cache=随手抽屉，内存=办公桌，磁盘=档案馆，总线=马路，中断=门铃，流水线=装配线 |
| 操作系统 | 🏛️ 市政厅 | 进程=市民，线程=市民的待办，调度=叫号，信号量=带计数的车位钥匙，死锁=十字路口四车互堵，页表=假地址→真地址翻译处 |
| 数据库 | 📚 中央档案馆 | 表=档案架，索引=目录册，事务=转账必须两清，锁=借阅登记，规范化=档案断舍离，主从复制=分馆抄本 |
| 网络 | 🚦 道路邮政 | 分层=邮政体系，IP=门牌，路由=导航员，TCP=挂号信，UDP=投递传单，交换机=小区门卫，防火墙=城门岗哨 |
| 软件工程 | 🧱 建设工地 | 过程模型=施工组织方式，需求=业主诉求书，DFD=建材流线路图，测试=监理验收，配置管理=图纸版本管理 |
| 架构 | 🗺️ 城市规划馆 | 架构=总规，风格=功能分区套路，分层=逐级审批，微服务=专业商铺区，缓存=社区便利店，负载均衡=红绿灯/分流闸口，消息队列=快递中转站，SOA=统一便民服务中心 |
| 质量评估 | 🔍 质检评估院 | 质量属性=验收指标，场景=验收单，战术=加固招式，ATAM=抗震评估会，敏感点=单一关键变量，权衡点=两个指标的拉锯点 |
| 设计模式 | 📐 标准图纸馆 | 模式=定型设计图，工厂=预制件厂，适配器=转换插头，代理=隔门办事的中间人，装饰=层层加装，观察者=订报纸 |
| 安全法律 | 🛡️ 城防司法局 | 加密=密写，密钥对=挂锁与钥匙，签名=按手印+公证处，PKI=公证体系，知识产权=房产证 |
| 项目管理 | 📋 建设指挥部 | 关键路径=工期主线，挣值=干完活按预算值多少钱，风险=天气预警 |
| 前沿 | 🌆 未来新城 | 大数据=全城摄像头与水厂，数据湖=水库，AI=规划参谋部，边缘计算=社区服务站，区块链=全员记账的总账本 |

每个页面还可以在本域比喻基础上自由延展，但**不得与本表冲突**。

## 6. 禁止事项

- 禁止引用任何外部 URL 资源（脚本/样式/图片/字体）。文中提及来源用纯文字即可。
- 禁止编造真题年份题号；一切例题标「仿真题」。
- 禁止在页面里改写 style.css/app.js 的职责（判题、进度、SM-2、错题本、导航、地图、TTS 一律走引擎）。
- 禁止使用 alert/confirm 打断（引擎已处理提示）。
