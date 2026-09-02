/* 架构师学堂 Service Worker v6 —— 性能优化版
   策略（依 docs/perf/baseline.md 实测制定）：
   1. 安装期只预缓存外壳（≤300KB 预算达标）；kp 页在首次访问时运行时缓存；
   2. HTML 一律 network-first：保证学员正常刷新即见最新（离线才回退缓存）；
   3. 带版本资源 cache-first + 后台更新（stale-while-revalidate）；
   4. 音频按需缓存进独立 Cache，FIFO 上限 30MB，防存储无限膨胀。 */
var SHELL_CACHE = 'architect-shell-v7';
var PAGE_CACHE = 'architect-pages-v7';
var AUDIO_CACHE = 'architect-audio-v7';
var AUDIO_LIMIT = 30 * 1024 * 1024; /* 30MB */
var SHELL = [
  './', './index.html', './review.html', './graph.html',
  './assets/style.css', './assets/app.js', './assets/kp-index.json',
  './manifest.webmanifest', './icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== SHELL_CACHE && k !== PAGE_CACHE && k !== AUDIO_CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isAudio(url) { return url.pathname.indexOf('/audio/') >= 0; }

/* 缓存键规范化：同页面不同 query 视为同一资源，防缓存键膨胀 */
function pageKey(req) {
  var url = new URL(req.url);
  url.search = '';
  return url.href;
}

/* 音频 FIFO 上限：新增后从最旧的开始删，直到总量 ≤30MB */
function trimAudio(cache) {
  return cache.keys().then(function (keys) {
    var chain = Promise.resolve();
    var trimOne = function () {
      return Promise.all(keys.map(function (k) { return cache.match(k); })).then(function (rs) {
        var total = 0;
        rs.forEach(function (r) { if (r) total += (parseInt(r.headers.get('content-length') || '0', 10) || 0); });
        if (total <= AUDIO_LIMIT) return false;
        var oldest = keys.shift();
        return cache.delete(oldest).then(function () { return true; });
      });
    };
    /* 最多循环 keys.length 次，每次超限删一条 */
    var i = 0;
    function loop() {
      if (i++ > keys.length) return;
      return trimOne().then(function (deleted) { if (deleted) return loop(); });
    }
    return loop();
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* ① 页面导航：network-first，离线回退缓存（HTML 永远新鲜优先） */
  if (req.mode === 'navigate') {
    var key = pageKey(req);
    e.respondWith(
      fetch(req).then(function (resp) {
        var clone = resp.clone();
        caches.open(PAGE_CACHE).then(function (c) { c.put(key, clone); });
        return resp;
      }).catch(function () {
        return caches.match(key).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* ② 朗读音频：cache-first + 独立缓存 + 30MB FIFO 上限（首播联网，之后离线可听） */
  if (isAudio(url)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (resp) {
            if (resp && resp.ok) {
              cache.put(req, resp.clone());
              trimAudio(cache);
            }
            return resp;
          });
        });
      })
    );
    return;
  }

  /* ③ 外壳静态资源：cache-first + 后台更新（SWR） */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fetching = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var target = (url.pathname.indexOf('/kp/') >= 0) ? PAGE_CACHE : SHELL_CACHE;
          var clone = resp.clone();
          caches.open(target).then(function (c) { c.put(req, clone); });
        }
        return resp;
      }).catch(function () { return hit; });
      return hit || fetching;
    })
  );
});
