import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { skillTaxonomy } from "../../app/lib/skill-taxonomy";

const database=process.env.TEST_DATABASE_URL;
if (!database || process.env.ALLOW_INTEGRATION_TEST_DATABASE!=="true") throw new Error("Explicit isolated DB required");
const target=new URL(database);
if (!["127.0.0.1","localhost","[::1]"].includes(target.hostname) || target.pathname!=="/toeic_release_test" || process.env.NODE_ENV==="production") throw new Error("Only isolated loopback DB accepted");
process.env.DATABASE_URL=database;
process.env.MOBILE_JWT_SECRET="integration-only-skill-editor-credential";
const admin=randomUUID(), learner=randomUUID(), reviewer=randomUUID(), legacy=randomUUID();
const questions:string[]=[];
let prisma:PrismaClient;
let route:typeof import("../../app/api/v1/admin/questions/[id]/skills/route");
let existingNames:string[]=[];
before(async()=>{
  prisma=(await import("../../app/lib/prisma")).prisma;
  route=await import("../../app/api/v1/admin/questions/[id]/skills/route");
  existingNames=(await prisma.skillTag.findMany({where:{name:{in:skillTaxonomy.map(tag=>tag.name)}},select:{name:true}})).map(tag=>tag.name);
  await prisma.user.createMany({data:[{id:admin,role:"ADMIN" as const},{id:learner,role:"USER" as const},{id:reviewer,role:"REVIEWER" as const}].map(user=>({...user,email:`${user.id}@skill-fixture.invalid`}))});
  await prisma.skillTag.create({data:{id:legacy,name:`legacy-skill-fixture-${legacy}`}});
});
after(async()=>{
  if(!prisma)return;
  await prisma.authorizationAuditEvent.deleteMany({where:{actorId:admin}});
  await prisma.question.deleteMany({where:{id:{in:questions}}});
  await prisma.skillTag.deleteMany({where:{OR:[{id:legacy},{name:{in:skillTaxonomy.map(tag=>tag.name).filter(name=>!existingNames.includes(name))},questions:{none:{}}}]}});
  await prisma.user.deleteMany({where:{id:{in:[admin,learner,reviewer]}}});
  await prisma.$disconnect();
});
async function question(part=5, privateOwner=false){
  const id=randomUUID();questions.push(id);
  await prisma.question.create({data:{id,ownerId:privateOwner?admin:null,publicationStatus:privateOwner?"PRIVATE":"LEGACY",part,content:"Synthetic skill fixture",options:{A:"a",B:"b"},correctAnswer:"A"}});
  return id;
}
async function call(id:string,keys:string[],expectedTagIds:string[]=[],actor=admin,extra:object={}){
  const token=await new SignJWT({tokenUse:"access"}).setProtectedHeader({alg:"HS256"}).setSubject(actor).setIssuer("toeic-mini-trainer").setAudience("toeic-mobile").setExpirationTime("5m").sign(new TextEncoder().encode(process.env.MOBILE_JWT_SECRET));
  return route.POST(new Request("https://integration.invalid/skills",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({keys,expectedTagIds,reason:"Checked the synthetic source",...extra})}),{params:Promise.resolve({id})});
}
async function tagIds(id:string){return (await prisma.questionSkillTag.findMany({where:{questionId:id},select:{skillTagId:true}})).map(tag=>tag.skillTagId);}

