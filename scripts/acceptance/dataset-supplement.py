"""Actual local product helpers for a frozen 10-input or 26-workbook supplement."""
import builtins
import contextlib
import hashlib
import importlib.metadata
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import traceback
from datetime import datetime, timezone

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
original_open = builtins.open


def now():
    return datetime.now(timezone.utc).isoformat()


def safe(name):
    parts = PurePosixPath(name).parts
    if PurePosixPath(name).is_absolute() or any(part in ('..', '.', 'evaluator', 'golden_answers') or part.startswith('.env') for part in parts):
        raise ValueError('unsafe evidence or evaluator path')
    current = ROOT
    for part in parts:
        current = current / part
        if current.is_symlink() or getattr(current, 'is_junction', lambda: False)():
            raise ValueError('linked path')
    if not current.resolve().is_relative_to(ROOT):
        raise ValueError('path outside workspace')
    return current


def digest(file):
    with original_open(file, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def reference(file):
    return {'path': file.relative_to(ROOT).as_posix(), 'sha256': digest(file)}


def read_ref(entry):
    file = safe(entry['path'])
    if digest(file) != entry['sha256']:
        raise ValueError('frozen identity mismatch: ' + entry['path'])
    return file


def write(file, value, exclusive=False):
    with original_open(file, 'x' if exclusive else 'w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)


def module(name, entry):
    spec = importlib.util.spec_from_file_location(name, read_ref(entry))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def dependency_snapshot(mode):
    if mode not in ('readers', 'workbook'):
        raise ValueError('unsupported parser dependency scope')
    roots = ['openpyxl'] + (['PyMuPDF', 'Pillow'] if mode == 'readers' else [])
    # openpyxl conditionally uses these installed packages while loading cells,
    # XML and embedded images. Record absence as well as source-byte identity.
    optional = ['lxml', 'numpy', 'defusedxml', 'Pillow']
    distributions, absent, visiting = {}, set(), set()

    def visit(name, required=True):
        canonical = re.sub(r'[-_.]+', '-', name).lower()
        if canonical in visiting:
            return
        try:
            distribution = importlib.metadata.distribution(name)
        except importlib.metadata.PackageNotFoundError:
            if required:
                raise ValueError('required installed parser missing: ' + name)
            absent.add(canonical)
            return
        visiting.add(canonical)
        if not distribution.files:
            raise ValueError('installed parser RECORD required: ' + name)
        files, import_roots = {}, set()
        for item in distribution.files:
            if '__pycache__' in item.parts or str(item).endswith(('.pyc', '.pyo')) or any(p.startswith('.env') for p in item.parts):
                continue
            file = Path(distribution.locate_file(item)).absolute().resolve()
            if not file.is_relative_to(ROOT):
                raise ValueError('parser dependency outside workspace: ' + name)
            file = safe(file.relative_to(ROOT).as_posix())
            if file.is_file():
                files[file.relative_to(ROOT).as_posix()] = reference(file)
            else:
                raise ValueError('installed parser file missing: ' + str(item))
            if item.parts and item.parts[0] not in ('.', '..') and not item.parts[0].endswith(('.dist-info', '.egg-info')):
                import_root = Path(distribution.locate_file(item.parts[0]))
                if import_root.is_dir():
                    import_roots.add(import_root)
        # Include files added under an importable package after installation;
        # relying on RECORD alone would miss such import-affecting additions.
        for directory in sorted(import_roots):
            for current, subdirectories, filenames in os.walk(directory):
                subdirectories[:] = sorted(d for d in subdirectories if d not in ('__pycache__', '.git') and not d.startswith('.env'))
                for filename in sorted(filenames):
                    if filename.endswith(('.pyc', '.pyo')) or filename.startswith('.env'):
                        continue
                    relative_file = (Path(current) / filename).relative_to(ROOT).as_posix()
                    if relative_file not in files:
                        file = safe(relative_file)
                        files[relative_file] = reference(file)
        requirements = distribution.requires or []
        distributions[canonical] = {'name': distribution.metadata['Name'], 'version': distribution.version,
                                    'requires': requirements, 'files': [files[key] for key in sorted(files)]}
        for requirement in requirements:
            if re.search(r'\bextra\s*[!=]', requirement):
                continue
            matched = re.match(r'^([A-Za-z0-9][A-Za-z0-9_.-]*)', requirement)
            if not matched:
                raise ValueError('unsupported parser requirement metadata')
            visit(matched[1], required=';' not in requirement)

    for name in roots:
        visit(name)
    for name in optional:
        visit(name, required=False)
    imports = []
    module_names = {'openpyxl': ['openpyxl'], 'et-xmlfile': ['et_xmlfile'], 'pillow': ['PIL'],
                    'pymupdf': ['fitz', 'pymupdf'], 'lxml': ['lxml'], 'numpy': ['numpy'], 'defusedxml': ['defusedxml']}
    for distribution_name in sorted(set(distributions) | absent):
        if distribution_name not in module_names:
            continue
        bound_files = {entry['path'] for entry in distributions.get(distribution_name, {}).get('files', [])}
        for module_name in module_names[distribution_name]:
            spec = importlib.util.find_spec(module_name)
            if spec is None:
                if distribution_name in distributions:
                    raise ValueError('installed parser import cannot resolve: ' + module_name)
                imports.append({'module': module_name, 'distribution': distribution_name, 'origin': None, 'locations': []})
                continue
            if distribution_name not in distributions or spec.origin in (None, 'built-in', 'frozen'):
                raise ValueError('unbound parser import resolution: ' + module_name)
            origin = safe(Path(spec.origin).absolute().relative_to(ROOT).as_posix())
            origin_ref = reference(origin)
            if origin_ref['path'] not in bound_files:
                raise ValueError('parser import origin outside bound distribution files: ' + module_name)
            locations = [safe(Path(location).absolute().relative_to(ROOT).as_posix()).relative_to(ROOT).as_posix()
                         for location in spec.submodule_search_locations or []]
            if any(not any(file.startswith(location + '/') for file in bound_files) for location in locations):
                raise ValueError('parser search location outside bound distribution files: ' + module_name)
            imports.append({'module': module_name, 'distribution': distribution_name, 'origin': origin_ref, 'locations': locations})
    entries = [distributions[key] for key in sorted(distributions)]
    return {'scope': mode, 'roots': roots, 'optionalAbsent': sorted(absent), 'distributions': entries, 'imports': imports,
            'fileCount': sum(len(entry['files']) for entry in entries),
            'options': {'openpyxlLxmlEnabled': os.environ.get('OPENPYXL_LXML', 'True') == 'True',
                        'openpyxlDefusedxmlEnabled': os.environ.get('OPENPYXL_DEFUSEDXML', 'True') == 'True'},
            'runtime': {'version': sys.version, 'executable': sys.executable, 'executableSha256': digest(Path(sys.executable)), 'dontWriteBytecode': sys.dont_write_bytecode}}


def node_dependency_references(dependencies):
    return dependencies['node']['manifests'] + [item for package in dependencies['node']['packages'] for item in package['files']]


if len(sys.argv) == 3 and sys.argv[1] == '--dependencies':
    print(json.dumps(dependency_snapshot(sys.argv[2]), ensure_ascii=False, separators=(',', ':')))
    sys.exit(0)


plan_file = safe(sys.argv[1])
if plan_file.name != 'plan.json' or not plan_file.is_relative_to(ROOT / '.cache/rebuild/evidence'):
    raise ValueError('expected immutable physical plan')
plan = json.loads(plan_file.read_text(encoding='utf-8'))
kind = plan['kind']
reader_mode = kind == 'pre-execution-original-dataset-reader-supplement'
if kind not in ('pre-execution-original-dataset-reader-supplement', 'pre-execution-original-workbook-inventory', 'pre-execution-original-workbook-ranges'):
    raise ValueError('unsupported physical plan kind')
if Path(sys.executable).resolve() != safe('.cache/rebuild/python/Scripts/python.exe').resolve() or digest(Path(sys.executable)) != plan['pythonExecutableRef']['sha256']:
    raise ValueError('pinned Python identity mismatch')
output = safe(plan['outputDirectory'])
if not output.is_relative_to(ROOT / '.cache/rebuild/evidence'):
    raise ValueError('invalid output location')
for item in plan['implementationReferences']:
    read_ref(item)
for item in node_dependency_references(plan['dependencies']):
    read_ref(item)
dependency_before = dependency_snapshot('readers' if reader_mode else 'workbook')
if dependency_before != plan['dependencies']['python']:
    raise ValueError('frozen Python parser dependency identity mismatch')
for document in plan['documents']:
    read_ref(document['input'])
runtime = {**dependency_before['runtime'], 'packages': {entry['name']: entry['version'] for entry in dependency_before['distributions']}}
uploads_ref = None
if reader_mode:
    uploads_file = output / 'uploads.json'
    uploads = json.loads(uploads_file.read_text(encoding='utf-8'))
    uploads_ref = reference(uploads_file)
    if len(plan['documents']) != 10 or len(uploads['records']) != 10 or uploads['planRef'] != reference(plan_file):
        raise ValueError('expected exact 10 original admissions')
    if uploads.get('identity', {}).get('matched') is not True:
        raise ValueError('upload identity check failed; reader invocation prohibited')
    by_id = {record['caseId']: record for record in uploads['records']}
    if len(by_id) != 10:
        raise ValueError('duplicate admission case')
    program_ref = next(r for r in plan['implementationReferences'] if r['path'] == 'server/sandbox-document-reader.py')
    operations = [{'caseId': d['id'], 'input': d['input'], 'kind': d['kind'], 'operation': 'reader'} for d in plan['documents']]
else:
    if len(plan['documents']) != 26 or len({d['id'] for d in plan['documents']}) != 26:
        raise ValueError('all 26 criteria workbook denominator required')
    program_ref = next(r for r in plan['implementationReferences'] if r['path'] == 'server/criteria-workbook-profile.py')
    operations = plan['operations']
write(output / 'physical-started.json', {'planRef': reference(plan_file), 'startedAt': now(), 'pid': os.getpid(), 'runtime': runtime,
                                      'uploadIdentityMatched': uploads['identity']['matched'] if reader_mode else None,
                                      'dependencyIdentityMatched': True}, True)
entrypoint = module('actual_supplement_reader' if reader_mode else 'actual_supplement_workbook_helper', program_ref)
records = []
started_at = now()
for operation in operations:
    case_id = operation['caseId']
    suffix = '-round' + str(operation['round']) if 'round' in operation else ''
    directory = output / (case_id.replace(':', '-') + suffix)
    directory.mkdir(exist_ok=False)
    target = directory / 'result.json'
    source = read_ref(operation['input'])
    record = {'caseId': case_id, 'operation': operation['operation'], 'input': operation['input'], 'programRef': program_ref,
              'startedAt': now(), 'readerExecuted': False, 'assertions': [], 'images': [], 'exitCode': None}
    captured, errors = io.StringIO(), io.StringIO()
    previous = sys.argv

    def check(name, wanted, actual, passed=None):
        record['assertions'].append({'name': name, 'expected': wanted, 'actual': actual, 'passed': type(wanted) is type(actual) and wanted == actual if passed is None else bool(passed)})

    def guest_open(file, *args, **kwargs):
        name = os.fspath(file) if not isinstance(file, int) else ''
        if isinstance(name, str) and name.startswith('/home/user/'):
            tail = name[len('/home/user/'):]
            if not re.fullmatch(r'document-image-\d+\.png', tail):
                raise ValueError('unexpected product guest output path')
            file = directory / tail
        return original_open(file, *args, **kwargs)

    try:
        if reader_mode and not by_id[case_id]['actual']['accepted']:
            record.update(status='not_run_upload_rejected', uploadStatus=by_id[case_id]['actual']['status'], exitCode=1)
            check('supplement input admitted before reader', True, False)
            continue
        if reader_mode:
            sys.argv = [str(read_ref(program_ref)), str(source), operation['kind'], str(target)]
            builtins.open = guest_open
            record['readerExecuted'] = True
        else:
            sys.argv = [str(read_ref(program_ref)), str(source), operation['operation'], str(target)]
            if operation['operation'] == 'read':
                request_file = directory / 'request.json'
                write(request_file, operation['request'], True)
                record['requestRef'] = reference(request_file)
                sys.argv.append(str(request_file))
        record['command'] = [runtime['executable'], '-B', *sys.argv]
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(errors):
            entrypoint.main()
        actual = json.loads(target.read_text(encoding='utf-8'))
        record['outputRef'] = reference(target)
        check('original bytes unchanged', operation['input']['sha256'], digest(source))
        if reader_mode:
            record['profileRef'] = record['outputRef']
            record.update(status=actual.get('status'), coverage=actual.get('coverage'), inventory=actual.get('inventory'), warnings=actual.get('warnings'))
            check('reader source identity', operation['input']['sha256'], actual.get('sha256'))
            check('reader supported physical status', ['ready', 'partial'], actual.get('status'), actual.get('status') in ('ready', 'partial'))
            check('reader cell limit', [0, 100000], actual.get('coverage', {}).get('cellsRead'), type(actual.get('coverage', {}).get('cellsRead')) is int and 0 <= actual['coverage']['cellsRead'] <= 100000)
            check('reader text limit', [0, 1500000], actual.get('coverage', {}).get('textChars'), type(actual.get('coverage', {}).get('textChars')) is int and 0 <= actual['coverage']['textChars'] <= 1500000)
            check('reader image limit', [0, 8], len(actual.get('images', [])), len(actual.get('images', [])) <= 8)
            for image in actual.get('images', []):
                image_file = directory / Path(image['path']).name
                record['images'].append({**reference(image_file), 'guestPath': image['path'], 'bytes': image_file.stat().st_size})
            if operation['kind'] == 'pdf':
                import fitz
                with fitz.open(source) as pdf:
                    record['independentPhysicalPages'] = len(pdf)
                check('reader PDF inventory equals physical inventory', record['independentPhysicalPages'], actual['inventory'].get('pageCount'))
        elif operation['operation'] == 'inventory':
            record.update(complete=actual.get('complete'), warnings=actual.get('warnings'), sheets=[{'name': sheet['name'], 'visibility': sheet['visibility'], 'complete': sheet['complete'], 'profiledCells': sheet['profiledCells'], 'regions': len(sheet['regions'])} for sheet in actual.get('sheets', [])])
            check('inventory has sheet and warning arrays', True, isinstance(actual.get('sheets'), list) and isinstance(actual.get('warnings'), list))
            check('inventory current profiled cell limit', [0, 200000], sum(s['profiledCells'] for s in actual.get('sheets', [])), sum(s['profiledCells'] for s in actual.get('sheets', [])) <= 200000)
        else:
            record.update(complete=actual.get('complete'), cellsRead=actual.get('cellsRead'), ranges=[{'sheet': r['sheet'], 'range': r['range'], 'truncated': r['truncated']} for r in actual.get('ranges', [])])
            check('exact frozen range requests', operation['request']['ranges'], [{'sheet': r['sheet'], 'range': r['range']} for r in actual.get('ranges', [])])
            check('current range cell limit', [0, 6000], actual.get('cellsRead'), type(actual.get('cellsRead')) is int and 0 <= actual['cellsRead'] <= 6000)
        record['exitCode'] = 0
    except BaseException as error:
        record.update(exitCode=1, error={'name': type(error).__name__, 'message': str(error), 'traceback': traceback.format_exc()})
        if target.is_file():
            record['partialOutputRef'] = reference(target)
    finally:
        builtins.open = original_open
        sys.argv = previous
        record.update(endedAt=now(), stdout=captured.getvalue(), stderr=errors.getvalue())
        records.append(record)
        write(output / 'physical-progress.json', {'planRef': reference(plan_file), 'runtime': runtime, 'records': records})
        print(json.dumps({'caseId': case_id, 'operation': operation['operation'], 'exitCode': record['exitCode'], 'failedAssertions': sum(not a['passed'] for a in record['assertions'])}), flush=True)
after = [reference(safe(item['path'])) for item in plan['implementationReferences']]
dependency_after = dependency_snapshot('readers' if reader_mode else 'workbook')
node_references_after = [reference(safe(item['path'])) for item in node_dependency_references(plan['dependencies'])]
dependencies_stable = dependency_before == dependency_after and node_references_after == node_dependency_references(plan['dependencies'])
stable = after == plan['implementationReferences'] and dependencies_stable
exit_code = int(not stable or any(record['exitCode'] or any(not a['passed'] for a in record['assertions']) for record in records))
report = {'schemaVersion': '1.0', 'acceptanceProfile': plan['acceptanceProfile'], 'loop': plan['loop'], 'kind': 'actual-local-physical-helper-supplement',
          'planRef': reference(plan_file), 'uploadsRef': uploads_ref, 'startedAt': started_at, 'endedAt': now(), 'runtime': runtime,
          'implementationReferences': plan['implementationReferences'], 'implementationReferencesAfter': after, 'implementationStable': stable,
          'dependenciesStable': dependencies_stable, 'dependencyIdentityBefore': plan['dependencies']['sha256'],
          'pythonDependenciesAfter': dependency_after, 'nodeDependencyReferencesAfter': node_references_after,
          'records': records, 'counts': {'plannedInvocations': len(operations), 'actualInvocations': sum('command' in r for r in records), 'readerInvocations': sum(r['readerExecuted'] for r in records), 'executionErrors': sum(bool(r['exitCode']) for r in records), 'fullGateCasesPassed': 0},
          'oracleAccess': False, 'providerCalls': {'gemini': 0, 'e2b': 0}, 'exitCode': exit_code, 'finalGateFreeze': False, 'completeProductAcceptance': False,
          'limitations': ['Local physical helper results are not semantic or full-gate acceptance.', 'Partial, truncated and deferred ranges remain visible; no missing criterion is synthesized.']}
write(output / 'physical-report.json', report, True)
print(json.dumps({'reportRef': reference(output / 'physical-report.json'), 'counts': report['counts'], 'implementationStable': stable, 'exitCode': exit_code}))
sys.exit(exit_code)
