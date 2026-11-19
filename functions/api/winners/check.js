const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
function normalizeTicketNumber(value){
 const digits=String(value??"").replace(/\D/g,"");
 return digits.replace(/^0{1,2}(?=\d)/,"");
}
async function findHistoricalWins(request,number){
 const sr=await fetch(new URL("/site.json",request.url),{cache:"no-store"});
 if(!sr.ok)throw Error("LotteryHistoryUnavailable");
 const site=await sr.json(),history=site?.winners?.history;
 if(!Array.isArray(history))throw Error("LotteryHistoryInvalid");
 const cutoff=new Date(Date.now()-30*86400000),today=new Date(),normalized=normalizeTicketNumber(number);
 return history.filter(x=>{
  const d=new Date(x.date+"T12:00:00");
  return d>=cutoff&&d<=today&&Array.isArray(x.nums)&&x.nums.some(n=>normalizeTicketNumber(n)===normalized);
 }).map(x=>({date:x.date,parsha:x.parsha}));
}
export async function onRequest({request,env}){
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const body=await request.json();
  if(typeof body?.number==="string"){
   const entered=body.number.trim();
   if(!/^[0-9]{1,10}$/.test(entered))return json({error:"יש להזין מספר תקין בן 1 עד 10 ספרות."},400);
   const number=normalizeTicketNumber(entered);
   if(!number)return json({error:"יש להזין מספר תקין."},400);
   const wins=await findHistoricalWins(request,number);
   return json({success:true,number,wins,manual:true});
  }
  if(!env.AI)return json({error:"שירות סריקת הכרטיס אינו זמין כרגע."},503);
  const image=body?.image;
  if(typeof image!=="string"||!/^data:image\/(jpeg|png|webp);base64,/.test(image)||image.length>4000000)return json({error:"תמונת הכרטיס אינה תקינה או גדולה מדי."},400);
  const bytes=Uint8Array.from(atob(image.slice(image.indexOf(",")+1)),c=>c.charCodeAt(0));
  if(bytes.length<1000||bytes.length>2800000)return json({error:"יש לסרוק כרטיס ברור ובגודל קטן יותר."},400);
  const prompt="Inspect the lottery ticket image. Read the exact printed number using digits only. Also verify whether the round black community emblem at the top is clearly visible, whether the exact Hebrew phrase השתתפתי באבות ובנים appears below the number, and whether the entire ticket is visible. Do not guess. Return ONLY one JSON object with exactly these keys: number (string), community_emblem (boolean), participation_text (boolean), whole_ticket_visible (boolean). If you cannot return JSON, return exactly four separate lines, one field per line: number: 123; community_emblem: true or false; participation_text: true or false; whole_ticket_visible: true or false. No explanations.";
  const result=await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct",{image,prompt,max_tokens:180,temperature:0});
  const raw=typeof result?.response==="string"?result.response:JSON.stringify(result?.response??result);
  const match=raw.match(/\{[\s\S]*\}/);
  let parsed=null;
  if(match){try{parsed=JSON.parse(match[0])}catch{}}
  if(!parsed){
   const lines=raw.split(/\r?\n/);
   const readLine=(labels)=>{const re=new RegExp("^\\s*[-*]?\\s*(?:"+labels+")\\s*[:=：-]\\s*(.+)$","i");return lines.map(line=>line.match(re)?.[1]?.trim()||"").find(Boolean)||""};
   const numberLine=readLine("number|ticket number|מספר הכרטיס|מספר");
   const boolValue=(value)=>{const v=String(value).replace(/[.,;].*$/,"").trim().toLowerCase();if(/^(true|yes|present|visible|כן|קיים|נראה)$/.test(v))return true;if(/^(false|no|absent|not visible|לא|לא קיים|לא נראה)$/.test(v))return false;return null};
   const emblemLine=readLine("community[_ ]emblem|emblem|סמל הקהילה|סמל");
   const phraseLine=readLine("participation[_ ]text|participation text|phrase|כיתוב השתתפתי|כיתוב");
   const wholeLine=readLine("whole[_ ]ticket[_ ]visible|whole ticket visible|entire ticket|כל הכרטיס");
   if(numberLine&&emblemLine&&phraseLine&&wholeLine)parsed={number:numberLine.replace(/\D/g,""),community_emblem:boolValue(emblemLine),participation_text:boolValue(phraseLine),whole_ticket_visible:boolValue(wholeLine)};
  }
  if(!parsed)return json({error:"לא הצלחנו לקרוא את הכרטיס. נסה להציג אותו בצורה ברורה יותר."},422);
  const number=normalizeTicketNumber(parsed.number);
  if(!/^[0-9]{1,10}$/.test(number)||parsed.community_emblem!==true||parsed.participation_text!==true||parsed.whole_ticket_visible!==true)return json({error:"הכרטיס לא זוהה בוודאות. ודא שכל הכרטיס, הסמל והכיתוב נראים בבירור."},422);
  const wins=await findHistoricalWins(request,number);
  return json({success:true,number,wins});
 }catch(e){console.error("Historical ticket check failed:",e?.message||"UnknownError");return json({error:"לא ניתן לבדוק כרגע. נסה שוב מאוחר יותר."},503)}
}
