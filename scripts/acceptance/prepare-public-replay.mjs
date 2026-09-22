// Evaluator preparation only. This creates all 13 public inputs but never runs
// product code, consumes generated oracle answers, or labels a case as passed.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateSuite,VARIANTS} from '../../architecture/validation/fixture-generator.mjs';
import {ref,readRef,writeJson,sha256} from './shared.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const loop=process.argv[2];if(!/^LOOP-\d{3}$/.test(loop??''))throw new Error('Pass LOOP-NNN');
const outputDirectory=`.cache/rebuild/evidence/${loop}/G08-preparation-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(path.join(root,outputDirectory),{recursive:false});
const evaluatorDirectory=`${outputDirectory}/evaluator`,runtimeDirectory=`${outputDirectory}/runtime`;
await mkdir(path.join(root,runtimeDirectory));
// The generator necessarily writes an evaluator oracle. Its return value and
// oracle file are deliberately never read by this preparation program.
await generateSuite(path.join(root,evaluatorDirectory),'public-regression-v1');
const generated=JSON.parse(await readFile(path.join(root,evaluatorDirectory,'manifest.json'),'utf8'));
if(generated.cases.length!==13||new Set(generated.cases.map(c=>c.variant)).size!==13||VARIANTS.some(v=>!generated.cases.some(c=>c.variant===v)))throw new Error('All thirteen public variants are mandatory');
const cases=[];
for(const generatedCase of generated.cases){
  const inputDirectory=`${runtimeDirectory}/inputs/${generatedCase.id}`;
  await mkdir(path.join(root,inputDirectory),{recursive:true});
  const inputs=[];
  for(const document of generatedCase.request.documents){
    const source=await ref(root,`${evaluatorDirectory}/${generatedCase.inputDirectory}/${document.file}`),bytes=await readRef(root,source);
    if(sha256(bytes)!==document.sha256)throw new Error('Generated document identity mismatch');
    const destination=`${inputDirectory}/${document.file}`;
    await writeFile(path.join(root,destination),bytes,{flag:'wx'});
    inputs.push({...document,input:await ref(root,destination)});
  }
  cases.push({caseId:`G08:${generatedCase.variant}`,variant:generatedCase.variant,inputDirectory,request:generatedCase.request,inputs,state:'not_run',semanticComparison:'unresolved',
    requiredActualStages:['trusted document reader','validated document context','criteria eligibility','trusted workbook inventory and selected range read','grounded workbook discovery','workflow-only overlay','explicit engine confirmation','actual target review and verdict normalization'],
    unresolved:['Actual reader and workbook-helper profiles must be recorded under the eventual frozen implementation.','Source-authored Gemini responses must pass schema/source inspection before replay.','Current semantic baseline and exact expected outputs require independent review; future ideal oracle results are not substituted.','No browser highlights or full coverage may be inferred from this preparation.']});
}
const manifest={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',loop,preparedAt:new Date().toISOString(),kind:'public-transform-preparation-no-product-execution',seed:'public-regression-v1',outputDirectory,runtimeDirectory,
  generatorReference:await ref(root,'architecture/validation/fixture-generator.mjs'),registryReference:await ref(root,'scripts/acceptance/case-registry.json'),baselineReferences:[await ref(root,'architecture/specs/06-verification.md'),await ref(root,'architecture/validation/README.md')],
  selectedCases:13,selectedDocuments:26,modelCalls:0,providerCalls:{gemini:0,e2b:0},oracleRead:false,
  isolation:{evaluatorDirectory,runtimeInputPolicy:'Only copied document bytes and request are delivered to product code. Oracle/manifest answers are never passed to a product/model call.',boundary:'Test routing and inspection boundary; not an OS filesystem sandbox.',semanticRouting:'Schema plus ordered source-content assertions. Case IDs, variants, filenames and hashes cannot select semantic answers. Hashes serve file integrity only.'},cases,fullGateCasesPassed:0,completeProductAcceptance:false};
const result=await writeJson(root,`${outputDirectory}/input-manifest.json`,manifest);
console.log(JSON.stringify({manifest:result,selectedCases:13,selectedDocuments:26,productExecuted:false,oracleRead:false}));
