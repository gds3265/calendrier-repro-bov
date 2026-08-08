const CACHE='repro-bovine-v1-3';
const ASSETS=['./','./index.html','./styles.css','./app.js','./initial-data.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
self.addEventListener('push',e=>{let data={};try{data=e.data?e.data.json():{}}catch(_){data={body:e.data?e.data.text():''}};e.waitUntil(self.registration.showNotification(data.title||'Repro Bovine',{body:data.body||'Nouvelle alerte reproduction',icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:data.tag||'repro-bovine-push',data:{url:data.url||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification.data?.url||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{for(const w of ws){if('focus'in w){w.navigate(url);return w.focus()}}return clients.openWindow?clients.openWindow(url):null}))});
