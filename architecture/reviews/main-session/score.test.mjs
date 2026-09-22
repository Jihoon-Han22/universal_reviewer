import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Synthetic assessment fixtures test this utility, never the product or its scores.
const scorer = fileURLToPath(new URL('./score.mjs', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const moduleIds = ['UI-01', 'CORE-01'];
const makeModule = id => ({id, name: 'Synthetic ' + id, specFiles:['specs/contract.md'], acceptanceQuestions:[{id:id+'-C01'}, {id:id+'-C02'}]});
const makeReport = (role, ids = moduleIds) => ({
  schemaVersion:1, round:1, role, reviewerId:'synthetic-' + role,
  modules:ids.map(moduleId => ({moduleId, checks:makeModule(moduleId).acceptanceQuestions.map(({id}) => ({
    id, status:'pass', reason:'Synthetic fixture evidence is explicit.',
    evidence:[{path:'specs/contract.md',section:'Synthetic contract'}, ...(role === 'accuracy' ? [{path:'source:src/fake.ts',section:'Synthetic implementation'}] : [])]
  }))})), issues:[]
});

async function fixture(t) {
  const temp = resolve(tmpdir());
  const root = await mkdtemp(join(temp, 'gspec-score-test-'));
  t.after(async () => {
    // Only remove the exact temporary directory created by this test.
    if (dirname(resolve(root)) !== temp || !basename(root).startsWith('gspec-score-test-')) throw new Error('Unsafe fixture cleanup');
    await rm(root, {recursive:true,force:true});
  });
  const architecture = join(root, 'architecture');
  for (const directory of ['decomposition','specs','reviews/main-session']) await mkdir(join(architecture, directory), {recursive:true});
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/fake.ts'), 'export const synthetic = true;\n');
  await writeFile(join(architecture, 'specs/contract.md'), '# Synthetic contract\n');
  for (const [index, name] of ['ui','core'].entries()) await writeFile(join(architecture,'decomposition',name+'-modules.json'), JSON.stringify({schemaVersion:1,modules:[makeModule(moduleIds[index])]}));
  const script = join(architecture,'reviews/main-session/score.mjs');
  await copyFile(scorer, script);
  let sequence = 0;
  const put = async report => {
    const path = join(root, 'review-' + ++sequence + '.json');
    await writeFile(path,JSON.stringify(report));
    return path;
  };
  const run = (command,...paths) => {
    const result = spawnSync(process.execPath,[script,command,...paths],{cwd:root,encoding:'utf8',timeout:15000,windowsHide:true});
    assert.equal(result.error,undefined,result.error?.message);
    return result;
  };
  const seal = async (...reports) => {
    const paths = await Promise.all(reports.map(put));
    const result = run('seal',...paths);
    assert.equal(result.status,0,result.stderr);
    return paths;
  };
  return {root,architecture,put,run,seal};
}

function invalidReport(name, mutate, expected) {
  test(name, async t => {
    const f = await fixture(t);
    const report = makeReport('clarity');
    mutate(report);
    const result = f.run('seal', await f.put(report));
    assert.notEqual(result.status,0);
    assert.match(result.stderr,expected);
  });
}

test('complete synthetic dual-role coverage passes only the explicitly declared scope', async t => {
  const f = await fixture(t);
  const paths = await f.seal(makeReport('clarity'),makeReport('accuracy'));
  const result = f.run('score',...paths);
  assert.equal(result.status,0,result.stderr);
  const score = JSON.parse(result.stdout);
  assert.equal(score.passed,true);
  assert.equal(score.scope,'declared-module-questions-only');
  assert.equal(score.universalCorrectnessClaim,false);
  assert.equal(score.modules.length,2);
  assert.ok(score.modules.every(row => row.clarity === 100 && row.accuracy === 100 && row.accepted));
});

invalidReport('empty report cannot be sealed', r => { r.modules=[]; }, /Invalid review schema/);
invalidReport('blank reviewer ID is invalid', r => { r.reviewerId=' '; }, /Invalid review schema/);
invalidReport('duplicate modules are rejected', r => { r.modules.push(r.modules[0]); }, /Unknown\/duplicate module/);
invalidReport('unknown modules are rejected', r => { r.modules[0].moduleId='UNKNOWN'; }, /Unknown\/duplicate module/);
invalidReport('duplicate questions do not count as full coverage', r => { r.modules[0].checks[1]=r.modules[0].checks[0]; }, /Invalid check/);
invalidReport('unknown question cannot replace a required question', r => { r.modules[0].checks[0].id='UNKNOWN'; }, /Invalid check/);
invalidReport('incomplete coverage is rejected', r => { r.modules[0].checks.pop(); }, /Incomplete question coverage/);
invalidReport('missing evidence is rejected', r => { r.modules[0].checks[0].evidence=[]; }, /Invalid check/);
invalidReport('empty evidence section is rejected', r => { r.modules[0].checks[0].evidence[0].section=' '; }, /Missing evidence location/);
invalidReport('blind clarity cannot cite original source', r => { r.modules[0].checks[0].evidence[0].path='source:src/fake.ts'; }, /Clarity must stand/);

for (const path of ['../src/fake.ts','specs/../specs/contract.md','source:src/../../secret','source:.env','.ENV.production','specs/.env/credentials','C:\\secret.txt','/absolute/secret','https://example.test/file']) {
  invalidReport('unsafe evidence path rejected: '+path, r => { r.modules[0].checks[0].evidence[0].path=path; }, /Invalid evidence path/);
}

const issue = () => ({id:'SYN-01',moduleId:'UI-01',severity:'high',status:'open',problem:'Synthetic unresolved issue'});
invalidReport('duplicate issue IDs are rejected', r => { r.issues=[issue(),issue()]; }, /Invalid\/duplicate\/out-of-scope issue/);
for (const [field,value] of [['id',''],['moduleId','UNKNOWN'],['severity','ignored'],['status','not-open'],['problem','']]) {
  invalidReport('invalid issue '+field+' is rejected', r => { r.issues=[{...issue(),[field]:value}]; }, /Invalid\/duplicate\/out-of-scope issue/);
}
invalidReport('issue cannot point to an unassessed known module', r => { r.modules=r.modules.slice(0,1); r.issues=[{...issue(),moduleId:'CORE-01'}]; }, /Invalid\/duplicate\/out-of-scope issue/);

test('accuracy pass requires source proof', async t => {
  const f=await fixture(t), report=makeReport('accuracy');
  report.modules[0].checks[0].evidence=report.modules[0].checks[0].evidence.slice(0,1);
  const result=f.run('seal',await f.put(report));
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Accuracy pass lacks source proof/);
});

test('one missing review role leaves null scores and cannot pass', async t => {
  const f=await fixture(t), paths=await f.seal(makeReport('clarity'));
  const result=f.run('score',...paths), score=JSON.parse(result.stdout);
  assert.equal(result.status,1);
  assert.equal(score.passed,false);
  assert.ok(score.modules.every(m => m.accuracy === null && m.accuracyUnresolvedChecks === 2 && !m.accepted));
});

test('unassessed modules cannot disappear from the score population', async t => {
  const f=await fixture(t), paths=await f.seal(makeReport('clarity',['UI-01']),makeReport('accuracy',['UI-01']));
  const result=f.run('score',...paths), score=JSON.parse(result.stdout);
  assert.equal(result.status,1);
  assert.equal(score.modules.find(m => m.moduleId === 'CORE-01').accepted,false);
});

test('fail and unverified checks remain unresolved without an issue record', async t => {
  const f=await fixture(t), report=makeReport('clarity');
  report.modules[0].checks[0].status='fail';
  report.modules[1].checks[0].status='unverified';
  const paths=await f.seal(report,makeReport('accuracy'));
  const result=f.run('score',...paths), score=JSON.parse(result.stdout);
  assert.equal(result.status,1);
  assert.ok(score.modules.every(m => m.clarity === 50 && m.clarityUnresolvedChecks === 1 && !m.accepted));
});

test('open issue blocks acceptance even when all questions pass', async t => {
  const f=await fixture(t), report=makeReport('clarity'); report.issues=[issue()];
  const paths=await f.seal(report,makeReport('accuracy'));
  const result=f.run('score',...paths), score=JSON.parse(result.stdout);
  assert.equal(result.status,1);
  assert.equal(score.modules[0].clarity,100);
  assert.equal(score.modules[0].clarityOpenIssues,1);
  assert.equal(score.modules[0].accepted,false);
});

test('resolved issues permit acceptance only with passing checks', async t => {
  const f=await fixture(t), report=makeReport('clarity'); report.issues=[{...issue(),status:'resolved'}];
  const paths=await f.seal(report,makeReport('accuracy'));
  assert.equal(f.run('score',...paths).status,0);
});

test('highest distinct round wins while same-round ties are rejected', async t => {
  const f=await fixture(t), older=makeReport('clarity'), newer=makeReport('clarity');
  older.modules[0].checks[0].status='fail'; newer.round=2;
  const paths=await f.seal(older,newer,makeReport('accuracy'));
  const result=f.run('score',...paths);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).modules[0].clarityRound,2);
  const duplicate=await f.put({...newer,reviewerId:'other-independent-author'});
  assert.equal(f.run('seal',duplicate).status,0);
  const conflicting=f.run('score',...paths,duplicate);
  assert.notEqual(conflicting.status,0);
  assert.match(conflicting.stderr,/Conflicting same-round assessment/);
});

