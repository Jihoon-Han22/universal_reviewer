import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {projectBrowserRecord,assertions,caseIds,developmentProbe} from './g12-runtime.mjs';
import {makeBrowserControl,controlPng,controlTrace} from './g12-validator-control-fixture.mjs';

// Collector controls only: no actual browser/provider or gate evidence.
const project=async f=>{f.sync();return projectBrowserRecord(f.record,f.options);};
const downloadText=f=>f.files.get(f.record.downloadRef.path).toString('utf8');
function replaceDownload(f,text){const bytes=Buffer.from(text);f.record.downloadRef=f.add('download.html',bytes);const d=f.observed('download');d.downloadRef=f.record.downloadRef;d.bytes=bytes.length;d.urlLifecycle.find(row=>row.operation==='create').size=bytes.length;f.observed('offline').downloadHash=f.record.downloadRef.sha256;}

test('population6 and coherent artifacts produce35 measured assertions',async()=>{const f=await makeBrowserControl(),value=await project(f);assert.equal(caseIds.length,6);assert.equal(new Set(caseIds).size,6);assert.equal(assertions['G12:CORE-14-C05'].length,35);assert.deepEqual(value.actual,f.record.actual);assert.equal(value.actual.download.scriptCount,2);assert.equal((downloadText(f).match(/<script\b/g)||[]).length,3);assert.ok(value.artifactRefs.length>6);assert.equal(value.artifactDiagnostics.png.width,2);assert.ok(value.artifactDiagnostics.trace.pairedCalls>0);});

