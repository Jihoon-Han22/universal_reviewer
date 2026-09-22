import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {ref,readRef} from './shared.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const name=process.argv[2];if(!name?.startsWith('.cache/rebuild/evidence/')||!name.endsWith('/input-manifest.json'))throw new Error('Pass the prepared input manifest');
const inputManifestRef=await ref(root,name),input=JSON.parse(await readRef(root,inputManifestRef));
if(input.outputDirectory!==path.posix.dirname(name))throw new Error('Preparation output must be beside the verified input manifest');
const authoredManifestRef=await ref(root,`${input.outputDirectory}/authored-manifest.json`),authored=JSON.parse(await readRef(root,authoredManifestRef));
if(input.cases.length!==13||authored.cases.length!==13)throw new Error('All thirteen public cases required');
const plan={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',preparedAt:new Date().toISOString(),loop:input.loop,outputDirectory:input.outputDirectory,kind:'immutable-unresolved-semantic-replay-plan',inputManifestRef,authoredManifestRef,codeDigest:null,
  executionPolicy:'Do not edit this preparation artifact. Complete and independently review physical outputs, response fixtures and expected current behavior in a new execution plan before running --execute. The default --check imports no product modules.',
  modelStagePolicy:'Model responses are independently authored test inputs, not observed Gemini outputs. Actual document/context validators, workbook grounding, criteria approval, target normalization and engine transitions must execute. This is not a model accuracy or generalization claim.',
  identityPolicy:'Only current document IDs and exact-source-label criterion IDs may be bound. No semantic answer selection by case ID, variant, filename or digest.',
  physicalPolicy:'Use actual separately executed trusted-reader and workbook-helper outputs with source/code hashes. The harness only replays command/file transport; it never claims E2B was called or installs executed.',
  cases:input.cases.map(source=>({...source,authoredDraftRef:authored.cases.find(c=>c.caseId===source.caseId).artifact,state:'unresolved',semanticReview:{reviewed:false,reviewerId:null},physicalEvidenceRefs:[],sandboxSessions:[],responses:[],assertions:[]})),fullGateCasesPassed:0,completeProductAcceptance:false};
const output=`${input.outputDirectory}/execution-plan-template.json`;
await writeFile(path.join(root,output),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
textOutput(await ref(root,output));
function textOutput(value){console.log(JSON.stringify({plan:value,selectedCases:13,preparedForExecution:0,productExecuted:false}));}
