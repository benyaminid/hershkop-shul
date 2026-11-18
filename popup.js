/* Congratulations popup + confetti (Eliezer – birth of a daughter). Remove this file and its <script> tag in index.html to take it down. */
(function(){
  var KEY='mz-pop-hide-eliezer-daughter';
  try{if(localStorage.getItem(KEY)==='1')return}catch(e){}
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css=''
  +'#mz-pop{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(60,10,40,.58);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);direction:rtl;opacity:0;transition:opacity .35s ease}'
  +'#mz-pop.show{opacity:1}'
  +'#mz-pop .mzc{position:relative;width:100%;max-width:380px;text-align:center;padding:30px 22px 24px;border-radius:30px;background:linear-gradient(160deg,#ffffff 0%,#fff0f6 52%,#ffdcea 100%);border:3px solid #e2b04a;box-shadow:0 0 0 6px rgba(244,143,177,.38),0 24px 60px rgba(120,20,60,.5);color:#5a1a3a;font-family:"Heebo","Segoe UI",Arial,sans-serif;transform:scale(.6) translateY(30px);transition:transform .55s cubic-bezier(.2,1.4,.4,1);overflow:hidden}'
  +'#mz-pop.show .mzc{transform:none}'
  +'#mz-pop .mzc::before{content:"";position:absolute;inset:8px;border:1.5px dashed rgba(226,176,74,.75);border-radius:22px;pointer-events:none}'
  +'#mz-pop .mzx{position:absolute;top:10px;left:12px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(90,26,58,.1);color:#5a1a3a;font-size:1.3rem;line-height:1;cursor:pointer;z-index:2}'
  +'#mz-pop .mzbow{font-size:4.2rem;line-height:1;margin:2px 0 0;display:inline-block;animation:mzfloat 3s ease-in-out infinite;filter:drop-shadow(0 6px 8px rgba(160,30,90,.3))}'
  +'#mz-pop h2{margin:6px 0 2px;font-size:2.5rem;font-weight:800;line-height:1.15;background:linear-gradient(90deg,#d81b78,#f06292 45%,#c9971c);-webkit-background-clip:text;background-clip:text;color:transparent}'
  +'#mz-pop .mzs{margin:0 0 12px;font-size:1.45rem;font-weight:800;color:#7b1d4d}'
  +'#mz-pop .mzb{margin:0 0 14px;font-size:1.02rem;line-height:1.6;color:#6b2a4a}'
  +'#mz-pop .mzf{font-size:1.6rem;letter-spacing:6px;margin:0 0 16px}'
  +'#mz-pop .mzok{border:0;border-radius:999px;padding:12px 28px;font:inherit;font-weight:800;font-size:1.05rem;color:#fff;cursor:pointer;background:linear-gradient(135deg,#d81b78,#f06292);box-shadow:0 6px 16px rgba(216,27,120,.45)}'
  +'#mz-pop .mzok:active{transform:scale(.96)}'
  +'#mz-pop .mzh{display:flex;align-items:center;justify-content:center;gap:8px;margin:14px 0 0;font-size:.92rem;color:#6b2a4a;cursor:pointer;user-select:none;-webkit-user-select:none}'
  +'#mz-pop .mzh input{width:20px;height:20px;margin:0;padding:0;accent-color:#d81b78;cursor:pointer;flex:none}'
  +'#mz-cf{position:fixed;inset:0;z-index:2001;pointer-events:none}'
  +'@keyframes mzfloat{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-8px) rotate(4deg)}}'
  +'@media (prefers-reduced-motion:reduce){#mz-pop .mzbow{animation:none!important}#mz-pop .mzc{transition:none}}';

  var st=document.createElement('style');
  st.textContent=css;
  document.head.appendChild(st);

  var ov=document.createElement('div');
  ov.id='mz-pop';
  ov.setAttribute('role','dialog');
  ov.setAttribute('aria-modal','true');
  ov.setAttribute('aria-label','מזל טוב להולדת הבת');
  ov.innerHTML=''
    +'<div class="mzc">'
    +'<button type="button" class="mzx" aria-label="סגירה">×</button>'
    +'<div class="mzbow" aria-hidden="true">🎀</div>'
    +'<h2>מזל טוב!</h2>'
    +'<p class="mzs">לאלעזר להולדת הבת</p>'
    +'<p class="mzb">בשעה טובה ומוצלחת! שתזכו לגדל אותה לתורה, לחופה ולמעשים טובים, ולראות ממנה רוב נחת ושמחה.</p>'
    +'<div class="mzf" aria-hidden="true">🌸👶🌸</div>'
    +'<button type="button" class="mzok">אמן, תודה! 🎉</button>'
    +'<label class="mzh"><input type="checkbox" class="mzcb"><span>אל תציגו לי שוב את ההודעה</span></label>'
    +'</div>';

  var cv=null,raf=0,closed=false;

  function confetti(){
    if(reduce)return;
    cv=document.createElement('canvas');
    cv.id='mz-cf';
    document.body.appendChild(cv);
    var ctx=cv.getContext('2d'),dpr=window.devicePixelRatio||1,W=0,H=0,P=[],t0=Date.now();
    var cols=['#f06292','#ec407a','#ffffff','#f8bbd0','#e2b04a','#ffd54f','#ce93d8','#80deea'];
    function size(){W=window.innerWidth;H=window.innerHeight;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
    function mk(x,y,vx,vy){P.push({x:x,y:y,vx:vx,vy:vy,w:6+Math.random()*7,h:8+Math.random()*10,r:Math.random()*6.28,vr:(Math.random()-.5)*.35,c:cols[(Math.random()*cols.length)|0],round:Math.random()<.25,ph:Math.random()*6.28})}
    function burst(){
      for(var i=0;i<60;i++){
        mk(0,H,3+Math.random()*7,-(11+Math.random()*10));
        mk(W,H,-(3+Math.random()*7),-(11+Math.random()*10));
      }
    }
    size();
    window.addEventListener('resize',size);
    burst();
    setTimeout(function(){if(!closed)burst()},1800);
    function frame(){
      var el=Date.now()-t0;
      if(el<6500){for(var k=0;k<2;k++)mk(Math.random()*W,-20,(Math.random()-.5)*2,1+Math.random()*2)}
      ctx.clearRect(0,0,W,H);
      for(var i=P.length-1;i>=0;i--){
        var p=P[i];
        p.vy+=.12;if(p.vy>4.5)p.vy=4.5;
        p.vx*=.992;
        p.ph+=.05;
        p.x+=p.vx+Math.sin(p.ph)*.7;
        p.y+=p.vy;
        p.r+=p.vr;
        if(p.y>H+30){P.splice(i,1);continue}
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.rotate(p.r);
        ctx.fillStyle=p.c;
        if(p.round){ctx.beginPath();ctx.arc(0,0,p.w/2,0,6.283);ctx.fill()}
        else{ctx.scale(1,Math.abs(Math.cos(p.ph))*.8+.2);ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h)}
        ctx.restore();
      }
      if(closed)return;
      if(el>=6500&&!P.length){stop();return}
      raf=requestAnimationFrame(frame);
    }
    function stop(){
      cancelAnimationFrame(raf);
      window.removeEventListener('resize',size);
      if(cv&&cv.parentNode)cv.parentNode.removeChild(cv);
      cv=null;
    }
    cv._stop=stop;
    raf=requestAnimationFrame(frame);
  }

  function close(){
    if(closed)return;
    closed=true;
    document.removeEventListener('keydown',onKey);
    if(cv&&cv._stop)cv._stop();
    ov.classList.remove('show');
    setTimeout(function(){if(ov.parentNode)ov.parentNode.removeChild(ov)},400);
  }
  function onKey(e){if(e.key==='Escape')close()}

  ov.addEventListener('click',function(e){
    if(e.target===ov||(e.target.classList&&(e.target.classList.contains('mzx')||e.target.classList.contains('mzok'))))close();
  });
  ov.addEventListener('change',function(e){
    if(!e.target.classList||!e.target.classList.contains('mzcb'))return;
    try{
      if(e.target.checked)localStorage.setItem(KEY,'1');
      else localStorage.removeItem(KEY);
    }catch(x){}
  });

  function open(){
    document.body.appendChild(ov);
    document.addEventListener('keydown',onKey);
    requestAnimationFrame(function(){requestAnimationFrame(function(){ov.classList.add('show')})});
    confetti();
    var b=ov.querySelector('.mzok');if(b)try{b.focus({preventScroll:true})}catch(x){}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(open,350)});
  else setTimeout(open,350);
})();
