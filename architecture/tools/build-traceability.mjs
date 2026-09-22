// Authoring helper: deterministic traceability, never awards an acceptance score.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gates = {
 'CORE-01':'G01 G03 G09 G12','CORE-02':'G02 G12','CORE-03':'G02 G03 G12',
 'CORE-04':'G03 G07 G08 G09','CORE-05':'G03 G07 G08 G09','CORE-06':'G03 G05 G07 G09',
 'CORE-07':'G04 G06 G08','CORE-08':'G04 G06 G07 G08','CORE-09':'G04 G05 G06 G08',
 'CORE-10':'G02 G04 G09','CORE-11':'G05 G06 G07 G08','CORE-12':'G05 G06 G07 G08',
 'CORE-13':'G02 G09 G12','CORE-14':'G05 G07 G10 G11 G12','CORE-15':'G03 G09 G10 G13',
 'CORE-16':'G06 G07 G11','CORE-17':'G09 G11','CORE-18':'G09 G11 G12 G13',
 'CORE-19':'G02 G03 G04 G05 G10 G11 G13',
 'CORE-20':'G00 G01 G12','CORE-21':'G00 G01 G06 G07 G08 G12',
 'UI-01':'G02 G10 G13','UI-02':'G10 G13','UI-03':'G10 G13','UI-04':'G02 G04 G10',
 'UI-05':'G04 G10 G13','UI-06':'G03 G10','UI-07':'G09 G10 G13','UI-08':'G09 G10 G13',
 'UI-09':'G09 G10 G13','UI-10':'G09 G10 G13','UI-11':'G05 G07 G10 G13',
 'UI-12':'G05 G10 G13','UI-13':'G05 G10 G13','UI-14':'G10 G13','UI-15':'G09 G11 G13',
 'UI-16':'G10 G11 G13','UI-17':'G05 G10 G11 G13','UI-18':'G06 G07 G11 G13',
};
const modules = (await Promise.all(['core','ui'].map(async kind => JSON.parse(await readFile(resolve(root, 'decomposition', kind+'-modules.json'), 'utf8'))))).flatMap(x=>x.modules);
const rows = [['module_id','module_name','layer','internal_steps','question_id','category','question','spec_files','dependencies','libraries','required_evidence','future_product_gates']];
const seen = new Set();
for (const m of modules) {
 if (seen.has(m.id) || !gates[m.id]) throw new Error('Unknown or duplicate module '+m.id);
 seen.add(m.id);
 for (const q of m.acceptanceQuestions) rows.push([m.id,m.name,m.layer,m.stepIds.join(' '),q.id,q.category,q.question,m.specFiles.join(' | '),m.dependencies.join(' '),m.libraries.map(l=>l.name+': '+l.role).join(' | '),q.requiredEvidence,gates[m.id]+' G14']);
}
const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
await writeFile(resolve(root,'traceability.csv'),csv);
console.log(JSON.stringify({modules:modules.length,questions:rows.length-1,path:'architecture/traceability.csv',acceptanceAwarded:false}));
