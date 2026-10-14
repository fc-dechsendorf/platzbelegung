import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
const ownerId='25f4325b-18d1-40ba-9645-8fec15ea5855';
const origin='https://fc-dechsendorf.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
 'Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
const url=Deno.env.get('SUPABASE_URL')||'';
const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const secret=keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const options={auth:{persistSession:false,autoRefreshToken:false}};
export const normalizeCode=(value:string)=>value.toUpperCase().replace(/[\s-]/g,'');
export async function hashCode(value:string) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${ownerId}:${normalizeCode(value)}`));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export function newCode() {
 // 128 random bits per code, no user-derived or predictable content.
 const value=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
 return value.match(/.{4}/g)!.join('-');
}
Deno.serve(async request=>{
 if(request.method==='OPTIONS') return reply(200,{});
 if(request.method!=='POST') return reply(405,{error:'Methode nicht erlaubt.'});
 try {
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  const admin=createClient(url,secret,options);
  // Claims are decoded only AFTER Auth verifies this exact bearer token.
  const identity=await admin.auth.getUser(token);
  if(identity.error||identity.data.user?.id!==ownerId||identity.data.user.app_metadata?.fcd_role!=='admin')
   return reply(403,{error:'Nur für dein Administratorkonto verfügbar.'});
  const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  const sid=claims.session_id;
  if(typeof sid!=='string'||! /^[0-9a-f-]{36}$/i.test(sid)) return reply(401,{error:'Sitzung ungültig.'});
  const body=await request.json();
  const control=async(action:string,hashes:string[]|null=null)=>{
   const result=await admin.rpc('owner_mfa_control',{p_user:ownerId,p_session:sid,p_action:action,p_hashes:hashes});
   if(result.error) throw new Error('Sicherheitsprüfung fehlgeschlagen. Bitte erneut anmelden.');
   return result.data;
  };
  if(body.action==='status') return reply(200,await control('status'));
  if(body.action==='codes'||body.action==='activate') {
   if(claims.aal!=='aal2') return reply(403,{error:'Bitte zuerst mit der Authenticator-App bestätigen.'});
   if(body.action==='activate') return reply(200,await control('activate'));
   const codes=Array.from({length:10},newCode);
   await control('codes',await Promise.all(codes.map(hashCode)));
   return reply(200,{codes});
  }
  if(body.action==='recover') {
   if(!(await control('attempt')).allowed) return reply(429,{error:'Zu viele Versuche. Bitte 15 Minuten warten.'});
   if(typeof body.password!=='string'||body.password.length>1024||typeof body.code!=='string'||
    !/^[0-9A-F]{32}$/.test(normalizeCode(body.code))) return reply(400,{error:'Passwort oder Wiederherstellungscode ungültig.'});
   const verifier=createClient(url,secret,options);
   const password=await verifier.auth.signInWithPassword({email:identity.data.user.email!,password:body.password});
   if(password.error||password.data.user?.id!==ownerId) return reply(400,{error:'Passwort oder Wiederherstellungscode ungültig.'});
   // This extra password-verification session is never returned to the browser.
   if(password.data.session) await admin.auth.admin.signOut(password.data.session.access_token,'local');
   const recovered=await control('recover',[await hashCode(body.code)]);
   if(!recovered.ok) return reply(400,{error:'Passwort oder Wiederherstellungscode ungültig.'});
   const factors=await admin.auth.admin.mfa.listFactors({userId:ownerId});
   if(factors.error) throw new Error('Wiederherstellung begonnen. Bitte technische Hilfe anfordern.');
   for(const factor of factors.data.factors) {
    const result=await admin.auth.admin.mfa.deleteFactor({userId:ownerId,id:factor.id});
    if(result.error) throw new Error('Wiederherstellung begonnen. Bitte technische Hilfe anfordern.');
   }
   return reply(200,{ok:true});
  }
  return reply(400,{error:'Unbekannte Aktion.'});
 } catch(error) { return reply(400,{error:error instanceof Error?error.message:'Anfrage fehlgeschlagen.'}); }
});
