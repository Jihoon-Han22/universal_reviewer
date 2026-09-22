// Pure canonical G10 contribution contract. No filesystem/product/browser work.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
export const CONTRIBUTION_SCHEMA='g10-contributions-v1';
const HASH=/^[a-f0-9]{64}$/,FAMILY=/^(?:[A-I]|capture)$/;
const nonempty=x=>Array.isArray(x)&&x.length>0;
const clone=x=>JSON.parse(JSON.stringify(x));
const escape=x=>x.replaceAll('~','~0').replaceAll('/','~1');
const date=x=>{assert(typeof x==='string'&&Number.isFinite(Date.parse(x)));return Date.parse(x);};
const refOkay=r=>r&&typeof r.path==='string'&&r.path&&!/[\\:\x00]/.test(r.path)&&!r.path.startsWith('/')&&!r.path.split('/').some(x=>!x||x==='.'||x==='..'||x==='.env')&&HASH.test(r.sha256);
function unique(values,label){assert.equal(new Set(values).size,values.length,label);}
function refsUnion(refs){const byPath=new Map();for(const r of refs){assert(refOkay(r));const prior=byPath.get(r.path);if(prior)assert.equal(prior.sha256,r.sha256,'Conflicting same-path reference');else byPath.set(r.path,{path:r.path,sha256:r.sha256});}return [...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'));}
function assertion(a){assert(a&&typeof a.name==='string'&&a.name&&typeof a.pointer==='string'&&(a.pointer===''||a.pointer.startsWith('/'))&&Object.hasOwn(a,'expected'));assert(['deepEqual','finiteWithin','setEqual'].includes(a.operator??'deepEqual'));return clone(a);}
/** The local casePlan is byte-for-byte semantic JSON from the family plan.
 * facetBindings maps fixed original facet IDs to local assertion names.
 * Shared dependencies must be evaluated from bound owner evidence locally;
 * no local assertion is removed or replaced by a global delegation.
 */
export function validateContribution(c){
 assert(c&&FAMILY.test(c.familyId)&&refOkay(c.familyPlanRef));
 const p=c.casePlan;assert(p&&typeof p.caseId==='string'&&p.caseId.startsWith('G10:'));assert(Array.isArray(p.inputs)&&nonempty(p.baselineReferences)&&Object.hasOwn(p,'initialState')&&nonempty(p.actions)&&nonempty(p.assertions));
 refsUnion([...p.inputs,...p.baselineReferences]);p.assertions.forEach(assertion);unique(p.assertions.map(a=>a.name),'Duplicate local assertion');
 assert(nonempty(c.facetBindings));unique(c.facetBindings.map(b=>b.facetId),'Duplicate local facet binding');
 const mapped=new Set();
 for(const b of c.facetBindings){assert(typeof b.facetId==='string'&&b.facetId.startsWith(p.caseId+'/'));assert(nonempty(b.assertionNames));unique(b.assertionNames,'Duplicate bound assertion');for(const name of b.assertionNames){assert(p.assertions.some(a=>a.name===name),'Unknown local assertion');mapped.add(name);}
  assert(!Object.hasOwn(b,'delegateTo'),'Delegation cannot discard a required local assertion');
 }
 assert.deepEqual([...mapped].sort(),p.assertions.map(a=>a.name).sort(),'Every local assertion must map to an original facet; no dropped checks');
 return c;
}
function exactFacets(definition){assert(Array.isArray(definition.facets)&&definition.facets.length>0);const ids=definition.facets.filter(f=>f.required!==false).map(f=>f.id);assert(nonempty(ids));unique(ids,'Duplicate original facet');return ids;}
function endpoints(contributions,familyId,facetId){
 const c=contributions.find(x=>x.familyId===familyId),b=c?.facetBindings.find(x=>x.facetId===facetId);assert(c&&b,'Missing declared shared contributor');
 return b.assertionNames.map(name=>({familyId,assertionName:name,facetId}));
}
export function composeCase(definition,contributions){
 assert(typeof definition.id==='string'&&definition.id.startsWith('G10:'));assert(nonempty(contributions));contributions.forEach(validateContribution);unique(contributions.map(c=>c.familyId),'Duplicate family contribution');for(const c of contributions)assert.equal(c.casePlan.caseId,definition.id);
 const ordered=clone(contributions).sort((a,b)=>a.familyId.localeCompare(b.familyId,'en')),facets=exactFacets(definition);
 for(const c of ordered)for(const b of c.facetBindings)assert(facets.includes(b.facetId),'Facet outside original case');
 const requirements=facets.map(facetId=>{const direct=ordered.flatMap(c=>c.facetBindings.filter(b=>b.facetId===facetId).flatMap(b=>endpoints(ordered,c.familyId,b.facetId)));assert(nonempty(direct),'Original facet has no executable contribution');const values=new Map(direct.map(r=>[r.familyId+'|'+r.assertionName,r]));return {facetId,allOf:[...values.values()].sort((a,b)=>(a.familyId+'|'+a.assertionName).localeCompare(b.familyId+'|'+b.assertionName,'en'))};});
 const localAssertions=ordered.flatMap(c=>c.casePlan.assertions.map(a=>({...assertion(a),name:c.familyId+':'+a.name,pointer:'/contributions/'+escape(c.familyId)+a.pointer})));
 const assertions=[...localAssertions,...requirements.map(r=>({name:r.facetId,pointer:'/facetPass/'+escape(r.facetId),operator:'deepEqual',expected:true}))];unique(assertions.map(a=>a.name),'Merged assertion collision');
 const baselineReferences=refsUnion(definition.baselineReferences??[]);assert(nonempty(baselineReferences));for(const c of ordered)for(const r of c.casePlan.baselineReferences)assert(baselineReferences.some(b=>b.path===r.path&&b.sha256===r.sha256),'Family baseline outside registry definition');
 return {caseId:definition.id,inputs:refsUnion([...(definition.inputs??[]),...ordered.flatMap(c=>[c.familyPlanRef,...c.casePlan.inputs])]),baselineReferences,initialState:{kind:CONTRIBUTION_SCHEMA,contributions:ordered.map(c=>({familyId:c.familyId,value:clone(c.casePlan.initialState)}))},actions:ordered.flatMap(c=>c.casePlan.actions.map((action,index)=>({familyId:c.familyId,index,action:clone(action)}))),assertions,contributionSchema:CONTRIBUTION_SCHEMA,contributions:ordered,facetRequirements:requirements};
}
/** definitions are the exact registry definitions joined with the frozen232
 * facet map. The caller hash-validates those refs; this module does no IO. */
export function composeGlobal({identity,definitions,contributions}){
 assert(identity?.schemaVersion==='1.0'&&identity.acceptanceProfile==='CURRENT_REPRODUCTION'&&identity.gateId==='G10'&&HASH.test(identity.codeDigest)&&HASH.test(identity.registrySha256));date(identity.preparedAt);assert(refOkay(identity.facetMapRef));assert.equal(definitions.length,136);unique(definitions.map(d=>d.id),'Global registry population duplicate');assert.equal(definitions.reduce((n,d)=>n+exactFacets(d).length,0),232);
 for(const c of contributions){validateContribution(c);assert(definitions.some(d=>d.id===c.casePlan.caseId),'Contribution outside136 case population');}
 return {...clone(identity),contributionSchema:CONTRIBUTION_SCHEMA,cases:[...definitions].sort((a,b)=>a.id.localeCompare(b.id,'en')).map(d=>composeCase(d,contributions.filter(c=>c.casePlan.caseId===d.id)))};
}
export function validateGlobal(global,{identity,definitions}){
 assert.equal(global.contributionSchema,CONTRIBUTION_SCHEMA);for(const key of ['schemaVersion','acceptanceProfile','gateId','codeDigest','registrySha256'])assert.equal(global[key],identity[key],key);assert.deepEqual(global.facetMapRef,identity.facetMapRef);date(global.preparedAt);
 const expected=composeGlobal({identity:{...identity,preparedAt:global.preparedAt},definitions,contributions:global.cases.flatMap(c=>c.contributions??[])});assert.deepEqual(global,expected,'Canonical global case merge differs from predeclared contributions/facets');return global;
}
export function validateFamilyBinding(global,{identity,definitions,familyId,familyPlanRef,familyPreparedAt,contributions}){
 assert(FAMILY.test(familyId)&&refOkay(familyPlanRef));validateGlobal(global,{identity,definitions});assert(date(global.preparedAt)>=date(familyPreparedAt),'Global before family plan');assert(nonempty(contributions));
 unique(contributions.map(c=>c.casePlan.caseId),'Duplicate expected family case');const supplied=global.cases.flatMap(c=>c.contributions.filter(x=>x.familyId===familyId));assert.equal(supplied.length,contributions.length,'Wrong family case population');
 for(const own of contributions){validateContribution(own);assert.equal(own.familyId,familyId);assert.deepEqual(own.familyPlanRef,familyPlanRef);const found=supplied.find(c=>c.casePlan.caseId===own.casePlan.caseId);assert.deepEqual(found,own,'Exact own contribution changed');}
 return {contributionSchema:CONTRIBUTION_SCHEMA,familyId,familyPlanRef:clone(familyPlanRef),caseIds:contributions.map(c=>c.casePlan.caseId).sort(),globalCaseCount:136,globalFacetCount:232};
}
function pointer(value,p){if(p==='')return value;assert(p.startsWith('/'));for(const s of p.slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'))){assert(value!==null&&typeof value==='object'&&Object.hasOwn(value,s),'Missing observed pointer '+p);value=value[s];}return value;}
function compare(a,e,o='deepEqual'){if(o==='deepEqual')return isDeepStrictEqual(a,e);if(o==='finiteWithin')return finite(a)&&Array.isArray(e)&&e.length===2&&e.every(finite)&&a>=e[0]&&a<=e[1];if(o==='setEqual')return Array.isArray(a)&&Array.isArray(e)&&a.length===new Set(a).size&&e.length===new Set(e).size&&isDeepStrictEqual([...a].sort(),[...e].sort());return false;}
const finite=x=>typeof x==='number'&&Number.isFinite(x);
/** Called only by a separately reviewed final exporter after raw/source/OS and
 * family-evaluator admission. Values are the exact already-bound local actuals.
 * This function never turns absence into a successful facet. */
export function composeObservedCase(globalCase,localActuals,{definition}){
 assert.deepEqual(globalCase,composeCase(definition,globalCase.contributions),'Observed case requires canonical predeclared case');
 const contributions={},checks=new Map();for(const c of globalCase.contributions){assert(Object.hasOwn(localActuals,c.familyId),'Missing local actual');contributions[c.familyId]=clone(localActuals[c.familyId]);for(const a of c.casePlan.assertions){let passed=false;try{passed=compare(pointer(localActuals[c.familyId],a.pointer),a.expected,a.operator);}catch{}checks.set(c.familyId+'|'+a.name,passed);}}
 const facetPass=Object.fromEntries(globalCase.facetRequirements.map(f=>[f.facetId,f.allOf.length>0&&f.allOf.every(a=>checks.get(a.familyId+'|'+a.assertionName)===true)]));
 return {contributionSchema:CONTRIBUTION_SCHEMA,caseId:globalCase.caseId,contributions,facetPass};
}
