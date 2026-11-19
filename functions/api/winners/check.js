const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
function normalizeTicketNumber(value){
 const digits=String(value??"").replace(/\D/g,"");
 return digits.replace(/^0+(?=\d)/,"");
}
async function findHistoricalWins(request,number){
 const sr=await fetch(new URL("/site.json",request.url),{cache:"no-store"});
 if(!sr.ok)throw Error("LotteryHistoryUnavailable");
 const site=await sr.json(),history=site?.winners?.history;
 if(!Array.isArray(history))throw Error("LotteryHistoryInvalid");
 const now=new Date(),cutoff=new Date(now.getTime()-30*86400000),today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59,999),normalized=normalizeTicketNumber(number);
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
  const prompt = \`Read ONLY the large printed lottery ticket number in the center of the ticket. Ignore the emblem, Hebrew text, paper edges, background and all other details. Preserve leading zeroes. Return ONLY JSON with a string field named number, for example {"number":"123"}. If the number cannot be read clearly, return {"number":null}. Do not guess.\`;
  const result=await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct",{image,prompt,max_tokens:80,temperature:0});
  const raw=typeof result?.response==="string"?result.response:JSON.stringify(result?.response??result);
  const match=raw.match(/\{[\s\S]*?\}/);
  let parsed=null;
  if(match){try{parsed=JSON.parse(match[0])}catch{}}
  let number=normalizeTicketNumber(parsed?.number);
  if(!number){
   const direct=raw.match(/(?:number|ticket\s*number|מספר(?:\s*הכרטיס)?)\s*["':=：-]*\s*["']?([0-9]{1,10})/i);
   if(direct)number=normalizeTicketNumber(direct[1]);
  }
  if(!/^[0-9]{1,10}$/.test(number))return json({error:"לא הצלחנו לקרוא את מספר הכרטיס. נסה צילום חד יותר ומקרוב."},422);
  const wins=await findHistoricalWins(request,number);
  return json({success:true,number,wins});
 }catch(e){console.error("Historical ticket check failed:",e?.message||"UnknownError");return json({error:"לא ניתן לבדוק כרגע. נסה שוב מאוחר יותר."},503)}
}
