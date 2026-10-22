/* يخلي الموقع يشتغل مثل تطبيق على الموبايل.
   الصفحة والأسعار تجي من النت أول شي حتى تبقى محدثة، وإذا ماكو نت تطلع آخر نسخة محفوظة.
   الصور تطلع من المحفوظ حتى التطبيق يفتح بسرعة، وتتحدث بالخلفية. */
var CACHE = "swa-v1";

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(["./", "img/logo/logo-icon.svg", "img/mascot.webp"]); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (/\.(webp|png|jpe?g|svg)$/.test(u.pathname)){
    /* تطلع المحفوظة فوراً، وتتحدث من النت بالخلفية حتى إذا انبدلت صورة توصل للناس بالفتحة الجاية */
    var net = fetch(r).then(function(res){ if (res.ok){ var cp = res.clone(); caches.open(CACHE).then(function(c){ c.put(r, cp); }); } return res; });
    e.respondWith(caches.match(r).then(function(m){ if (m){ net.catch(function(){}); return m; } return net; }));
    return;
  }
  e.respondWith(fetch(r).then(function(res){
    if (res.ok){ var cp = res.clone(); caches.open(CACHE).then(function(c){ c.put(r, cp); }); }
    return res;
  }).catch(function(){
    return caches.match(r, { ignoreSearch: true }).then(function(m){ return m || (r.mode === "navigate" ? caches.match("./") : undefined); });
  }));
});