test('duplicate same-round issue IDs across partitioned reports are rejected', async t => {
  const f=await fixture(t), a=makeReport('clarity',['UI-01']), b=makeReport('clarity',['CORE-01']);
  a.issues=[issue()]; b.issues=[{...issue(),moduleId:'CORE-01'}];
  const result=f.run('seal',await f.put(a),await f.put(b));
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Duplicate issue across same-round reports/);
});

test('invalid batch does not partially seal earlier valid reports', async t => {
  const f=await fixture(t), first=await f.put(makeReport('clarity')), second=makeReport('accuracy');
  second.modules=[];
  const original=await readFile(first,'utf8');
  const result=f.run('seal',first,await f.put(second));
  assert.notEqual(result.status,0);
  assert.equal(await readFile(first,'utf8'),original);
});

for (const mode of ['absent','empty','missing-required','duplicate','invalid-hash','stale-hash','stale-extra','source-extra','traversal-extra']) {
  test('input hashes fail closed: '+mode, async t => {
    const f=await fixture(t), [path]=await f.seal(makeReport('clarity'));
    const report=JSON.parse(await readFile(path,'utf8'));
    if (mode==='absent') delete report.inputs;
    if (mode==='empty') report.inputs=[];
    if (mode==='missing-required') report.inputs.pop();
    if (mode==='duplicate') report.inputs.push({...report.inputs[0]});
    if (mode==='invalid-hash') report.inputs[0].sha256='not-a-hash';
    if (mode==='stale-hash') report.inputs[0].sha256='0'.repeat(64);
    if (mode==='stale-extra') { await writeFile(join(f.architecture,'specs/extra.md'),'actual'); report.inputs.push({path:'specs/extra.md',sha256:'0'.repeat(64)}); }
    if (mode==='source-extra') report.inputs.push({path:'source:src/fake.ts',sha256:digest(await readFile(join(f.root,'src/fake.ts')))});
    if (mode==='traversal-extra') report.inputs.push({path:'specs/../specs/contract.md',sha256:'0'.repeat(64)});
    await writeFile(path,JSON.stringify(report));
    const result=f.run('score',path);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Missing|Invalid|Clarity/);
  });
}

