// Package a Playwright capture export. No application source is required.
// node architecture/ui/reference/finalize-capture.mjs metadata-export.json dom-export.json
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory=path.dirname(fileURLToPath(import.meta.url));
const decode=async file=>{let value=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));if(typeof value==='string')value=JSON.parse(value);return value;};
const metadata=await decode(process.argv[2]);
const snapshots=await decode(process.argv[3]);
if(!Array.isArray(metadata.measurements)||!Array.isArray(snapshots))throw new Error('Expected metadata.measurements and a DOM snapshot array.');
if(metadata.measurements.length!==snapshots.length)throw new Error('Capture count mismatch.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const asset=async relative=>{const bytes=await readFile(path.resolve(directory,relative));return {path:relative,bytes:bytes.length,sha256:hash(bytes)};};
await mkdir(path.join(directory,'dom'),{recursive:true});
for(const snapshot of snapshots){
  if(!/^\d\d-[a-z0-9-]+$/.test(snapshot.id))throw new Error('Unsafe capture ID.');
  await writeFile(path.join(directory,'dom',snapshot.id+'.json'),JSON.stringify({schemaVersion:1,...snapshot})+'\n');
}
await writeFile(path.join(directory,'measurements.json'),JSON.stringify(metadata.measurements,null,2)+'\n');
const sourceSnapshot=await asset('../../baseline/source-snapshot.json');
const fontManifest=await asset('../fonts/manifest.json');
const fixture=JSON.parse(await readFile(path.join(directory,'synthetic-fixture.json'),'utf8'));
const inputs=await Promise.all(['synthetic-fixture.json','mock-api.mjs','capture-flow.js','capture-required-viewports.js','finalize-capture.mjs','synthetic-dashboard.html','synthetic-dashboard-dark.html'].map(asset));
const captures=[];
for(const measurement of metadata.measurements){
  const png=await asset(measurement.id+'.png');
  const bytes=await readFile(path.join(directory,png.path));
  if(bytes.subarray(1,4).toString()!=='PNG')throw new Error('Invalid PNG '+png.path);
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(width!==measurement.viewport.width||height!==measurement.viewport.height)throw new Error('Unexpected PNG dimensions '+png.path);
  const snapshot=snapshots.find(value=>value.id===measurement.id);
  if(!snapshot?.main?.tree?.length)throw new Error('Missing DOM tree '+measurement.id);
  captures.push({id:measurement.id,state:measurement.note,settling:measurement.settling,synthetic:true,capturedAt:measurement.capturedAt,url:measurement.url,mockOrigin:measurement.mockOrigin,viewport:measurement.viewport,motion:{...measurement.motion,animationFreeze:'none',finiteTransitionSettleMs:650},screenshot:{...png,width,height,mode:'viewport',scale:'device; DPR 1 required by dimension validation'},dom:await asset('dom/'+measurement.id+'.json'),measurement:{path:'measurements.json',id:measurement.id},sourceSnapshotSha256:sourceSnapshot.sha256,fixtureSha256:inputs[0].sha256,fonts:{ready:measurement.fonts.status==='loaded',dmSans:measurement.fonts.dmSans,notoSansKr:measurement.fonts.notoSansKr,manifest:fontManifest.path},visibleChecks:{bodyTextPresent:Boolean(measurement.visibleText?.trim()),horizontalOverflow:measurement.page.horizontalOverflow,domElements:snapshot.main.tree.length,iframeElements:snapshot.frames.reduce((sum,frame)=>sum+frame.tree.length,0),dashboardCanvasCount:measurement.frames.reduce((sum,frame)=>sum+frame.canvasCount,0)},visualInspection:metadata.visualInspection||'Not recorded'});
}
const manifest={schemaVersion:1,generatedAt:new Date().toISOString(),pathBase:metadata.pathBase||'.',synthetic:true,fixtureId:fixture.fixtureId,scope:metadata.scope||'Captured UI components with local synthetic responses; provider and export behavior not asserted.',environment:{...metadata.environment,node:process.version,captureEngine:metadata.captureEngine||'Unspecified Playwright engine; see userAgent',captureMode:'viewport',freshNamedBrowserSession:metadata.freshNamedBrowserSession??null},network:{mockOrigin:metadata.measurements[0]?.mockOrigin,externalPolicy:'Nonlocal requests blocked; Google Fonts stylesheet fulfilled from packaged local fonts.',blockedExternal:metadata.blockedExternal||[],apiRequests:metadata.requests||[]},sourceSnapshot,sourceVerification:metadata.sourceVerification||null,fontManifest,inputs,measurements:await asset('measurements.json'),captures,comparison:{pixelEqualityAcrossPlatforms:false,domIsReferenceTemplate:true,doNotHardcodeSyntheticFixtureIntoProduction:true,animationFreeze:'none',finiteTransitionSettleMs:650,dynamicRegionsToNormalize:[{selector:'time',reason:'Synthetic event timestamps and locale formatting.'},{selector:'.workroom-current-time time, .sandbox-workroom-elapsed time',reason:'Elapsed time changes while a synthetic task is active.'},{selector:'.workroom-current-time span',reason:'Inspect DOM animation targets/timings for active animation phase; do not mask static layout.'}],maskingAppliedToPng:false},limitations:['Static images and DOM samples do not prove motion equivalence.','The dashboard iframe uses its own system font stack and bundled chart runtime; host local web fonts do not cross its sandbox/CSP boundary.','Ledger upload uses a synthetic filename token and mocked parsed response; no real XLSX workbook is read or written.','Snapshots omit SCRIPT/STYLE/NOSCRIPT contents, handlers and application source; canvas pixels are represented by PNG, not DOM.','Mobile captures are viewport crops; DOM includes offscreen geometry.','Error/cancel/reconnect, many-file/PDF/multisheet, download and long-duration behavior require separate acceptance evidence.']};
await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({captures:captures.length,domFiles:snapshots.length,overflow:captures.filter(c=>c.visibleChecks.horizontalOverflow).map(c=>c.id),fontFailures:captures.filter(c=>!c.fonts.ready||!c.fonts.dmSans||!c.fonts.notoSansKr).map(c=>c.id),totalDomBytes:captures.reduce((sum,c)=>sum+c.dom.bytes,0)}));


