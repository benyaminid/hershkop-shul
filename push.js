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
    {k:'news',t:'הודעות',note:'ההודעות נשלחות במקביל גם לקבוצת הוואטסאפ של הקהילה, ולכן ההתראה לא רלוונטית למי שעוקב אחרי הקבוצה.'}
  ];
  var supported=('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
  var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

  var css=''
  +'#hs-push{position:fixed;inset:0;z-index:2100;display:flex;padding:16px;overflow:auto;background:rgba(0,0,0,.6);direction:rtl;font-family:"Heebo","Segoe UI",Arial,sans-serif}'
  +'#hs-push .pc{margin:auto;width:100%;max-width:420px;background:#fff;color:#222;border:3px solid #e2b04a;border-radius:22px;padding:20px 18px;box-shadow:0 20px 50px rgba(0,0,0,.5)}'
  +'#hs-push h2{margin:0 0 6px;font-size:1.4rem}'
  +'#hs-push p.sub{margin:0 0 14px;font-size:.92rem;color:#555;line-height:1.5}'
  +'#hs-push .row{border-top:1px solid #eee;padding:10px 0}'
  +'#hs-push label.ck{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.05rem;cursor:pointer}'
  +'#hs-push input[type=checkbox]{width:22px;height:22px;accent-color:#b8860b;flex:none}'
  +'#hs-push .opt{margin:8px 32px 0 0;display:none;font-size:.95rem}'
  +'#hs-push .row.on .opt{display:block}'
  +'#hs-push .opt label{display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer}'
  +'#hs-push select{font:inherit;padding:2px 6px;border-radius:8px;border:1px solid #bbb}'
  +'#hs-push .note{margin:8px 32px 0 0;font-size:.82rem;color:#7a5b00;line-height:1.4}'
  +'#hs-push .msg{min-height:1.2em;margin:12px 0 0;font-size:.92rem;color:#333;line-height:1.5}'
  +'#hs-push .msg.err{color:#b00020}'
  +'#hs-push .btns{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}'
  +'#hs-push button{font:inherit;font-weight:800;border-radius:999px;padding:11px 18px;cursor:pointer;border:2px solid #b8860b;background:#fff;color:#7a5b00;flex:1}'
  +'#hs-push button.pri{background:#b8860b;color:#fff}'
  +'#hs-push button:disabled{opacity:.5}';
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
        +'<label><input type="radio" name="m-'+c.k+'" value="daily"><span>פעם ביום בשעה</span><select class="hr">'+hours+'</select></label></div>'
        +(c.note?'<div class="note" style="display:none">'+esc(c.note)+'</div>':'')+'</div>';
    }).join('');
    var warn='';
    if(!supported){
      warn=isIOS?'כדי לקבל התראות באייפון: פתחו את האתר בספארי, לחצו על שיתוף ← "הוסף למסך הבית", ופתחו את האתר מהאייקון שנוסף במסך הבית (נדרש iOS 16.4 ומעלה).':'הדפדפן הזה אינו תומך בהתראות מהאתר.';
    }else if(window.Notification&&Notification.permission==='denied'){
      warn='ההתראות חסומות בדפדפן עבור האתר. יש לאפשר אותן בהגדרות הדפדפן ואז לנסות שוב.';
    }
    var ov=document.createElement('div');
    ov.id='hs-push';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="pc"><h2>🔔 התראות מהאתר</h2><p class="sub">בחרו על מה לקבל התראה, ומתי.</p>'+rows
      +'<div class="msg'+(warn?' err':'')+'">'+esc(warn)+'</div>'
      +'<div class="btns"><button type="button" class="pri" id="hs-save">שמירה</button><button type="button" id="hs-off">כיבוי כל ההתראות</button><button type="button" id="hs-close">סגירה</button></div></div>';
    document.body.appendChild(ov);
    var msg=ov.querySelector('.msg');
    function say(t,err){msg.textContent=t;msg.className='msg'+(err?' err':'')}
    function refreshRow(row){
      var on=row.querySelector('.on').checked;
      row.classList.toggle('on',on);
      var n=row.querySelector('.note');if(n)n.style.display=on?'block':'none';
    }
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
