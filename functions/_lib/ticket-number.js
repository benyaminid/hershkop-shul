export function normalizeTicketNumber(value){
 const digits=String(value??"").replace(/\\D/g,"");
 return digits.replace(/^0+(?=\\d)/,"");
}
export async function readTicketNumber(env,image){
 if(!env?.AI)throw Error("AIUnavailable");
 const prompt="Read ONLY the large printed lottery ticket number in the center of the image. Ignore blank paper margins, cropped paper edges, shadows, background, emblem and Hebrew text. If the number is surrounded by wide white margins, mentally crop to the printed ticket area and inspect the center closely. Read the digits in order and preserve leading zeroes. Return a JSON object containing number as a string. If the digits cannot be read clearly, set number to null. Do not guess.";
 const result=await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct",{image,prompt,max_tokens:80,temperature:0});
 const raw=typeof result?.response==="string"?result.response:JSON.stringify(result?.response??result);
 const match=raw.match(/\\{[\\s\\S]*?\\}/);
 let parsed=null;
 if(match){try{parsed=JSON.parse(match[0])}catch{}}
 let number=normalizeTicketNumber(parsed?.number);
 if(!number){
  const direct=raw.match(/(?:number|ticket\\s*number|מספר(?:\\s*הכרטיס)?)\\s*["':=：-]*\\s*["']?([0-9]{1,10})/i);
  if(direct)number=normalizeTicketNumber(direct[1]);
 }
 return /^[0-9]{1,10}$/.test(number)?number:null;
}
