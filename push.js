/*
 * Push notifications UI: a "🔔 התראות" button on the home page (under the rules button) that opens a settings dialog.
 * Loaded dynamically from popup.js. Per category: on/off, and "immediately" or "once a day at a chosen hour".
 * Server side: functions/api/push/*.js and functions/_lib/push.js. The service worker (sw.js) shows the notifications.
 */
(function(){
  if(window.__hsPush)return;
  window.__hsPush=1;
  var CATS=[
    {k:'lottery',l1:'הגרלת',l2:'אבות ובנים'},
    {k:'products',l1:'מוצרים',l2:'חדשים'},
    {k:'bulletin',l1:'פרסום',l2:'עלון חדש'},
    {k:'news',l1:'מודעות',l2:'ועדכונים'}
  ];
  var HOUR_MIN=5,HOUR_MAX=23,ITEM=40;
  var supported=('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
  var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

  var css=''
  +'#hs-push, #hs-push *{box-sizing:border-box}'
  +'#hs-push{position:fixed;inset:0;z-index:2100;display:flex;padding:12px;overflow:auto;background:rgba(14,22,48,.78);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);direction:rtl;font-family:"Heebo","Segoe UI",Arial,sans-serif}'
  +'#hs-push .pc{position:relative;margin:auto;width:100%;max-width:420px;overflow:hidden;background:linear-gradient(180deg,#fffdf7 0%,#fcefcf 100%);color:#2b2112;border:2px solid #e2b04a;border-radius:26px;padding:20px 14px 16px;box-shadow:0 24px 60px rgba(0,0,0,.55)}'
  +'#hs-push .hd{text-align:center;margin-bottom:14px}'
  +'#hs-push .xbtn{position:absolute;top:10px;left:10px;width:34px;height:34px;min-height:34px;padding:0;border-radius:50%;border:1.5px solid #cdb26a;background:#fff;color:#7a5b00;font-size:1.2rem;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.18)}'
  +'#hs-push h2{margin:0 0 4px;font-size:1.45rem;font-weight:800}'
  +'#hs-push p.sub{margin:0;font-size:.93rem;color:#6b5a35;line-height:1.5}'
  +'#hs-push .row{background:#fff;border:1.5px solid #efdca8;border-radius:16px;padding:12px 14px;margin:0 0 10px;transition:border-color .2s,background .2s}'
  +'#hs-push .row.on{border-color:#b8860b;background:#fffaf0}'
  +'#hs-push label.ck{display:flex;align-items:center;justify-content:center;gap:12px;font-weight:800;font-size:1.08rem;cursor:pointer}'
  +'#hs-push input[type=checkbox]{width:22px;height:22px;accent-color:#b8860b;flex:none;margin:0}'
  +'#hs-push .opt{display:none;margin:10px 0 0;padding:10px 0 0;border-top:1px dashed #e6cf94;font-size:.96rem}'
  +'#hs-push .row.on .opt{display:block}'
  +'#hs-push .opt label{display:flex;align-items:center;gap:10px;margin:6px 0;cursor:pointer}'
  +'#hs-push .opt label span{white-space:nowrap}'
  +'#hs-push .ct{display:block;text-align:center;white-space:normal;line-height:1.3}'
  +'#hs-push .opt input[type=radio]{width:18px;height:18px;accent-color:#b8860b;flex:none;margin:0}'
  +'#hs-push select.hr{display:none}'
  +'#hs-push .tp{display:flex;justify-content:center;width:100%;max-width:100%;margin:10px 0 4px;transition:opacity .2s,filter .2s}'
  +'#hs-push .tp.dis{opacity:.38;filter:grayscale(1)}'
  +'#hs-push .wbox{position:relative;flex:none;width:150px;max-width:100%;height:120px}'
  +'#hs-push .wheel{position:absolute;inset:0;overflow-y:auto;scroll-snap-type:y mandatory;border:1.5px solid #cdb26a;border-radius:16px;background:#fff;scrollbar-width:none;-ms-overflow-style:none;overscroll-behavior:contain}'
  +'#hs-push .wheel::-webkit-scrollbar{display:none}'
  +'#hs-push .wpad{height:40px}'
  +'#hs-push .it{height:40px;line-height:40px;scroll-snap-align:center;text-align:center;font-weight:700;font-size:1.1rem;color:#9a8a60;cursor:pointer;direction:ltr;user-select:none;-webkit-user-select:none}'
  +'#hs-push .it.sel{color:#2b2112;font-weight:800;font-size:1.3rem}'
  +'#hs-push .hl{position:absolute;left:6px;right:6px;top:40px;height:40px;border-top:2px solid #b8860b;border-bottom:2px solid #b8860b;background:rgba(201,151,28,.14);border-radius:8px;pointer-events:none}'
  +'#hs-push .tp.dis .wheel{pointer-events:none}'
  +'#hs-push .msg{min-height:1.3em;margin:6px 2px 0;font-size:.93rem;text-align:center;color:#2b2112;line-height:1.5}'
  +'#hs-push .msg.err{color:#b00020}'
  +'#hs-push .btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}'
  +'#hs-push button{font:inherit;font-weight:800;border-radius:14px;padding:12px 10px;cursor:pointer;border:2px solid #b8860b;background:#fff;color:#7a5b00;min-height:48px}'
  +'#hs-push button.pri{grid-column:1/-1;background:linear-gradient(135deg,#c9971c,#a87408);border-color:#a87408;color:#fff;font-size:1.05rem;box-shadow:0 6px 14px rgba(168,116,8,.35)}'
  +'#hs-push button.off{border-color:#d9a3a3;color:#9b2c2c}'
  +'#hs-push button:active{transform:scale(.98)}'
  +'#hs-push button:disabled{opacity:.5}'
  +'#hs-push .shab{margin:12px 0 0;font-size:.8rem;color:#6b5a35;text-align:center;white-space:nowrap}'
  +'#hs-push .shab strong{font-weight:800;color:#7a5b00}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function pad(h){return (h<10?'0':'')+h+':00'}
  function b64ToBytes(b){b=b.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';var r=atob(b),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o}
  function post(path,body){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||'שגיאה');return d})})}
  function getReg(){return Promise.race([navigator.serviceWorker.ready,new Promise(function(_,rej){setTimeout(function(){rej(new Error('האפליקציה עדיין לא מוכנה. נסו שוב בעוד רגע.'))},6000)})])}

  function openModal(){
    if(document.getElementById('hs-push'))return;
    var items='';for(var h=HOUR_MIN;h<=HOUR_MAX;h++)items+='<div class="it" data-h="'+h+'">'+pad(h)+'</div>';
    var opts='';for(var h2=HOUR_MIN;h2<=HOUR_MAX;h2++)opts+='<option value="'+h2+'"'+(h2===8?' selected':'')+'>'+pad(h2)+'</option>';
    var rows=CATS.map(function(c){
      return '<div class="row" data-k="'+c.k+'"><label class="ck"><input type="checkbox" class="on"><span class="ct">'+esc(c.l1)+'<br>'+esc(c.l2)+'</span></label>'
        +'<div class="opt"><label><input type="radio" name="m-'+c.k+'" value="now" checked><span>מיד כשמתעדכן באתר</span></label>'
        +'<label><input type="radio" name="m-'+c.k+'" value="daily"><span>פעם ביום בשעה:</span></label>'
        +'<div class="tp dis"><div class="wbox"><div class="wheel"><div class="wpad"></div>'+items+'<div class="wpad"></div></div><div class="hl"></div></div>'
        +'<select class="hr" disabled>'+opts+'</select></div></div></div>';
    }).join('');
    var warn='';
    if(!supported){
      warn=isIOS?'כדי לקבל התראות באייפון: פתחו את האתר בספארי, לחצו על שיתוף ← "הוסף למסך הבית", ופתחו את האתר מהאייקון שנוסף במסך הבית (נדרש iOS 16.4 ומעלה).':'הדפדפן הזה אינו תומך בהתראות מהאתר.';
    }else if(window.Notification&&Notification.permission==='denied'){
      warn='ההתראות חסומות בדפדפן עבור האתר. יש לאפשר אותן בהגדרות הדפדפן ואז לנסות שוב.';
    }
    var ov=document.createElement('div');
    ov.id='hs-push';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="pc"><button type="button" class="xbtn" id="hs-x" aria-label="סגירה">&times;</button><div class="hd"><h2>🔔 התראות מהאתר</h2><p class="sub">בחרו על מה לקבל התראה, ומתי.</p></div>'+rows
      +'<div class="msg'+(warn?' err':'')+'">'+esc(warn)+'</div>'
      +'<div class="btns"><button type="button" class="pri" id="hs-save">שמירה</button><button type="button" class="off" id="hs-off">כיבוי כל ההתראות</button><button type="button" id="hs-close">סגירה</button></div>'
      +'<p class="shab"><strong>לא יישלחו הודעות בשבתות וחגים (לפי שעון ישראל)</strong></p></div>';
    document.body.appendChild(ov);
    var msg=ov.querySelector('.msg');
    function say(t,err){msg.textContent=t;msg.className='msg'+(err?' err':'')}

    function markSel(row,h){
      [].forEach.call(row.querySelectorAll('.it'),function(it){it.classList.toggle('sel',Number(it.getAttribute('data-h'))===h)});
    }
    function syncWheel(row){
      var sel=row.querySelector('.hr'),w=row.querySelector('.wheel'),h=parseInt(sel.value,10);
      w.scrollTop=(h-HOUR_MIN)*ITEM;
      markSel(row,h);
    }
    function refreshDaily(row){
      var daily=row.querySelector('input[type=radio][value="daily"]').checked;
      var tp=row.querySelector('.tp');
      tp.classList.toggle('dis',!daily);
      row.querySelector('.hr').disabled=!daily;
      if(daily)setTimeout(function(){syncWheel(row)},0);
    }
    function refreshRow(row){
      row.classList.toggle('on',row.querySelector('.on').checked);
      refreshDaily(row);
    }

    [].forEach.call(ov.querySelectorAll('.row'),function(r){
      r.querySelector('.on').addEventListener('change',function(){refreshRow(r)});
      [].forEach.call(r.querySelectorAll('input[type=radio]'),function(rad){rad.addEventListener('change',function(){refreshDaily(r)})});
      var w=r.querySelector('.wheel'),timer=0;
      w.addEventListener('scroll',function(){
        clearTimeout(timer);
        timer=setTimeout(function(){
          var idx=Math.round(w.scrollTop/ITEM);
          idx=Math.max(0,Math.min(HOUR_MAX-HOUR_MIN,idx));
          var h=HOUR_MIN+idx;
          r.querySelector('.hr').value=String(h);
          markSel(r,h);
        },80);
      });
      [].forEach.call(r.querySelectorAll('.it'),function(it){
        it.addEventListener('click',function(){
          var h=Number(it.getAttribute('data-h'));
          w.scrollTo({top:(h-HOUR_MIN)*ITEM,behavior:'smooth'});
          r.querySelector('.hr').value=String(h);
          markSel(r,h);
        });
      });
      refreshRow(r);
    });

    function collect(){
      var prefs={};
      [].forEach.call(ov.querySelectorAll('.row'),function(r){
        var k=r.getAttribute('data-k');
        var mode=r.querySelector('input[type=radio]:checked');
        prefs[k]={on:r.querySelector('.on').checked,mode:mode?mode.value:'now',hour:parseInt(r.querySelector('.hr').value,10)};
      });
      return prefs;
    }
    function apply(prefs){
      [].forEach.call(ov.querySelectorAll('.row'),function(r){
        var p=prefs[r.getAttribute('data-k')];if(!p)return;
        r.querySelector('.on').checked=!!p.on;
        var rad=r.querySelector('input[type=radio][value="'+(p.mode==='daily'?'daily':'now')+'"]');if(rad)rad.checked=true;
        if(p.hour)r.querySelector('.hr').value=String(p.hour);
        refreshRow(r);
      });
    }
    function close(){if(ov.parentNode)ov.parentNode.removeChild(ov)}
    ov.addEventListener('click',function(e){if(e.target===ov)close()});
    ov.querySelector('#hs-close').addEventListener('click',close);
    ov.querySelector('#hs-x').addEventListener('click',close);

    if(supported){
      getReg().then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){
        if(sub)return post('/api/push/subscribe',{action:'get',endpoint:sub.endpoint}).then(function(d){if(d&&d.prefs)apply(d.prefs)});
      }).catch(function(){});
    }

    var save=ov.querySelector('#hs-save'),off=ov.querySelector('#hs-off');
    save.addEventListener('click',function(){
      if(!supported){say(warn,true);return}
      var prefs=collect();
      var any=Object.keys(prefs).some(function(k){return prefs[k].on});
      if(!any){say('לא נבחרה אף קטגוריה. כדי לכבות הכול לחצו על "כיבוי כל ההתראות".',true);return}
      save.disabled=true;say('שומר...');
      Notification.requestPermission().then(function(perm){
        if(perm!=='granted')throw new Error('לא ניתנה הרשאה להתראות.');
        return getReg();
      }).then(function(reg){
        return reg.pushManager.getSubscription().then(function(sub){
          if(sub)return sub;
          return fetch('/api/push/config',{cache:'no-store'}).then(function(r){return r.json().then(function(d){if(!r.ok||!d.publicKey)throw new Error(d.error||'ההתראות אינן זמינות כרגע');return d.publicKey})}).then(function(key){
            return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(key)});
          });
        });
      }).then(function(sub){
        return post('/api/push/subscribe',{action:'set',endpoint:sub.endpoint,prefs:prefs});
      }).then(function(){
        say('נשמר! ההתראות הופעלו.');
      }).catch(function(e){
        say((e&&e.message)||'לא ניתן להפעיל התראות כרגע.',true);
      }).then(function(){save.disabled=false});
    });
    off.addEventListener('click',function(){
      if(!supported){close();return}
      off.disabled=true;say('מכבה...');
      getReg().then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){
        if(!sub)return;
        return post('/api/push/subscribe',{action:'remove',endpoint:sub.endpoint}).then(function(){return sub.unsubscribe()});
      }).then(function(){
        apply({lottery:{on:false},products:{on:false},bulletin:{on:false},news:{on:false}});
        say('כל ההתראות כובו.');
      }).catch(function(e){say((e&&e.message)||'לא ניתן לכבות כרג.',true)}).then(function(){off.disabled=false});
    });
  }

  function inject(){
    var nb=document.getElementById('newsbtn');
    if(!nb||document.getElementById('pushbtn'))return;
    var b=document.createElement('a');
    b.id='pushbtn';b.className='newsbtn';b.href='#';
    b.textContent='🔔 התראות';
    b.style.marginTop='28px';
    b.addEventListener('click',function(e){e.preventDefault();openModal()});
    nb.insertAdjacentElement('afterend',b);
  }
  function start(){inject();setTimeout(inject,1500);setTimeout(inject,4000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
