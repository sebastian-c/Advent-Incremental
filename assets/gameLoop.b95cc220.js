import{_ as T,s as d,p as e,a as l,l as c,D as m,b as s,g as p}from"./index.154edd5d.js";import"./vue.e305c975.js";import{b1 as v}from"./@vue.359f7754.js";/* empty css                    */import"./nanoevents.1080beb7.js";import"./lz-string.f2f3b7cf.js";import"./is-plain-object.906d88e8.js";import"./vue-next-select.0b2b1d01.js";import"./vue-toastification.d643abb2.js";import"./@pixi.45135ab2.js";import"./eventemitter3.dc5195d7.js";import"./earcut.7c12e2a9.js";import"./url.5a27916e.js";import"./querystring.b35d81f8.js";import"./vuedraggable.96a532dc.js";import"./sortablejs.a0419146.js";import"./vue-textarea-autosize.35804eaf.js";let n=null,o=null;function r(){const t=Date.now();let i=(t-e.time)/1e3;e.time=t;const f=i;if(l.lastTenTicks.push(f),l.lastTenTicks.length>10&&(l.lastTenTicks=l.lastTenTicks.slice(1)),(o==null?void 0:o.value)&&!e.keepGoing||l.hasNaN||(i=Math.max(i,0),e.devSpeed===0))return;if(c.value=!1,e.offlineTime!=null){if(m.gt(e.offlineTime,s.offlineLimit*3600)&&(e.offlineTime=s.offlineLimit*3600),m.gt(e.offlineTime,0)&&e.devSpeed!==0){const u=Math.max(e.offlineTime/10,i);e.offlineTime=e.offlineTime-u,i+=u}else e.devSpeed===0&&(e.offlineTime+=i);(!e.offlineProd||m.lt(e.offlineTime,0))&&(e.offlineTime=null)}if(i=Math.min(i,s.maxTickLength),e.devSpeed!=null&&(i*=e.devSpeed),Number.isFinite(i)||(i=1e308),m.eq(i,0))return;e.timePlayed+=i,Number.isFinite(e.timePlayed)||(e.timePlayed=1e308);let a=f;for(;a>1;)p.emit("update",i/f,1),a--;p.emit("update",i*a/f,a),d.unthrottled?(requestAnimationFrame(r),n!=null&&(clearInterval(n),n=null)):n==null&&(n=setInterval(r,50))}async function M(){o=(await T(()=>import("./index.154edd5d.js").then(function(t){return t.c}),["assets/index.154edd5d.js","assets/index.fc2aa971.css","assets/@fontsource.c175eac8.css","assets/vue.e305c975.js","assets/earcut.7c12e2a9.js","assets/@vue.359f7754.js","assets/nanoevents.1080beb7.js","assets/lz-string.f2f3b7cf.js","assets/is-plain-object.906d88e8.js","assets/vue-next-select.0b2b1d01.js","assets/vue-next-select.9e6f4164.css","assets/vue-toastification.d643abb2.js","assets/vue-toastification.4b5f8ac8.css","assets/@pixi.45135ab2.js","assets/eventemitter3.dc5195d7.js","assets/url.5a27916e.js","assets/querystring.b35d81f8.js","assets/vuedraggable.96a532dc.js","assets/sortablejs.a0419146.js","assets/vue-textarea-autosize.35804eaf.js"])).hasWon,v(o,t=>{t&&p.emit("gameWon")}),d.unthrottled?requestAnimationFrame(r):n=setInterval(r,50)}export{M as startGameLoop};
