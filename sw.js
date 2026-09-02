/* 架构师学堂 Service Worker：安装期预缓存全站（含 62 个知识点页），实现完整离线可用 */
var CACHE = 'architect-exam-v1';
var CORE = [
  './', './index.html', './review.html', './graph.html',
  './assets/style.css', './assets/app.js', './assets/kp-index.json',
  './manifest.webmanifest', './icon.svg',
  './kp/01-computer-overview.html',
  './kp/02-number-system.html',
  './kp/03-error-check.html',
  './kp/04-pipeline.html',
  './kp/05-cache-memory.html',
  './kp/06-reliability.html',
  './kp/07-io-interrupt.html',
  './kp/08-embedded-realtime.html',
  './kp/09-process-thread.html',
  './kp/10-pv-semaphore.html',
  './kp/11-deadlock.html',
  './kp/12-virtual-memory.html',
  './kp/13-fs-device.html',
  './kp/14-db-schema.html',
  './kp/15-er-model.html',
  './kp/16-sql-relalg.html',
  './kp/17-normalization.html',
  './kp/18-transaction.html',
  './kp/19-distributed-db.html',
  './kp/20-osi-tcpip.html',
  './kp/21-lan-vlan.html',
  './kp/22-ip-subnet.html',
  './kp/23-tcp-udp.html',
  './kp/24-app-protocols.html',
  './kp/25-process-models.html',
  './kp/26-requirements.html',
  './kp/27-dfd.html',
  './kp/28-coupling-cohesion.html',
  './kp/29-oo-basics.html',
  './kp/30-uml.html',
  './kp/31-testing.html',
  './kp/32-maintenance-cmm.html',
  './kp/33-arch-concepts.html',
  './kp/34-styles-dataflow.html',
  './kp/35-styles-indep-vm.html',
  './kp/36-styles-specific.html',
  './kp/37-csbs-tiers.html',
  './kp/38-microservices.html',
  './kp/39-cloud-native.html',
  './kp/40-middleware-eda.html',
  './kp/41-adl-docs.html',
  './kp/42-quality-attributes.html',
  './kp/43-quality-tactics.html',
  './kp/44-arch-evaluation.html',
  './kp/45-arch-evolution.html',
  './kp/46-principles-gof.html',
  './kp/47-creational.html',
  './kp/48-structural.html',
  './kp/49-behavioral.html',
  './kp/50-crypto.html',
  './kp/51-network-defense.html',
  './kp/52-attacks-malware.html',
  './kp/53-ip-rights.html',
  './kp/54-standards-contract.html',
  './kp/55-pm-framework.html',
  './kp/56-schedule-cpm.html',
  './kp/57-earned-value.html',
  './kp/58-ops-research.html',
  './kp/59-bigdata.html',
  './kp/60-ai-arch.html',
  './kp/61-iot-edge.html',
  './kp/62-blockchain.html'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fetching = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, clone); });
        }
        return resp;
      }).catch(function () { return hit; });
      return hit || fetching;
    })
  );
});
