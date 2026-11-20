/*
 * Banners: popup carousel on entry + the "מודעות ועדכונים" page (#updates) + a home-page button to it.
 * The banner list lives in banners.json (loaded at runtime). To add a banner: put the image in img/
 * and add an entry to banners.json: {id, type:'image'|'card', src, date:'YYYY-MM-DD', popup:true, w, h, alt}.
 *  - page "מודעות ועדכונים": all banners, newest (by date) on top.
 *  - popup: banners with popup:true, oldest first, slides right-to-left, dots at the bottom.
 *  - "אל תציג שוב": saved per banner (localStorage key hs-hide-<id>), per browser/device.
 * The nav link, the #updates section and the home button are injected here (index.html only loads this file).
 * To take everything down: remove the <script src="./popup.js"> tag from index.html.
 */
(function(){
  var BANNERS=[];
  // הצגת המודעה רק בכניסה לעמוד הראשי, ולא בקישורי עמודים פנימיים.
  var initialHash=window.location.hash||'';
  var showPopup=(initialHash===''||initialHash==='#home');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* per-banner "don't show again" (the old single key of the birth popup still counts for 'daughter') */
  function isHidden(id){
    try{
      if(localStorage.getItem('hs-hide-'+id)==='1')return true;
      if(id==='daughter'&&localStorage.getItem('mz-pop-hide-eliezer-daughter')==='1')return true;
    }catch(e){}
    return false;
  }
  function setHidden(id,v){
    try{
      if(v)localStorage.setItem('hs-hide-'+id,'1');
      else{localStorage.removeItem('hs-hide-'+id);if(id==='daughter')localStorage.removeItem('mz-pop-hide-eliezer-daughter')}
    }catch(e){}
  }

  var css=''
  +'.hs-frame{position:relative;border:3px solid #e2b04a;border-radius:30px;overflow:hidden;background:#fff;box-shadow:0 0 0 6px rgba(244,143,177,.38),0 24px 60px rgba(120,20,60,.5)}'
  +'.hs-pulse{animation:hspulse 5s ease-in-out infinite}'
  +'@keyframes hspulse{0%,100%{transform:scale(1)}50%{transform:scale(1.018)}}'
  +'.hs-track{display:flex;direction:ltr;will-change:transform}'
  +'.hs-slide{flex:0 0 100%;min-width:0;display:flex;direction:rtl}'
  +'.hs-card{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px 22px 24px;background:linear-gradient(160deg,#ffffff 0%,#fff0f6 52%,#ffdcea 100%);color:#5a1a3a;font-family:"Heebo","Segoe UI",Arial,sans-serif}'
  +'.hs-card::before{content:"";position:absolute;inset:8px;border:1.5px dashed rgba(226,176,74,.75);border-radius:22px;pointer-events:none}'
  +'.hs-bow{font-size:4.2rem;line-height:1;margin:2px 0 0;display:inline-block;animation:hsfloat 3s ease-in-out infinite;filter:drop-shadow(0 6px 8px rgba(160,30,90,.3))}'
  +'.hs-card h2{margin:6px 0 2px;font-size:2.5rem;font-weight:800;line-height:1.15;background:linear-gradient(90deg,#d81b78,#f06292 45%,#c9971c);-webkit-background-clip:text;background-clip:text;color:transparent}'
  +'.hs-s{margin:0 0 12px;font-size:1.45rem;font-weight:800;color:#7b1d4d}'
  +'.hs-b{margin:0 0 14px;font-size:1.02rem;line-height:1.6;color:#6b2a4a}'
  +'.hs-f{font-size:1.6rem;letter-spacing:6px;margin:0 0 6px}'
  +'.hs-ok{margin-top:10px;border:0;border-radius:999px;padding:12px 28px;font:inherit;font-weight:800;font-size:1.05rem;color:#fff;cursor:pointer;background:linear-gradient(135deg,#d81b78,#f06292);box-shadow:0 6px 16px rgba(216,27,120,.45)}'
  +'.hs-ok:active{transform:scale(.96)}'
  +'.hs-img{flex:1;display:flex;align-items:center;justify-content:center;background:#0b1740}'
  +'.hs-img img{display:block;max-width:100%;max-height:calc(100vh - 190px);max-height:calc(100dvh - 190px);width:auto;height:auto}'
  +'#mz-pop{position:fixed;inset:0;z-index:2000;display:flex;padding:20px;overflow:auto;background:rgba(60,10,40,.58);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);direction:rtl;opacity:0;transition:opacity .35s ease}'
  +'#mz-pop.show{opacity:1}'
  +'#mz-pop .hs-wrap{margin:auto;width:100%;max-width:380px;transform:scale(.6) translateY(30px);transition:transform .55s cubic-bezier(.2,1.4,.4,1)}'
  +'#mz-pop.show .hs-wrap{transform:none}'
  +'#mz-pop .hs-q{position:relative}'
  +'#mz-pop .hs-v{touch-action:pan-y}'
  +'#mz-pop .hs-x{position:absolute;top:10px;left:12px;z-index:3;width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#5a1a3a;font-size:1.3rem;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}'
  +'#mz-pop .hs-dots{display:flex;justify-content:center;gap:8px;margin:16px 0 0}'
  +'#mz-pop .hs-dots button{width:9px;height:9px;padding:0;border:0;border-radius:99px;background:rgba(255,255,255,.55);cursor:pointer;transition:width .3s,background .3s}'
  +'#mz-pop .hs-dots button.on{width:24px;background:#f3d58a}'
  +'#mz-pop .hs-h{display:flex;align-items:center;justify-content:center;gap:8px;margin:14px 0 0;font-size:.92rem;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);cursor:pointer;user-select:none;-webkit-user-select:none}'
  +'#mz-pop .hs-h input{width:20px;height:20px;margin:0;padding:0;accent-color:#d81b78;cursor:pointer;flex:none}'
  +'#mz-cf{position:fixed;inset:0;z-index:2001;pointer-events:none}'
  +'#updates .hs-updates-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),420px));justify-content:start;direction:rtl;gap:20px;align-items:start}'+'#updates .hs-pg{width:100%;max-width:420px;margin:0}'
  +'#updates .hs-img img{max-height:none;width:100%;height:auto}'+'@media(max-width:650px){#updates .hs-updates-grid{grid-template-columns:1fr;justify-content:center}#updates .hs-pg{margin:0 auto}}'
  +'@keyframes hsfloat{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-8px) rotate(4deg)}}'
  +'@media (prefers-reduced-motion:reduce){.hs-pulse,.hs-bow{animation:none!important}#mz-pop .hs-wrap{transition:none}}';
  var st=document.createElement('style');
  st.textContent=css;
  document.head.appendChild(st);

  function cardHtml(withBtn){
    return '<div class="hs-card">'
      +'<div class="hs-bow" aria-hidden="true">🎀</div>'
      +'<h2>מזל טוב!</h2>'
      +'<p class="hs-s">לאלעזר להולדת הבת</p>'
      +'<p class="hs-b">בשעה טובה ומוצלחת! שתזכו לגדלה לתורה, לחופה ולמעשים טובים, ולראות ממנה רוב נחת ושמחה.</p>'
      +'<div class="hs-f" aria-hidden="true">🌸👶🌸</div>'
      +(withBtn?'<button type="button" class="hs-ok">אמן, מזל טוב! 🎉</button>':'')
      +'</div>';
  }
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function bodyHtml(b,withBtn){
    if(b.type==='image')return '<div class="hs-img"><img src="'+esc(b.src)+'" alt="'+esc(b.alt||'')+'" width="'+(+b.w||720)+'" height="'+(+b.h||883)+'" draggable="false"></div>';
    return cardHtml(withBtn);
  }

  /* ---------- Home page: button to "מודעות ועדכונים" (same look as the rules button) ---------- */
  function injectHomeBtn(){
    var nb=document.getElementById('newsbtn');
    if(!nb||document.getElementById('updbtn'))return;
    var b=document.createElement('a');
    b.id='updbtn';
    b.className='newsbtn';
    b.href='#updates';
    b.textContent='מודעות ועדכונים';
    b.style.marginTop='28px';
    nb.insertAdjacentElement('beforebegin',b);
  }

  /* ---------- Page: "מודעות ועדכונים" (#updates) ---------- */
  function injectPage(){
    var nav=document.querySelector('nav'),main=document.querySelector('main');
    if(!nav||!main||document.getElementById('updates'))return;
    var a=document.createElement('a');
    a.href='#updates';
    a.setAttribute('data-p','updates');
    a.textContent='מודעות ועדכונים';
    var ref=nav.querySelector('a[data-p="links"]');
    if(ref&&ref.nextSibling)nav.insertBefore(a,ref.nextSibling);else nav.appendChild(a);

    var sec=document.createElement('section');
    sec.className='sec';
    sec.id='updates';
    var sorted=BANNERS.slice().sort(function(x,y){return x.date<y.date?1:x.date>y.date?-1:0});
    sec.innerHTML='<h1>מודעות ועדכונים</h1><div class="hs-updates-grid">'+sorted.map(function(b){
      return '<div class="hs-frame hs-pulse hs-pg" data-bid="'+esc(b.id)+'"><div class="hs-slide">'+bodyHtml(b,false)+'</div></div>';
    }).join('')+'</div>';
    main.appendChild(sec);
    [].forEach.call(sec.querySelectorAll('.hs-img img'),function(im){
      im.addEventListener('error',function(){var f=im.closest('.hs-pg');if(f&&f.parentNode)f.parentNode.removeChild(f)});
    });
    try{if((location.hash||'')==='#updates'&&typeof route==='function')route()}catch(e){}
  }

  /* ---------- Popup carousel ---------- */
  var cf=null,fired=false;
  function startConfetti(){
    if(reduce||cf)return;
    var cv=document.createElement('canvas');
    cv.id='mz-cf';
    document.body.appendChild(cv);
    var ctx=cv.getContext('2d'),dpr=window.devicePixelRatio||1,W=0,H=0,P=[],t0=Date.now(),raf=0,dead=false,tm=0;
    var cols=['#f06292','#ec407a','#ffffff','#f8bbd0','#e2b04a','#ffd54f','#ce93d8','#80deea'];
    function size(){W=window.innerWidth;H=window.innerHeight;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
    function mk(x,y,vx,vy){P.push({x:x,y:y,vx:vx,vy:vy,w:6+Math.random()*7,h:8+Math.random()*10,r:Math.random()*6.28,vr:(Math.random()-.5)*.35,c:cols[(Math.random()*cols.length)|0],round:Math.random()<.25,ph:Math.random()*6.28})}
    function burst(){for(var i=0;i<60;i++){mk(0,H,3+Math.random()*7,-(11+Math.random()*10));mk(W,H,-(3+Math.random()*7),-(11+Math.random()*10))}}
    function stop(){
      if(dead)return;dead=true;
      cancelAnimationFrame(raf);clearTimeout(tm);
      window.removeEventListener('resize',size);
      if(cv.parentNode)cv.parentNode.removeChild(cv);
      if(cf&&cf.stop===stop)cf=null;
    }
    size();
    window.addEventListener('resize',size);
    burst();
    tm=setTimeout(function(){if(!dead)burst()},1800);
    function frame(){
      if(dead)return;
      var el=Date.now()-t0;
      if(el<6500){for(var k=0;k<2;k++)mk(Math.random()*W,-20,(Math.random()-.5)*2,1+Math.random()*2)}
      ctx.clearRect(0,0,W,H);
      for(var i=P.length-1;i>=0;i--){
        var p=P[i];
        p.vy+=.12;if(p.vy>4.5)p.vy=4.5;
        p.vx*=.992;p.ph+=.05;
        p.x+=p.vx+Math.sin(p.ph)*.7;p.y+=p.vy;p.r+=p.vr;
        if(p.y>H+30){P.splice(i,1);continue}
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;
        if(p.round){ctx.beginPath();ctx.arc(0,0,p.w/2,0,6.283);ctx.fill()}
        else{ctx.scale(1,Math.abs(Math.cos(p.ph))*.8+.2);ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h)}
        ctx.restore();
      }
      if(el>=6500&&!P.length){stop();return}
      raf=requestAnimationFrame(frame);
    }
    cf={stop:stop};
    raf=requestAnimationFrame(frame);
  }
  function stopConfetti(){if(cf)cf.stop()}

  function loadOk(src){
    return new Promise(function(res){
      var done=false,im=new Image();
      var t=setTimeout(function(){if(!done){done=true;res(true)}},3000);
      im.onload=function(){if(!done){done=true;clearTimeout(t);res(true)}};
      im.onerror=function(){if(!done){done=true;clearTimeout(t);res(false)}};
      im.src=src;
    });
  }

  function openPopup(list){
    var n=list.length,cur=0,busy=false,closed=false,timer=0;

    var ov=document.createElement('div');
    ov.id='mz-pop';
    ov.setAttribute('role','dialog');
    ov.setAttribute('aria-modal','true');
    ov.setAttribute('aria-label','מודעות ועדכונים');
    var slides=list.map(function(b){return '<div class="hs-slide">'+bodyHtml(b,true)+'</div>'}).join('');
    if(n>1)slides+='<div class="hs-slide" aria-hidden="true">'+bodyHtml(list[0],true)+'</div>';
    var dots='';
    if(n>1){dots='<div class="hs-dots">';for(var i=0;i<n;i++)dots+='<button type="button" data-i="'+i+'" class="'+(i===0?'on':'')+'" aria-label="מודעה '+(i+1)+'"></button>';dots+='</div>'}
    ov.innerHTML='<div class="hs-wrap">'
      +'<div class="hs-q hs-pulse"><button type="button" class="hs-x" aria-label="סגירה">×</button>'
      +'<div class="hs-frame hs-v"><div class="hs-track">'+slides+'</div></div></div>'
      +dots
      +'<label class="hs-h"><input type="checkbox" class="hs-cb"><span>אל תציג שוב בהתחברויות הבאות</span></label>'
      +'</div>';
    var track=ov.querySelector('.hs-track'),dotEls=[].slice.call(ov.querySelectorAll('.hs-dots button')),cb=ov.querySelector('.hs-cb');

    function onShow(idx){
      dotEls.forEach(function(d,k){d.classList.toggle('on',k===idx)});
      if(cb)cb.checked=isHidden(list[idx].id);
      if(list[idx].type==='card'){if(!fired){fired=true;startConfetti()}}else stopConfetti();
    }
    function go(i,animate){
      cur=i;
      if(animate){void track.offsetWidth;track.style.transition='transform .65s cubic-bezier(.4,0,.2,1)'}
      else track.style.transition='none';
      track.style.transform='translateX('+(-100*i)+'%)';
      onShow(i%n);
    }
    function next(){
      if(busy||closed||n<2)return;
      busy=true;
      if(cur>=n-1){
        go(n,true);
        setTimeout(function(){go(0,false);void track.offsetWidth;busy=false},700);
      }else{
        go(cur+1,true);
        setTimeout(function(){busy=false},700);
      }
    }
    function prev(){
      if(busy||closed||cur<=0)return;
      busy=true;go(cur-1,true);
      setTimeout(function(){busy=false},700);
    }
    function schedule(ms){
      clearTimeout(timer);
      if(n<2)return;
      timer=setTimeout(function(){if(closed)return;next();schedule(6500)},ms);
    }
    function close(){
      if(closed)return;
      closed=true;
      clearTimeout(timer);
      document.removeEventListener('keydown',onKey);
      stopConfetti();
      ov.classList.remove('show');
      setTimeout(function(){if(ov.parentNode)ov.parentNode.removeChild(ov)},400);
    }
    function onKey(e){if(e.key==='Escape')close()}

    ov.addEventListener('click',function(e){
      var t=e.target,c=t.classList;
      if(t===ov||(c&&(c.contains('hs-x')||c.contains('hs-ok'))))close();
      else if(t.getAttribute&&t.getAttribute('data-i')!==null&&t.parentNode.classList.contains('hs-dots')){
        if(busy)return;
        var k=+t.getAttribute('data-i');
        if(k!==cur%n){busy=true;go(k,true);setTimeout(function(){busy=false},700)}
        schedule(10000);
      }
    });
    /* the checkbox belongs to the banner that is currently shown */
    ov.addEventListener('change',function(e){
      if(!e.target.classList||!e.target.classList.contains('hs-cb'))return;
      setHidden(list[cur%n].id,e.target.checked);
    });
    /* swipe: finger moving right-to-left = next banner */
    var sx=null,sy=null;
    var vp=ov.querySelector('.hs-v');
    vp.addEventListener('pointerdown',function(e){sx=e.clientX;sy=e.clientY;clearTimeout(timer)});
    vp.addEventListener('pointerup',function(e){
      if(sx===null)return;
      var dx=e.clientX-sx,dy=e.clientY-sy;sx=null;
      if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){if(dx<0)next();else prev();schedule(10000)}
      else schedule(8000);
    });
    vp.addEventListener('pointercancel',function(){sx=null;schedule(8000)});

    document.body.appendChild(ov);
    document.addEventListener('keydown',onKey);
    requestAnimationFrame(function(){requestAnimationFrame(function(){ov.classList.add('show')})});
    onShow(0);
    schedule(6500);
    var b=ov.querySelector('.hs-ok');if(b)try{b.focus({preventScroll:true})}catch(x){}
  }

  function loadBanners(){
    return fetch('/api/banners',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('banners api');return r.json()}).then(function(d){return Array.isArray(d.banners)?d.banners:[]}).catch(function(){return fetch('banners.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():[]}).then(function(d){return Array.isArray(d)?d:[]}).catch(function(){return[]})});
  }

  function start(){
    loadBanners().then(function(data){
      BANNERS=data.filter(function(b){return b&&b.id&&b.date});
      if(!BANNERS.length)return;
      injectPage();
      injectHomeBtn();
      if(!showPopup)return;
      var popupList=BANNERS.filter(function(b){return b.popup&&!isHidden(b.id)}).sort(function(x,y){return x.date<y.date?1:x.date>y.date?-1:0});
      return Promise.all(popupList.map(function(b){return b.type==='image'?loadOk(b.src):Promise.resolve(true)})).then(function(oks){
        var list=popupList.filter(function(b,i){return oks[i]});
        if(list.length)setTimeout(function(){openPopup(list)},350);
      });
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
