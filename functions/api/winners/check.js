const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
export async function onRequest({request,env}){
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  if(!env.AI)return json({error:"שירות סריקת הכרטיס אינו זמין כרגע."},503);
  const body=await request.json(),image=body?.image;
  if(typeof image!=="string"||!/^data:image\/(jpeg|png|webp);base64,/.test(image)||image.length>4000000)return json({error:"תמונת הכרטיס אינה תקינה או גדולה מדי."},400);
  const bytes=Uint8Array.from(atob(image.slice(image.indexOf(",")+1)),c=>c.charCodeAt(0));
  if(bytes.length<1000||bytes.length>2800000)return json({error:"יש לסרוק כרטיס ברור ובגודל קטן יותר."},400);
  const prompt="Read this lottery ticket. Return only JSON: {number:string, community_emblem:boolean, participation_text:boolean, whole_ticket_visible:boolean}. Copy the exact printed ticket number using digits only. The genuine ticket has a round black community emblem at the top and the Hebrew phrase השתתפתי באבות ובנים below the number. Do not guess unreadable digits. Set booleans true only when clearly visible.";
  const result=await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct",{image,prompt,max_tokens:140});
  const raw=typeof result?.response==="string"?result.response:JSON.stringify(result?.response??result),match=raw.match(/\{[\s\S]*\}/);
  if(!match)return json({error:"לא הצלחנו לקרוא את הכרטיס. נסה להציג אותו בצורה ברורה יותר."},422);
  let parsed;try{parsed=JSON.parse(match[0])}catch{return json({error:"לא הצלחנו לקרוא את הכרטיס."},422)}
  const number=String(parsed.number||"").replace(/\D/g,"");
  if(!/^[0-9]{1,10}$/.test(number)||parsed.community_emblem!==true||parsed.participation_text!==true||parsed.whole_ticket_visible!==true)return json({error:"הכרטיס לא זוהה בוודאות. ודא שכל הכרטיס, הסמל והכיתוב נראים בבירור."},422);
  const sr=await fetch(new URL("/site.json",request.url),{cache:"no-store"});if(!sr.ok)throw Error("LotteryHistoryUnavailable");
  const site=await sr.json(),history=site?.winners?.history;if(!Array.isArray(history))throw Error("LotteryHistoryInvalid");
  const cutoff=new Date(Date.now()-30*86400000),today=new Date();
  const wins=history.filter(x=>{const d=new Date(x.date+"T12:00:00");return d>=cutoff&&d<=today&&Array.isArray(x.nums)&&x.nums.map(String).includes(number)}).map(x=>({date:x.date,parsha:x.parsha}));
  return json({success:true,number,wins});
 }catch(e){console.error("Historical ticket check failed:",e?.message||"UnknownError");return json({error:"לא ניתן לבדוק כרגע. נסה שוב מאוחר יותר."},503)}
}