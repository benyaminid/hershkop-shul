/*
 * Push notifications UI: a "🔔 התראות" button on the home page (under the rules button) that opens a settings dialog.
 * Loaded dynamically from popup.js. Per category: on/off, and "immediately" or "once a day at a chosen hour".
 * Server side: functions/api/push/*.js and functions/_lib/push.js. The service worker (sw.js) shows the notifications.
 */
(function(){
  if(window.__hsPush)return;
  window.__hsPush=1;
  var CATS=[
    {k:'lottery',t:'הגרלה שבוצעה'},
    {k:'products',t:'מוצרים חדשים'},
    {k:'bulletin',t:'עלון חדש'},
    {k:'news',t:'הודעות'}
  ];
  var supported=('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
  var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

  var css=''
  +'#hs-push{position:fixed;inset:0;z-index:2100;display:flex;padding:16px;overflow:auto;background:rgba(14,22,48,.78);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);direction:rtl;font-family:"Heebo","Segoe UI",Arial,sans-serif}'
  +'#hs-push .pc{margin:auto;width:100%;max-width:420px;background:linear-gradient(180deg,#fffdf7 0%,#fcefcf 100%);color:#2b2112;border:2px solid #e2b04a;border-radius:26px;padding:22px 18px 18px;box-shadow:0 24px 60px rgba(0,0,0,.55)}'
  +'#hs-push .hd{text-align:center;margin-bottom:14px}'
  +'#hs-push h2{margin:0 0 4px;font-size:1.45rem;font-weight:800}'
  +'#hs-push p.sub{margin:0;font-size:.93rem;color:#6b5a35;line-height:1.5}'
  +'#hs-push .row{background:#fff;border:1.5px solid #efdca8;border-radius:16px;padding:12px 14px;margin:0 0 10px;transition:border-color .2s,background .2s}'
  +'#hs-push .row.on{border-color:#b8860b;background:#fffaf0}'
  +'#hs-push label.ck{display:flex;align-items:center;gap:12px;font-weight:800;font-size:1.08rem;cursor:pointer}'
  +'#hs-push input[type=checkbox]{width:22px;height:22px;accent-color:#b8860b;flex:none;margin:0}'
  +'#hs-push .opt{display:none;margin:10px 0 0;padding:10px 0 0;border-top:1px dashed #e6cf94;font-size:.96rem}'
  +'#hs-push .row.on .opt{display:block}'
  +'#hs-push .opt label{display:flex;align-items:center;gap:10px;margin:6px 0;cursor:pointer}'
  +'#hs-push .opt label span{white-space:nowrap}'
  +'#hs-push .opt input[type=radio]{width:18px;height:18px;accent-color:#b8860b;flex:none;margin:0}'
  +'#hs-push .hrw{margin:2px 28px 4px 0}'
  +'#hs-push select{font:inherit;padding:5px 10px;border-radius:10px;border:1.5px solid #cdb26a;background:#fff;color:#2b2112;min-width:110px}'
  +'#hs-push .msg{min-height:1.3em;margin:6px 2px 0;font-size:.93rem;text-align:center;color:#2b2112;line-height:1.5}'
  +'#hs-push .msg.err{color:#b00020}'
  +'#hs-push .btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}'
  +'#hs-push button{font:inherit;font-weight:800;border-radius:14px;padding:12px 10px;cursor:pointer;border:2px solid #b8860b;background:#fff;color:#7a5b00;min-height:48px}'
  +'#hs-push button.pri{grid-column:1/-1;background:linear-gradient(135deg,#c9971c,#a87408);border-color:#a87408;color:#fff;font-size:1.05rem;box-shadow:0 6px 14px rgba(168,116,8,.35)}'
  +'#hs-push button.off{border-color:#d9a3a3;color:#9b2c2c}'
  +'#hs-push button:active{transform:scale(.98)}'
  +'#hs-push button:disabled{opacity:.5}'
  +'#hs-push .shab{margin:14px 4px 0;font-size:.85rem;color:#6b5a35;text-align:center;line-height:1.5}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function b64ToBytes(b){b=b.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';var r=atob(b),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o}
  function post(path,body){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||'שגיאה');return d})})}
  function getReg(){return Promise.race([navigator.serviceWorker.ready,new Promise(function(_,rej){setTimeout(function(){rej(new Error('האפליקציה עדיין לא מוכנה. נסו שוב בעוד רגע.'))},6000)})])}

  function openModal(){
    if(document.getElementById('hs-push'))return;
    var hours='';for(var h=5;h<=23;h++)hours+='<option value="'+h+'"'+(h===8?' selected':'')+'>'+(h<10?'0':'')+h+':00</option>';
    var rows=CATS.map(function(c){
      return '<div class="row" data-k="'+c.k+'"><label class="ck"><input type="checkbox" class="on"><span>'+esc(c.t)+'</span></label>'
        +'<div class="opt"><label><input type="radio" name="m-'+c.k+'" value="now" checked><span>מיד כשמתעדכן באתר</span></label>'
        +'<label><input type="radio" name="m-'+c.k+'" value="daily"><span>פעם ביום בשעה:</span></label>'
        +'<div class="hrw"><select class="hr">'+hours+'</select></div></div></div>';
    }).join('');
    var warn='';
    if(!supported){
      warn=isIOS?'כדי לקבל התראות באייפון: פתחו את האתר בספארי, לחצו על שיתוף ← "הוסף למסך הבית", ופתחו את האתר מהאייקון שנוסף במסך הבית (נדרש iOS 16.4 ומעלה).':'הדפדפן הזה אינו תומך בהתראות מהאתר.';
    }else if(window.Notification&&Notification.permission==='denied'){
      warn='ההתראות חסומות בדפדפן עבור האתר. יש לאפשר אותן בהגדרות הדפדפן ואז לנסות שוב.';
    }
    var ov=document.createElement('div');
    ov.id='hs-push';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="pc"><div class="hd"><h2>🔔 התראות מהאתר</h2><p class="sub">בחרו על מה לקבל התראה, ומתי.</p></div>'+rows
      +'<div class="msg'+(warn?' err':'')+'">'+esc(warn)+'</div>'
      +'<div class="btns"><button type="button" class="pri" id="hs-save">שמירה</button><button type="button" class="off" id="hs-off">כיבוי כל ההתראות</button><button type="button" id="hs-close">סגירה</button></div>'
      +'<p class="shab">בשבת לא יישלחו התראות (משישי אחר הצהריים עד מוצאי שבת). עדכונים שיתופרסמו בזמן זה יישלחו במוצאי שבת.</p></div>';
    document.body.appendChild(ov);
    var msg=ov.querySelector('.msg');
    function say(t,err){msg.textContent=t;msg.className='msg'+(err?' err':'')}
    function refreshRow(row){row.classList.toggle('on',row.querySelector('.on').checked)}
    [].forEach.call(ov.querySelectorAll('.row'),function(r){r.querySelector('.on').addEventListener('change',function(){refreshRow(r)})});
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
      }).catch(function(e){say((e&&e.message)||'לא ניתן לכבות כרגע.',true)}).then(function(){off.disabled=false});
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