test('changing a reviewed document or linked inventory invalidates its seal', async t => {
  const f=await fixture(t), [path]=await f.seal(makeReport('clarity'));
  await writeFile(join(f.architecture,'specs/contract.md'),'Changed contract');
  const result=f.run('score',path);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Missing\/stale review input/);
});

test('future specification becomes required when the module registry links it', async t => {
  const f=await fixture(t);
  const registry=join(f.architecture,'decomposition/core-modules.json');
  const inventory=JSON.parse(await readFile(registry,'utf8'));
  inventory.modules[0].specFiles.push('specs/07-efficiency.md');
  await writeFile(registry,JSON.stringify(inventory));
  await writeFile(join(f.architecture,'specs/07-efficiency.md'),'Synthetic future specification');
  const [path]=await f.seal(makeReport('clarity'));
  const report=JSON.parse(await readFile(path,'utf8'));
  assert.ok(report.inputs.some(i => i.path==='specs/07-efficiency.md'));
  report.inputs=report.inputs.filter(i => i.path!=='specs/07-efficiency.md');
  await writeFile(path,JSON.stringify(report));
  assert.match(f.run('score',path).stderr,/Missing\/stale review input: specs\/07-efficiency.md/);
});

test('unlinked supplemental files do not expand the scored scope', async t => {
  const f=await fixture(t);
  await writeFile(join(f.architecture,'specs/07-efficiency.md'),'Unlinked supplementary content');
  const [path]=await f.seal(makeReport('clarity'));
  const report=JSON.parse(await readFile(path,'utf8'));
  assert.ok(!report.inputs.some(i => i.path==='specs/07-efficiency.md'));
});

