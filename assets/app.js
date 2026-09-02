/* ============================================================
   架构师学堂 · 共享引擎 app.js v1.0
   零外部依赖。所有页面只调用 CityExam(CX)，不得重写判题/进度逻辑。
   API 契约见 docs/PAGE-SPEC.md
   ============================================================ */
(function () {
'use strict';

/* ---------------- 本地存储 ---------------- */
var PREFIX = 'ce_v1_';
var store = {
  get: function (k, d) {
    try { var v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} }
};
function getState() {
  var s = store.get('state', null);
  if (!s) { s = { pages: {}, sm2: {}, wrong: [], daily: {}, streak: 0, feynman: {} }; store.set('state', s); }
  return s;
}
function saveState(s) { store.set('state', s); }

/* ---------------- 知识索引 ---------------- */
var INDEX = null;
function indexUrl() {
  var root = (window.KP_CONF && window.KP_CONF.root) || '.';
  return root + '/assets/kp-index.json';
}
function loadIndex(cb) {
  if (INDEX) { cb && cb(INDEX); return; }
  if (location.protocol === 'file:') { cb && cb(null); return; } /* file:// 下受限，见 README */
  fetch(indexUrl()).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { INDEX = j; cb && cb(j); })
    .catch(function () { cb && cb(null); });
}
function findPoint(id) {
  if (!INDEX) return null;
  var pts = INDEX.points;
  for (var i = 0; i < pts.length; i++) if (pts[i].id === String(id)) return pts[i];
  return null;
}
function pointFile(p) { return (window.KP_CONF ? window.KP_CONF.root : '.') + '/kp/' + p.file.split('/').pop(); }

/* ---------------- 工具 ---------------- */
function $(sel, root) {
  if (!root && typeof sel === 'string' && /^[A-Za-z][\w-]*$/.test(sel)) return document.getElementById(sel);
  return (root || document).querySelector(sel);
}
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

/* ---------------- 主题 ---------------- */
function initTheme() {
  var t = store.get('theme', 'dark');
  document.documentElement.setAttribute('data-theme', t);
  var btn = $('#theme-btn');
  if (btn) btn.addEventListener('click', function () {
    t = (t === 'dark') ? 'light' : 'dark';
    store.set('theme', t);
    document.documentElement.setAttribute('data-theme', t);
    btn.textContent = t === 'dark' ? '☀️ 浅色' : '🌙 深色';
  });
  if (btn) btn.textContent = t === 'dark' ? '☀️ 浅色' : '🌙 深色';
}

/* ---------------- 打卡与连续天数 ---------------- */
function touchDaily() {
  var s = getState(), today = todayStr();
  if (s.daily[today]) return;
  s.daily[today] = true;
  var keys = Object.keys(s.daily).sort();
  var streak = 0;
  var d = new Date();
  for (;;) {
    var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    if (s.daily[key]) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  s.streak = streak;
  saveState(s);
}

/* ---------------- SM-2 调度 ---------------- */
function sm2Update(card, q) {
  if (!card) card = { ef: 2.5, int: 0, reps: 0, due: 0, ts: 0 };
  if (q < 3) { card.reps = 0; card.int = 1; }
  else {
    card.reps++;
    card.int = card.reps === 1 ? 1 : (card.reps === 2 ? 6 : Math.round(card.int * card.ef));
  }
  card.ef = Math.max(1.3, card.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  card.ts = Date.now();
  card.due = card.ts + card.int * 86400000;
  return card;
}
/* 由测验得分(0~5分制)驱动 SM-2 */
function recordTestResult(kpId, score, total) {
  var s = getState();
  var ratio = total > 0 ? score / total : 0;
  var q = Math.max(1, Math.min(5, Math.round(ratio * 5)));
  s.sm2[String(kpId)] = sm2Update(s.sm2[String(kpId)], q);
  var pg = s.pages[String(kpId)] || (s.pages[String(kpId)] = { visited: true, best: 0 });
  pg.visited = true;
  if (ratio > (pg.best || 0)) pg.best = ratio;
  pg.lastTs = Date.now();
  saveState(s);
  return q;
}
function markVisited(kpId) {
  var s = getState();
  var pg = s.pages[String(kpId)] || (s.pages[String(kpId)] = { visited: true, best: 0 });
  pg.visited = true; pg.lastTs = pg.lastTs || Date.now();
  saveState(s);
}
function dueList(now) {
  now = now || Date.now();
  var s = getState(), out = [];
  Object.keys(s.sm2).forEach(function (id) {
    if (s.sm2[id].due <= now) out.push({ id: id, card: s.sm2[id] });
  });
  out.sort(function (a, b) { return a.card.due - b.card.due; });
  return out;
}

/* ---------------- 错题本 ---------------- */
function addWrongAnswer(item) {
  var s = getState();
  s.wrong.push({
    ts: Date.now(), kpId: item.kpId || null, title: item.title || '',
    q: item.q || '', chosen: item.chosen || '', correct: item.correct || '', why: item.why || ''
  });
  if (s.wrong.length > 500) s.wrong = s.wrong.slice(-500);
  saveState(s);
}

/* ---------------- 题库（供复习中心跨域混卷） ---------------- */
function bankQuestions(kpId, meta, questions) {
  var b = store.get('qbank', {});
  b[String(kpId)] = { title: meta.title || '', domain: meta.domain || '', questions: questions };
  store.set('qbank', b);
}
function getBank() { return store.get('qbank', {}); }

/* ---------------- 顶栏 ---------------- */
function buildTopbar() {
  var bar = $('#topbar');
  if (!bar) return;
  var root = (window.KP_CONF && window.KP_CONF.root) || '.';
  var isKp = !!(window.KP_CONF && window.KP_CONF.id);
  var page = location.pathname.split('/').pop() || 'index.html';
  var nav = [
    ['index.html', '🏠 城市地图'],
    ['review.html', '🔁 复习中心'],
    ['graph.html', '🕸️ 知识图谱']
  ];
  var html = '<span class="brand"><span class="city">🏙️</span>架构师学堂</span><span class="spacer"></span><nav>';
  nav.forEach(function (n) {
    var active = (page === n[0] && !isKp) ? ' class="active"' : '';
    html += '<a href="' + root + '/' + n[0] + '"' + active + '>' + n[1] + '</a>';
  });
  html += '</nav><span class="spacer"></span><span id="progress-mini"></span>' +
    '<button class="icon-btn" id="theme-btn">🌙 深色</button>';
  bar.innerHTML = html;
  initTheme();
  loadIndex(function (idx) {
    var mini = $('#progress-mini');
    if (!mini) return;
    var done = 0, total = idx ? idx.points.length : 62;
    if (idx) {
      var s = getState();
      idx.points.forEach(function (p) { if (s.pages[p.id] && s.pages[p.id].visited) done++; });
    }
    mini.textContent = '已学 ' + done + '/' + total;
  });
}

/* ---------------- 城市地图 ---------------- */
var MAP_ZONES = [
  { key: 'foundation',   x: 60,  y: 300, w: 130, h: 90,  name: '地基与电厂', icon: '🏗️' },
  { key: 'construction', x: 60,  y: 160, w: 130, h: 90,  name: '建设工地',   icon: '🧱' },
  { key: 'govhall',      x: 230, y: 300, w: 120, h: 90,  name: '市政厅',     icon: '🏛️' },
  { key: 'roads',        x: 230, y: 160, w: 120, h: 90,  name: '道路邮政',   icon: '🚦' },
  { key: 'archive',      x: 390, y: 300, w: 120, h: 90,  name: '中央档案馆', icon: '📚' },
  { key: 'cityplan',     x: 390, y: 160, w: 120, h: 90,  name: '城市规划馆', icon: '🗺️' },
  { key: 'inspection',   x: 550, y: 160, w: 120, h: 90,  name: '质检评估院', icon: '🔍' },
  { key: 'blueprint',    x: 550, y: 300, w: 120, h: 90,  name: '标准图纸馆', icon: '📐' },
  { key: 'citadel',      x: 390, y: 40,  w: 120, h: 80,  name: '城防司法局', icon: '🛡️' },
  { key: 'command',      x: 230, y: 40,  w: 120, h: 80,  name: '建设指挥部', icon: '📋' },
  { key: 'newtown',      x: 660, y: 40,  w: 120, h: 80,  name: '未来新城',   icon: '🌆' }
];
function cityMapSVG(activeKey) {
  var s = '<svg viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="城市隐喻地图">';
  s += '<rect x="0" y="0" width="800" height="420" rx="14" fill="var(--bg-soft)"/>';
  /* 道路 */
  s += '<g stroke="var(--line)" stroke-width="14" stroke-linecap="round" opacity=".9">';
  s += '<line x1="40" y1="345" x2="760" y2="345"/><line x1="40" y1="205" x2="760" y2="205"/>';
  s += '<line x1="40" y1="80" x2="760" y2="80"/>';
  s += '<line x1="125" y1="80" x2="125" y2="390"/><line x1="290" y1="80" x2="290" y2="390"/>';
  s += '<line x1="450" y1="80" x2="450" y2="390"/><line x1="610" y1="80" x2="610" y2="390"/>';
  s += '</g>';
  s += '<g stroke="var(--accent)" stroke-width="2" stroke-dasharray="8 10" opacity=".5">';
  s += '<line x1="40" y1="345" x2="760" y2="345"/><line x1="40" y1="205" x2="760" y2="205"/><line x1="40" y1="80" x2="760" y2="80"/>';
  s += '</g>';
  MAP_ZONES.forEach(function (z) {
    var on = z.key === activeKey;
    s += '<g>';
    s += '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="10" ' +
      'fill="' + (on ? 'var(--accent-2)' : 'var(--card)') + '" stroke="' + (on ? 'var(--accent-2)' : 'var(--line)') + '" stroke-width="2"/>';
    s += '<text x="' + (z.x + z.w / 2) + '" y="' + (z.y + 30) + '" text-anchor="middle" font-size="22">' + z.icon + '</text>';
    s += '<text x="' + (z.x + z.w / 2) + '" y="' + (z.y + 56) + '" text-anchor="middle" font-size="14" ' +
      'fill="' + (on ? 'var(--bg)' : 'var(--text-dim)') + '" font-weight="' + (on ? '700' : '400') + '">' + z.name + '</text>';
    if (on) s += '<rect x="' + (z.x - 4) + '" y="' + (z.y - 4) + '" width="' + (z.w + 8) + '" height="' + (z.h + 8) + '" rx="13" fill="none" stroke="var(--accent-2)" stroke-width="3" opacity=".6"/>';
    s += '</g>';
  });
  s += '<text x="40" y="406" font-size="12" fill="var(--text-dim)">软件系统 = 一座城市 · 每个知识点在城市中都有自己的位置</text>';
  s += '</svg>';
  return s;
}

/* ---------------- TTS 朗读 ---------------- */
var ttsState = { chunks: [], idx: 0, playing: false, rate: 1 };
function ttsChunkify(text) {
  text = text.replace(/\s+/g, ' ');
  var parts = text.match(/[^。！？；!?;]*[。！？；!?;]?/g) || [text];
  var out = [], buf = '';
  parts.forEach(function (p) {
    if ((buf + p).length > 160) { if (buf) out.push(buf); buf = p; }
    else buf += p;
  });
  if (buf) out.push(buf);
  return out;
}
function ttsPlayFrom(node) {
  if (!('speechSynthesis' in window)) { alert('当前浏览器不支持语音朗读'); return; }
  window.speechSynthesis.cancel();
  var text = node.textContent.replace(/🔊.*?$/, '');
  ttsState.chunks = ttsChunkify(text);
  ttsState.idx = 0; ttsState.playing = true;
  ttsNext();
}
function ttsNext() {
  if (!ttsState.playing || ttsState.idx >= ttsState.chunks.length) { ttsStop(); return; }
  var u = new SpeechSynthesisUtterance(ttsState.chunks[ttsState.idx++]);
  u.lang = 'zh-CN'; u.rate = ttsState.rate;
  u.onend = function () { ttsNext(); };
  u.onerror = function () { ttsStop(); };
  window.speechSynthesis.speak(u);
}
function ttsStop() { ttsState.playing = false; if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
function buildTTSBar() {
  var bar = $('#tts-bar');
  if (!bar) return;
  bar.className = 'tts-bar';
  bar.innerHTML = '<button class="btn" data-tts="play">🔊 朗读本节</button>' +
    '<button class="btn" data-tts="stop">⏹ 停止</button>' +
    '<label>语速 <input type="range" min="0.6" max="1.8" step="0.1" value="1"> <span class="rate-out">1.0x</span></label>' +
    '<span class="hint">需浏览器支持；file:// 打开时部分浏览器受限</span>';
  var target = $('#kc-text') || $('#sec3') || document.querySelector('main');
  bar.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-tts');
    if (a === 'play') ttsPlayFrom(target);
    if (a === 'stop') ttsStop();
  });
  var r = bar.querySelector('input[type=range]');
  r.addEventListener('input', function () {
    ttsState.rate = parseFloat(r.value);
    bar.querySelector('.rate-out').textContent = ttsState.rate.toFixed(1) + 'x';
    if (ttsState.playing) { window.speechSynthesis.cancel(); ttsNext(); }
  });
}

/* ---------------- 测验渲染 ---------------- */
/**
 * CX.renderQuiz(sel, questions, opts)
 * question: {q, opts:[{t, why}...], ans:index, tag?, src?}
 * opts: {kpId?, mode?:'test'|'hook'|'recall'|'variant'|'review', onDone?(score,total)}
 */
function renderQuiz(sel, questions, opts) {
  opts = opts || {};
  var root = (typeof sel === 'string') ? $(sel.replace(/^#/, '')) || document.querySelector(sel) : sel;
  if (!root) return;
  root.innerHTML = '';
  questions = questions.map(function (q) { return q; });
  var mode = opts.mode || 'test';
  var titleMap = { test: '随堂测试', hook: '开场挑战', recall: '温故知新（前置点回忆）', variant: '变式迁移', review: '复习' };
  var score = 0, answered = 0;
  var storeMeta = opts.kpId && (mode === 'test');
  if (storeMeta) {
    bankQuestions(opts.kpId, { title: (window.KP_CONF && window.KP_CONF.title) || '', domain: (window.KP_CONF && window.KP_CONF.domain) || '' }, questions);
  }
  var resultBox = el('div', 'q-result');
  resultBox.style.display = 'none';
  questions.forEach(function (Q, qi) {
    var card = el('div', 'q-card');
    var meta = (mode === 'test' ? '第 ' + (qi + 1) + ' 题 · 仿真题' : titleMap[mode] || mode);
    if (Q.src) meta += ' · ' + Q.src;
    if (Q.tag) meta += ' · <span class="tag">' + esc(Q.tag) + '</span>';
    card.appendChild(el('div', 'q-meta', meta));
    card.appendChild(el('div', 'q-stem', esc(Q.q)));
    var optsBox = el('div', 'q-opts');
    var letters = 'ABCDEFGH';
    var expBox = el('div', 'q-exp');
    expBox.style.display = 'none';
    var done = false;
    Q.opts.forEach(function (O, oi) {
      var b = el('button', 'q-opt');
      b.innerHTML = '<span class="opt-letter">' + letters[oi] + '.</span><span>' + esc(O.t) + '</span>';
      b.addEventListener('click', function () {
        if (done) return;
        done = true; answered++;
        var right = oi === Q.ans;
        if (right) score++;
        else {
          addWrongAnswer({
            kpId: opts.kpId || null,
            title: (window.KP_CONF && window.KP_CONF.title) || (opts.title || ''),
            q: Q.q, chosen: O.t, correct: Q.opts[Q.ans].t,
            why: (Q.opts[Q.ans] && Q.opts[Q.ans].why) || ''
          });
        }
        var btns = $$('button', optsBox);
        btns.forEach(function (bb, bi) {
          bb.disabled = true;
          if (bi === Q.ans) bb.classList.add('right');
          if (bi === oi && !right) bb.classList.add('wrong');
        });
        var verdict = '<div class="verdict ' + (right ? 'ok">✅ 回答正确' : 'bad">❌ 回答错误') + '</div>';
        var list = '<ul>';
        Q.opts.forEach(function (OO, oi2) {
          list += '<li><b>' + letters[oi2] + '.</b> ' + esc(OO.why || '') + '</li>';
        });
        list += '</ul>';
        expBox.innerHTML = verdict + list;
        expBox.style.display = '';
        if (answered === questions.length) finish();
      });
      optsBox.appendChild(b);
    });
    card.appendChild(optsBox);
    card.appendChild(expBox);
    root.appendChild(card);
  });
  function finish() {
    var msg, qLine = '得分：' + score + ' / ' + questions.length;
    if (mode === 'test' && opts.kpId) {
      var q5 = recordTestResult(opts.kpId, score, questions.length);
      msg = qLine + ' · 已写入记忆调度（SM-2 质量分 ' + q5 + '/5）';
    } else msg = qLine;
    if (score === questions.length) msg += ' 🎉 全对！';
    else if (score === 0) msg += ' 💪 建议回看知识卡片后再来一次';
    resultBox.innerHTML = esc(msg) + ' <button class="btn" data-retry>↺ 重做本组</button>';
    resultBox.style.display = '';
    resultBox.querySelector('[data-retry]').addEventListener('click', function () {
      renderQuiz(sel, questions, opts);
    });
    if (typeof opts.onDone === 'function') opts.onDone(score, questions.length);
  }
  root.appendChild(resultBox);
  return { root: root };
}

/* ---------------- 案例分析渲染 ---------------- */
/** CX.renderCase(sel, data)  data: {no?, stem, q, ref, points[], frame[], kpId?} */
function renderCase(sel, data) {
  var root = (typeof sel === 'string') ? $(sel.replace(/^#/, '')) || document.querySelector(sel) : sel;
  if (!root) return;
  root.innerHTML = '';
  var box = el('div', 'case-block');
  box.appendChild(el('div', 'q-meta', (data.no ? '案例 ' + esc(data.no) + ' · ' : '') + '案例分析 · 仿真题'));
  box.appendChild(el('div', 'stem', esc(data.stem || '')));
  box.appendChild(el('div', 'q-stem', '【问题】' + esc(data.q || '')));
  var toggle = el('button', 'btn primary', '📄 查看参考答案与评分要点');
  var ans = el('div', 'case-answer');
  ans.style.display = 'none';
  ans.innerHTML =
    '<h4>参考答案</h4><div>' + esc(data.ref || '') + '</div>' +
    (data.points && data.points.length ? '<h4>评分要点</h4><ul>' + data.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') +
    (data.frame ? '<h4>高分答题框架</h4><div>' + esc(data.frame) + '</div>' : '');
  toggle.addEventListener('click', function () {
    var open = ans.style.display !== 'none';
    ans.style.display = open ? 'none' : '';
    toggle.textContent = open ? '📄 查看参考答案与评分要点' : '🙈 收起答案';
  });
  var mark = el('div', 'self-mark', '自评：<button class="btn" data-m="ok">👍 已掌握</button><button class="btn" data-m="re">🔁 需再学</button><span class="m-out"></span>');
  mark.addEventListener('click', function (e) {
    var m = e.target.getAttribute && e.target.getAttribute('data-m');
    if (!m) return;
    var s = getState();
    var id = data.kpId || (window.KP_CONF && window.KP_CONF.id);
    if (id) {
      var pg = s.pages[String(id)] || (s.pages[String(id)] = { visited: true, best: 0 });
      pg.caseDone = (m === 'ok');
      pg.lastTs = Date.now();
      saveState(s);
    }
    mark.querySelector('.m-out').textContent = m === 'ok' ? '已记录：本题掌握 ✔（计入页面进度）' : '已记录：需要重学本题 ↺';
  });
  box.appendChild(toggle);
  box.appendChild(ans);
  box.appendChild(mark);
  root.appendChild(box);
}

/* ---------------- 动画控制器（播放/暂停/单步/变速 四控） ---------------- */
/**
 * CX.makeAnim(ctlSel, cfg)  cfg: {steps, duration(s), onTick(t 0~1), onFrame(i)?}
 * 容器内按钮: data-act=play|pause|step|reset  速度: input[data-role=speed]
 * 可选 .cap 元素用于一句话解说；CX.setCap(anim, text) 更新。
 */
var animSeq = 0;
function makeAnim(ctlSel, cfg) {
  cfg = cfg || {};
  var ctl = (typeof ctlSel === 'string') ? $(ctlSel.replace(/^#/, '')) || document.querySelector(ctlSel) : ctlSel;
  if (!ctl) return null;
  ctl.classList.add('anim-controls');
  if (!ctl.querySelector('[data-act=play]')) {
    ctl.innerHTML = '<button data-act="play">▶ 播放</button><button data-act="pause">⏸ 暂停</button>' +
      '<button data-act="step">⏭ 单步</button><button data-act="reset">↺ 重置</button>' +
      '<label>速度 <input type="range" data-role="speed" min="0.25" max="3" step="0.25" value="1"> <span data-out="speed">1x</span></label>' +
      '<span class="cap"></span>';
  }
  var steps = cfg.steps || 8;
  var duration = (cfg.duration || 8) * 1000;
  var t = 0, raf = null, last = 0, speed = 1, playing = false;
  var cap = ctl.querySelector('.cap');
  function fire() {
    if (cfg.onTick) cfg.onTick(t);
    if (cfg.onFrame) cfg.onFrame(Math.min(steps - 1, Math.floor(t * steps)));
  }
  function loop(now) {
    if (!playing) return;
    if (last) t += (now - last) / duration * speed;
    last = now;
    if (t >= 1) { t = 1; fire(); pause(); return; }
    fire();
    raf = requestAnimationFrame(loop);
  }
  function play() { if (playing || t >= 1) { if (t >= 1) t = 0; } playing = true; last = 0; raf = requestAnimationFrame(loop); }
  function pause() { playing = false; if (raf) cancelAnimationFrame(raf); raf = null; }
  ctl.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-act');
    if (!a) return;
    if (a === 'play') play();
    if (a === 'pause') pause();
    if (a === 'step') { pause(); t = Math.min(1, t + 1 / steps); fire(); }
    if (a === 'reset') { pause(); t = 0; fire(); }
  });
  var sp = ctl.querySelector('[data-role=speed]');
  sp.addEventListener('input', function () {
    speed = parseFloat(sp.value);
    ctl.querySelector('[data-out=speed]').textContent = speed + 'x';
  });
  fire();
  return {
    play: play, pause: pause,
    set: function (v) { t = Math.max(0, Math.min(1, v)); fire(); },
    get t() { return t; },
    isPlaying: function () { return playing; }
  };
}
function setCap(ctlSel, text) {
  var ctl = (typeof ctlSel === 'string') ? $(ctlSel.replace(/^#/, '')) || document.querySelector(ctlSel) : ctlSel;
  if (ctl) { var c = ctl.querySelector('.cap'); if (c) c.textContent = text; }
}

/* ---------------- 概念桥：依赖链 ---------------- */
/** CX.depChain(sel, ids, dir) dir: 'prev'|'next' */
function depChain(sel, ids, dir) {
  var root = (typeof sel === 'string') ? $(sel.replace(/^#/, '')) || document.querySelector(sel) : sel;
  if (!root) return;
  root.classList.add('dep-chain');
  loadIndex(function (idx) {
    root.innerHTML = '';
    var arrow = dir === 'next' ? '<span class="dep-arrow">⮑</span>' : '<span class="dep-arrow">→</span>';
    (ids || []).forEach(function (id, i) {
      if (i > 0) root.insertAdjacentHTML('beforeend', arrow);
      var p = idx ? findPoint(id) : null;
      var label = p ? (p.id + ' · ' + p.title) : ('知识点 ' + id);
      var href = p ? pointFile(p) : '#';
      root.insertAdjacentHTML('beforeend',
        '<a class="dep-chip" href="' + href + '" title="' + (p ? esc(p.oneliner || '') : '') + '"><span class="n">' + esc(id) + '</span>' + esc(p ? p.title : '') + '</a>');
    });
    if (!ids || !ids.length) root.innerHTML = '<span class="foreshadow">（无——这是起点之一）</span>';
  });
}

/* ---------------- 费曼检验 ---------------- */
/** CX.bindFeynman(inputSel, keywords[], feedbackSel) */
function bindFeynman(inputSel, keywords, fbSel) {
  var input = (typeof inputSel === 'string') ? $(inputSel.replace(/^#/, '')) || document.querySelector(inputSel) : inputSel;
  var fb = (typeof fbSel === 'string') ? $(fbSel.replace(/^#/, '')) || document.querySelector(fbSel) : fbSel;
  if (!input || !fb) return;
  keywords = keywords || [];
  var saved = getState().feynman[(window.KP_CONF && window.KP_CONF.id) || ''];
  if (saved && saved.text) input.value = saved.text;
  function check() {
    var text = input.value || '';
    var lit = 0;
    var chips = '<div class="kw-wrap">';
    keywords.forEach(function (k) {
      var hit = text.indexOf(k) >= 0;
      if (hit) lit++;
      chips += '<span class="kw' + (hit ? ' lit' : '') + '">' + (hit ? '✅ ' : '⬜ ') + esc(k) + '</span>';
    });
    chips += '</div>';
    var pct = keywords.length ? Math.round(lit / keywords.length * 100) : 0;
    var msg = pct === 100 ? '🎉 全部关键词命中！你已经能讲清楚了。试着不看点提示再讲一遍。'
      : pct >= 60 ? '👍 不错！还差几个关键概念，看看没点亮的词，补进你的解释里。'
      : '💡 把下面提示的关键词自然地讲进你的解释里，讲到点亮为止。';
    fb.innerHTML = chips + '<div class="feynman-score">覆盖度 ' + pct + '%（' + lit + '/' + keywords.length + '）· ' + msg + '</div>';
    var s = getState();
    s.feynman[(window.KP_CONF && window.KP_CONF.id) || ''] = { text: text, pct: pct, ts: Date.now() };
    saveState(s);
  }
  var timer = null;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(check, 400); });
  if (saved && saved.text) check();
  else fb.innerHTML = '<div class="feynman-score">在上方用大白话解释本知识点（假设听众是12岁孩子），关键词会自动点亮。</div>';
}

/* ---------------- 对外 API ---------------- */
var CX = {
  ready: loadIndex,
  index: function () { return INDEX; },
  findPoint: findPoint,
  pointFile: pointFile,
  getState: getState,
  saveState: saveState,
  markVisited: markVisited,
  recordTestResult: recordTestResult,
  sm2Update: sm2Update,
  dueList: dueList,
  addWrongAnswer: addWrongAnswer,
  bankQuestions: bankQuestions,
  getBank: getBank,
  renderQuiz: renderQuiz,
  renderCase: renderCase,
  makeAnim: makeAnim,
  setCap: setCap,
  depChain: depChain,
  bindFeynman: bindFeynman,
  cityMapSVG: cityMapSVG,
  touchDaily: touchDaily,
  shuffle: shuffle,
  esc: esc,
  el: el,
  utils: { $: $, $$: $$ },
  version: '1.0'
};
window.CityExam = CX;

/* ---------------- 详情页自动初始化 ---------------- */
document.addEventListener('DOMContentLoaded', function () {
  buildTopbar();
  touchDaily();
  var conf = window.KP_CONF;
  if (!conf || !conf.id) {
    if (typeof window.KP_BOOT === 'function') window.KP_BOOT(CX);
    return;
  }
  if (conf.id) markVisited(conf.id);
  /* 城市地图 */
  var mapEl = $('#city-map');
  if (mapEl) {
    mapEl.classList.add('citymap');
    mapEl.innerHTML = cityMapSVG(conf.loc || '');
    if (INDEX) {
      var d = INDEX.domains[conf.domain];
      if (d) mapEl.insertAdjacentHTML('beforeend', '<div class="map-loc">📍 你在：<b>' + esc(d.icon + ' ' + d.name) + '</b> —— ' + esc(d.blurb) + '</div>');
    }
  }
  /* TTS */
  buildTTSBar();
  /* 费曼 */
  var fey = $('#feynman-input');
  if (fey && conf.keywords && conf.keywords.length) bindFeynman('#feynman-input', conf.keywords, '#feynman-feedback');
  /* 上/下页导航 */
  var navEl = $('#kp-nav');
  if (navEl) {
    var html = '';
    if (conf.prev) html += '<a class="prev" href="' + conf.root + '/kp/' + conf.prev + '"><span class="dir">← 上一站</span>' + esc(conf.prevTitle || conf.prev) + '</a>';
    else html += '<a class="prev" href="' + conf.root + '/index.html"><span class="dir">← 从这里出发</span>🏠 返回城市地图</a>';
    if (conf.next) html += '<a class="next" href="' + conf.root + '/kp/' + conf.next + '"><span class="dir">下一站 →</span>' + esc(conf.nextTitle || conf.next) + '</a>';
    else html += '<a class="next" href="' + conf.root + '/review.html"><span class="dir">已经是最后一站 →</span>🔁 去复习中心巩固</a>';
    navEl.innerHTML = html;
  }
  /* 移动端底部快捷导航（仅详情页注入；样式仅 ≤768px 显示） */
  var qn = document.createElement('nav');
  qn.className = 'mobile-quicknav';
  var qnLink = function (href, icon, label, cls) {
    return '<a href="' + href + '"' + (cls ? ' class="' + cls + '"' : '') + '><span class="qi">' + icon + '</span><span>' + label + '</span></a>';
  };
  qn.innerHTML =
    (conf.prev ? qnLink(conf.root + '/kp/' + conf.prev, '⬅️', '上一站', 'qn-prev') : qnLink(conf.root + '/index.html', '⬅️', '起点', 'qn-prev')) +
    qnLink(conf.root + '/index.html', '🗺️', '城市地图') +
    qnLink(conf.root + '/review.html', '🔁', '复习') +
    qnLink(conf.root + '/graph.html', '🕸️', '图谱') +
    (conf.next ? qnLink(conf.root + '/kp/' + conf.next, '➡️', '下一站', 'qn-next') : qnLink(conf.root + '/review.html', '➡️', '去复习', 'qn-next'));
  document.body.appendChild(qn);

  if (typeof window.KP_BOOT === 'function') {
    try { window.KP_BOOT(CX); } catch (e) { console.error('KP_BOOT error:', e); }
  }
  /* PWA 注册（全站） */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var root2 = (conf && conf.root) || '.';
    navigator.serviceWorker.register(root2 + '/sw.js').catch(function () {});
  }
});
})();
