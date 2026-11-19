import { readTicketNumber } from "../../_lib/ticket-number.js";
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
  const number=await readTicketNumber(env,image);
  if(!number)return json({error:"לא הצלחנו לקרוא את מספר הכרטיס. נסה להתמקד במספר ולהימנע משוליים ריקים רחבים."},422);
  const wins=await findHistoricalWins(request,number);
  return json({success:true,number,wins});
 }catch(e){console.error("Historical ticket check failed:",e?.message||"UnknownError");return json({error:"לא ניתן לבדוק כרגע. נסה שוב מאוחר יותר."},503)}
}