describe("admin skill editor with PostgreSQL authorization, audit and concurrency",()=>{
  it("rejects non-admin, inactive, invalid bearer and private questions without writes",async()=>{
    const id=await question();
    for(const actor of [learner,reviewer])assert.equal((await call(id,["grammar-tense"],[],actor)).status,403);
    await prisma.user.update({where:{id:admin},data:{status:"SUSPENDED"}});
    try{assert.equal((await call(id,["grammar-tense"])).status,401);}finally{await prisma.user.update({where:{id:admin},data:{status:"ACTIVE"}});}
    assert.equal((await route.POST(new Request("https://integration.invalid/",{method:"POST",headers:{authorization:"Bearer invalid"}}),{params:Promise.resolve({id})})).status,401);
    assert.equal((await call(await question(5,true),["grammar-tense"])).status,404);
    assert.equal((await call("invalid",["grammar-tense"])).status,400);
    assert.equal((await call(randomUUID(),["grammar-tense"])).status,404);
    assert.deepEqual(await tagIds(id),[]);
    assert.equal(await prisma.authorizationAuditEvent.count({where:{targetId:id}}),0);
  });
  it("refuses guessed labels, wrong Part and attempts to publish with metadata",async()=>{
    const id=await question(2);
    assert.equal((await call(id,["grammar-tense"])).status,422);
    assert.equal((await call(id,["guessed"])).status,400);
    assert.equal((await call(id,["listen-response"],[],admin,{publicationStatus:"PUBLISHED"})).status,400);
    assert.equal((await call(id,["listen-response"],[],admin,{reason:" "})).status,400);
    assert.deepEqual(await tagIds(id),[]);
  });
  it("adds and removes controlled labels, retains legacy labels and records before/after",async()=>{
    const id=await question();
    await prisma.questionSkillTag.create({data:{questionId:id,skillTagId:legacy}});
    const response=await call(id,["grammar-tense","vocabulary-context"],[legacy]);
    assert.equal(response.status,200);assert.match(response.headers.get("cache-control")!,/no-store/);
    const body=await response.json();assert.equal(body.changed,true);assert.equal(body.tags.length,3);
    assert.ok(body.tags.some((tag:{id:string})=>tag.id===legacy));
    const stored=await prisma.question.findUniqueOrThrow({where:{id}});assert.equal(stored.publicationStatus,"LEGACY");assert.equal(stored.correctAnswer,"A");assert.equal(stored.contentRevision,1);
    const audit=await prisma.authorizationAuditEvent.findFirstOrThrow({where:{targetId:id}});assert.equal(audit.action,"QUESTION_SKILL_TAGS_UPDATED");assert.match(audit.reason!,/Ngữ pháp: thì động từ/);
    const cleared=await call(id,[],body.tags.map((tag:{id:string})=>tag.id));assert.equal(cleared.status,200);assert.deepEqual(await tagIds(id),[legacy]);
    assert.equal(await prisma.authorizationAuditEvent.count({where:{targetId:id}}),2);
  });
  it("idempotent unchanged labels do not create duplicate rows or audits",async()=>{
    const id=await question();assert.equal((await call(id,["grammar-tense"])).status,200);
    const response=await call(id,["grammar-tense"],await tagIds(id));assert.equal(response.status,200);assert.equal((await response.json()).changed,false);
    assert.equal((await tagIds(id)).length,1);assert.equal(await prisma.authorizationAuditEvent.count({where:{targetId:id}}),1);
  });
  it("two stale editors cannot overwrite each other and loser produces no audit",async()=>{
    const id=await question();const responses=await Promise.all([call(id,["grammar-tense"]),call(id,["grammar-word-form"])]);
    assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);assert.equal((await tagIds(id)).length,1);
    assert.equal(await prisma.authorizationAuditEvent.count({where:{targetId:id}}),1);
    const stale=await call(id,[],[]);assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,"SKILL_TAGS_CHANGED");
  });
  it("two questions can share one canonical label without creating duplicates",async()=>{
    const a=await question(),b=await question();const responses=await Promise.all([call(a,["grammar-agreement"]),call(b,["grammar-agreement"])]);
    assert.ok(responses.every(response=>response.status===200));assert.deepEqual(await tagIds(a),await tagIds(b));
    assert.equal(await prisma.skillTag.count({where:{name:"Ngữ pháp: hòa hợp chủ vị"}}),1);
  });
});
