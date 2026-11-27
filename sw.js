const CACHE="hershkop-shul-v53";
const CORE=["./","./manifest.webmanifest"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match(event.request).then(response=>response||caches.match("./"))))});
self.addEventListener("push",event=>{event.waitUntil((async()=>{
  let messages=[];
  try{
    const sub=await self.registration.pushManager.getSubscription();
    if(sub){
      const response=await fetch("/api/push/inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({endpoint:sub.endpoint}),cache:"no-store"});
      if(response.ok){const data=await response.json();if(Array.isArray(data.messages))messages=data.messages}
    }
  }catch(e){}
  if(!messages.length)messages=[{cat:"general",title:"הרשקופ-שול",body:"יש עדכון חדש באתר",url:"/"}];
  if(messages.length>3)messages=[{cat:"general",title:"הרשקופ-שול",body:"יש "+messages.length+" עדכונים חדשים באתר",url:"/"}];
  await Promise.all(messages.map((m,i)=>self.registration.showNotification(String(m.title||"הרשקופ-שול"),{body:String(m.body||""),tag:(m.cat||"general")+"-"+i,dir:"rtl",lang:"he",data:{url:m.url||"/"}})));
})())});
self.addEventListener("notificationclick",event=>{event.notification.close();const target=new URL((event.notification.data&&event.notification.data.url)||"/",self.location.origin).href;event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{for(const client of list){if(client.url.startsWith(self.location.origin)&&"focus"in client){return client.focus().then(()=>"navigate"in client?client.navigate(target):null)}}return self.clients.openWindow(target)}))});
