import { json, sameOrigin, isAdmin } from "../_lib/admin-auth.js";

const KEY="site-banners.json";
const MAX_BANNERS=100;
function validBanner(b){
  if(!b||typeof b!=="object"||Array.isArray(b))return false;
  if(typeof b.id!=="string"||!b.id||b.id.length>100)return false;
  if(b.type==="card")return b.id==="daughter";
  return b.type==="image"&&typeof b.src==="string"&&/^\/api\/images\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/i.test(b.src)
    &&typeof b.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(b.date)
    &&(b.alt===undefined||typeof b.alt==="string")&&(b.popup===undefined||typeof b.popup==="boolean");
}
export async function onRequest({request,env}){
  if(request.method==="GET"){
    if(env.PRODUCT_IMAGES){
      try{const obj=await env.PRODUCT_IMAGES.get(KEY);if(obj){const data=JSON.parse(await obj.text());return json({banners:Array.isArray(data)?data:[]})}}
      catch{return json({error:"לא ניתן לקרוא את המודעות"},502)}
    }
    try{const url=new URL("/banners.json",request.url);const res=await fetch(url);if(res.ok){const data=await res.json();return json({banners:Array.isArray(data)?data:[]})}}
    catch{}
    return json({banners:[]});
  }
  if(request.method!=="PUT")return json({error:"Method not allowed"},405);
  if(!(await isAdmin(request,env)))return json({error:"נדרשת התחברות"},401);
  if(!sameOrigin(request))return json({error:"Request rejected"},403);
  if(!env.PRODUCT_IMAGES)return json({error:"אחסון התמונות עדיין לא חובר"},503);
  try{
    const body=await request.json(),banners=body?.banners;
    if(!Array.isArray(banners)||banners.length>MAX_BANNERS||!banners.every(validBanner))return json({error:"רשימת המודעות אינה תקינה"},400);
    const clean=banners.map(b=>b.type==="card"?b:{id:b.id,type:"image",src:b.src,date:b.date,popup:b.popup===true,w:Number(b.w)||0,h:Number(b.h)||0,alt:String(b.alt||"").slice(0,180)});
    await env.PRODUCT_IMAGES.put(KEY,JSON.stringify(clean),{httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"no-store"}});
    return json({success:true,banners:clean});
  }catch(error){console.error("Banner save failed:",error?.message||"UnknownError");return json({error:"לא ניתן לשמור את המודעות"},502)}
}