test('re-sealing preserves extra declared inputs instead of dropping review history', async t => {
  const f=await fixture(t), report=makeReport('clarity');
  const path='specs/additional.md';
  await writeFile(join(f.architecture,path),'Additional reviewed document');
  report.inputs=[{path,sha256:'0'.repeat(64)}];
  const [sealed]=await f.seal(report);
  const result=JSON.parse(await readFile(sealed,'utf8'));
  assert.equal(result.inputs.find(i => i.path===path).sha256,digest('Additional reviewed document'));
});

test('sealing cannot erase source inputs from a supposedly blind review', async t => {
  const f=await fixture(t), report=makeReport('clarity');
  report.inputs=[{path:'source:src/fake.ts',sha256:'0'.repeat(64)}];
  const result=f.run('seal',await f.put(report));
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Clarity must stand/);
});

test('changing only an inventory hash invalidates an existing review', async t => {
  const f=await fixture(t), [path]=await f.seal(makeReport('clarity'));
  const registry=join(f.architecture,'decomposition/core-modules.json');
  const inventory=JSON.parse(await readFile(registry,'utf8'));
  inventory.documentRevision='New revision with the same question population';
  await writeFile(registry,JSON.stringify(inventory));
  assert.match(f.run('score',path).stderr,/Missing\/stale review input: decomposition\/core-modules.json/);
});

test('empty or duplicate inventory questions cannot manufacture a perfect score', async t => {
  const f=await fixture(t), registry=join(f.architecture,'decomposition/ui-modules.json');
  const inventory=JSON.parse(await readFile(registry,'utf8'));
  inventory.modules[0].acceptanceQuestions=[];
  await writeFile(registry,JSON.stringify(inventory));
  assert.match(f.run('seal',await f.put(makeReport('clarity'))).stderr,/Empty\/invalid module inventory/);
  inventory.modules[0]=makeModule('UI-01');
  inventory.modules[0].acceptanceQuestions[1]=inventory.modules[0].acceptanceQuestions[0];
  await writeFile(registry,JSON.stringify(inventory));
  assert.match(f.run('seal',await f.put(makeReport('clarity'))).stderr,/Empty\/duplicate inventory question/);
});

test('junction or symlink cannot smuggle external source into blind clarity evidence', async t => {
  const f=await fixture(t), link=join(f.architecture,'specs/external');
  try { await symlink(join(f.root,'src'),link,process.platform==='win32'?'junction':'dir'); }
  catch (error) { if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) { t.skip('OS disallows creation of test symlinks'); return; } throw error; }
  const report=makeReport('clarity'); report.modules[0].checks[0].evidence[0].path='specs/external/fake.ts';
  const result=f.run('seal',await f.put(report));
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Invalid evidence path/);
});