for(const [name,change,error]of[
  ['empty observed row',f=>f.log.events.find(row=>row.id==='click').observed={},'G12_BROWSER_POSITIVE_RAW'],
  ['contradictory trusted event',f=>f.observed('click').sourceEvent.isTrusted=false,'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['contradictory final selection',f=>f.record.actual.bridge.positive.click.selectedItemId='wrong','G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['source event absent from captured events',f=>f.observed('enter').newEvents=[],'G12_BROWSER_POSITIVE_MEMBERSHIP'],
  ['message absent from captured messages',f=>f.observed('space').newMessages=[],'G12_BROWSER_POSITIVE_MEMBERSHIP'],
  ['opaque message mismatch',f=>f.observed('click').message.origin='http://invalid.local','G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['two negative guard changes',f=>f.observed('wrongOrigin').injection.data.channel='also-wrong','G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['negative already selected A',f=>{f.observed('wrongChannel').before.selectedItemId='g12-item-a';f.observed('wrongChannel').after.selectedItemId='g12-item-a';},'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['negative lacks valid counterpart',f=>delete f.observed('wrongType').validCounterpart,'G12_BROWSER_POSITIVE_RAW'],
  ['stale frame uses current frame',f=>f.observed('staleFrame').injection.sourceWindow='window-4','G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['stale token uses current token',f=>f.observed('staleToken').injection.data.token='validator-token-4','G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['unmount listener still active',f=>{const u=f.observed('unmount');u.closedAfter.listenerState.activeListeners=[{id:'production-listener',capture:false}];u.activeAfter=['production-listener:false'];},'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['declared tokens conceal measured tokens',f=>{f.observed('download').previewTokens=['unrelated'];f.log.previewTokens=['unrelated'];},'G12_BROWSER_PREVIEW_TOKENS'],
  ['measured token leak falsely denied',f=>replaceDownload(f,downloadText(f).replace('</body>','validator-token-4</body>')),'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['missing revocation falsely claimed',f=>f.observed('download').urlLifecycle=f.observed('download').urlLifecycle.filter(row=>row.operation!=='revoke'),'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['MIME disagrees with actual blob',f=>f.observed('download').mime='text/plain','G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['download length disagrees',f=>f.observed('download').bytes+=1,'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['offline download hash disagrees',f=>f.observed('offline').downloadHash='f'.repeat(64),'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['blocked attempted request is not zero',f=>f.observed('offline').attemptedRequests.push({url:'https://invalid.local/a',method:'GET'}),'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['offline control identity disagrees',f=>f.observed('offline').controls[0].itemId='wrong','G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['regex count3 cannot replace DOM count2',f=>{f.observed('download').inspection.scriptCount=3;f.record.actual.download.scriptCount=3;},'G12_BROWSER_MEASUREMENT_MISMATCH'],
  ['signature-only PNG',f=>f.record.pngRef=f.add('control.png',Buffer.from([137,80,78,71,13,10,26,10])),'G12_BROWSER_PNG_INVALID'],
  ['bad PNG CRC',f=>{const bytes=Buffer.from(f.files.get('control.png'));bytes[20]^=1;f.record.pngRef=f.add('control.png',bytes);},'G12_BROWSER_PNG_CRC'],
  ['PNG viewport mismatch',f=>f.record.pngRef=f.add('control.png',controlPng(3,2)),'G12_BROWSER_PNG_VIEWPORT'],
  ['PNG invalid scanline with valid CRC',f=>f.record.pngRef=f.add('control.png',controlPng(2,2,5)),'G12_BROWSER_PNG_SCANLINES'],
  ['signature-only trace ZIP',f=>f.record.browserTraceRef=f.add('control.trace.zip',Buffer.from([80,75,3,4])),'G12_BROWSER_TRACE_INVALID'],
  ['CRC-broken trace ZIP',async f=>{const bytes=await controlTrace(),index=bytes.indexOf(Buffer.from('context-options'));assert.ok(index>0);bytes[index]^=1;f.record.browserTraceRef=f.add('control.trace.zip',bytes);},'G12_BROWSER_TRACE_INVALID'],
  ['unrelated valid ZIP',async f=>{const zip=new JSZip();zip.file('unrelated.txt','not a trace');f.record.browserTraceRef=f.add('control.trace.zip',await zip.generateAsync({type:'nodebuffer'}));},'G12_BROWSER_TRACE_CONTENT'],
  ['empty captured DOM',f=>f.hostDom.html='','G12_BROWSER_DOM_CONTENT'],
  ['collector plan not bound',f=>{const p=JSON.parse(f.files.get(f.record.collectorPlanRef.path));p.g12Binding.ref={path:'other.json',sha256:'e'.repeat(64)};f.record.collectorPlanRef=f.add('bridge-plan.json',p);},'G12_BROWSER_COLLECTOR_PLAN'],
  ['stale loop',f=>f.record.loop='LOOP-004','G12_BROWSER_STALE'],
  ['future completion',f=>f.record.endedAt=new Date(Date.now()+60000).toISOString(),'G12_BROWSER_TIME'],
  ['missing independent negative',f=>f.log.events=f.log.events.filter(row=>row.id!=='wrongOrigin'),'G12_BROWSER_EVENT_LOG'],
  ['source process changed',f=>f.provenance.serverIdentityAfter='different','G12_BROWSER_SOURCE_PARITY'],
  ['string boolean spoof',f=>f.record.actual.bridge.positive.space.isTrusted='true','G12_BROWSER_RAW_RESULT_TYPE'],
])test(name,async()=>{const f=await makeBrowserControl();await change(f);await assert.rejects(project(f),{message:error});});

test('bounded native event without parent message remains false',async()=>{const f=await makeBrowserControl(),p=f.observed('click');p.message=null;p.newMessages=[];p.after=structuredClone(p.before);p.accepted=false;p.selectedItemId=null;Object.assign(f.record.actual.bridge.positive.click,{accepted:false,selectedItemId:null});f.record.actual.bridge.iframe.messageOrigin=null;const value=await project(f);assert.equal(value.actual.bridge.positive.click.isTrusted,true);assert.equal(value.actual.bridge.positive.click.accepted,false);assert.equal(value.actual.bridge.iframe.messageOrigin,null);});
test('bounded absent event/message preserve null trust and selection',async()=>{const f=await makeBrowserControl(),p=f.observed('click');p.sourceEvent=null;p.newEvents=[];p.message=null;p.newMessages=[];p.after=structuredClone(p.before);p.accepted=false;p.selectedItemId=null;p.isTrusted=null;Object.assign(f.record.actual.bridge.positive.click,{accepted:false,selectedItemId:null,isTrusted:null});f.record.actual.bridge.iframe.messageOrigin=null;const value=await project(f);assert.equal(value.actual.bridge.positive.click.isTrusted,null);assert.equal(value.actual.bridge.positive.click.accepted,false);});
test('truthful revoke failure retained false',async()=>{const f=await makeBrowserControl(),d=f.observed('download');d.urlLifecycle=d.urlLifecycle.filter(row=>row.operation!=='revoke');d.inspection.urlRevoked=false;f.record.actual.download.urlRevoked=false;assert.equal((await project(f)).actual.download.urlRevoked,false);});
test('truthful filter failure retained false',async()=>{const f=await makeBrowserControl();f.observed('offline').filteredCount=null;f.record.actual.download.offlineFilterWorks=false;assert.equal((await project(f)).actual.download.offlineFilterWorks,false);});
test('truthful detail failure retained false',async()=>{const f=await makeBrowserControl();f.offlineDom.html=f.offlineDom.html.replace(/<section data-dashboard="details">[^<]*<\/section>/,'');f.offlineDom.detailText=null;f.observed('offline').detailOpened=false;f.record.actual.download.offlineDetailOpened=false;assert.equal((await project(f)).actual.download.offlineDetailOpened,false);});
test('zero controls derive false rather than vacuous hidden success',async()=>{const f=await makeBrowserControl();f.offlineDom.html=f.offlineDom.html.replace(/<button[^>]*>Source<\/button>/,'');f.offlineDom.sourceControls=[];Object.assign(f.observed('offline'),{controls:[],sourceControlCount:0});f.record.actual.download.sourceButtonsHidden=false;assert.equal((await project(f)).actual.download.sourceButtonsHidden,false);});
test('truthful measured preview-token leak retained true',async()=>{const f=await makeBrowserControl();replaceDownload(f,downloadText(f).replace('</body>','validator-token-4</body>'));f.observed('download').inspection.containsBridgeToken=true;f.record.actual.download.containsBridgeToken=true;assert.equal((await project(f)).actual.download.containsBridgeToken,true);});
test('probe rejects invalid cases before runtime/filesystem work',async()=>{for(const cases of[[],['G12:CORE-14-C05'],['unknown'],['G12:CORE-03-C01','G12:CORE-03-C01']])await assert.rejects(developmentProbe('not-a-project',{fixtures:'none',out:'none',cases}),{message:'G12_PROBE_CASE_SELECTION'});});
