import { json, sameOrigin, isAdmin } from "../../_lib/admin-auth.js";
const MAX_SIZE=5*1024*1024;
const TYPES=new Set(["image/jpeg","image/png","image/webp","image/gif"]);
export async function onRequest({request,env}){
 if(!(await isAdmin(request,env)))return json({error:"נדרשת התחברות"},401);
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 if(!sameOrigin(request))return json({error:"Request rejected"},403);
 if(!env.PRODUCT_IMAGES)return json({error:"אחסון התמונות עדיין לא חובר ב-Cloudflare"},503);
 try{
  const form=await request.formData(),file=form.get("file");
  if(!file||typeof file.arrayBuffer!=="function")return json({error:"לא נבחר קובץ תמונה"},400);
  if(!TYPES.has(file.type))return json({error:"אפשר להעלות JPG, PNG, WEBP או GIF בלבד"},415);
  if(file.size<=0||file.size>MAX_SIZE)return json({error:"גודל התמונה חייב להיות עד 5MB"},413);
  const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"})[file.type];
  const key=crypto.randomUUID()+"."+ext;
  await env.PRODUCT_IMAGES.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:"public, max-age=31536000, immutable"}});
  return json({success:true,url:"/api/images/"+key});
 }catch(error){console.error("Image upload failed:",error?.message||"UnknownError");return json({error:"העלאת התמונה נכשלה"},502)}
}
