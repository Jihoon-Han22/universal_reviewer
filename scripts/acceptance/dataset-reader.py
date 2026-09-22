"""Offline execution of the unchanged trusted reader, with guest-path I/O mapped locally.

This is an E2B filesystem test double, not a provider or context/model execution.
The evaluator plan carries only original input paths/hashes; no oracle is read.
"""
import builtins
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
PLAN = Path(sys.argv[1]).resolve()
if not PLAN.is_relative_to(ROOT / '.cache' / 'rebuild'):
    raise ValueError('plan outside evidence workspace')
plan = json.loads(PLAN.read_text(encoding='utf-8'))
OUTPUT = (ROOT / plan['outputDirectory']).resolve()
if not OUTPUT.is_relative_to(ROOT / '.cache' / 'rebuild'):
    raise ValueError('output outside evidence workspace')
spec = importlib.util.spec_from_file_location('actual_trusted_reader', ROOT / 'server' / 'sandbox-document-reader.py')
reader_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader_module)
original_open = builtins.open

def digest(file):
    with original_open(file, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def relative(file):
    return file.relative_to(ROOT).as_posix()

for entry in plan['implementationReferences'] + [plan['registry']]:
    if digest(ROOT / entry['path']) != entry['sha256']:
        raise ValueError('stale program or registry before reader execution: ' + entry['path'])
uploads_path = OUTPUT / 'uploads.json'
uploads = json.loads(uploads_path.read_text(encoding='utf-8'))
uploads_by_id = {record['caseId']: record for record in uploads['records']}
if len(plan['documents']) != 70 or len(uploads_by_id) != 70:
    raise ValueError('all 70 actual upload attempts required')
runtime = {'version': sys.version, 'executable': sys.executable, 'executableSha256': digest(Path(sys.executable)), 'dontWriteBytecode': sys.dont_write_bytecode}
with original_open(OUTPUT / 'reader-started.json', 'x', encoding='utf-8') as stream:
    json.dump({'startedAtUnix': time.time(), 'pid': os.getpid(), 'runtime': runtime, 'planSha256': digest(PLAN), 'uploadsSha256': digest(uploads_path)}, stream)
records = []
for case in plan['documents']:
    started = time.time()
    source = (ROOT / case['input']['path']).resolve()
    if not source.is_relative_to(ROOT) or not source.is_file() or source.is_symlink():
        raise ValueError('unsafe source')
    if digest(source) != case['input']['sha256']:
        raise ValueError('input changed before reader execution')
    upload = uploads_by_id[case['id']]
    if upload['actual']['accepted'] != case['expected']['uploadSizeAccepted']:
        raise ValueError('actual admission differs from pre-execution expectation')
    directory = OUTPUT / 'reader' / case['id'].replace(':', '-')
    guest = directory / 'guest'
    guest.mkdir(parents=True, exist_ok=True)
    profile_path = directory / 'profile.json'

    def guest_open(file, *args, **kwargs):
        name = os.fspath(file) if not isinstance(file, int) else ''
        if isinstance(name, str) and name.startswith('/home/user/'):
            tail = name[len('/home/user/'):]
            if '/' in tail or '\\' in tail or '..' in tail:
                raise ValueError('unexpected guest path')
            file = guest / tail
        return original_open(file, *args, **kwargs)

    physical_pages = None
    if case['kind'] == 'pdf':
        import fitz
        with fitz.open(source) as pdf:
            physical_pages = len(pdf)
    if not upload['actual']['accepted']:
        record = {'caseId': case['id'], 'category': case['category'], 'input': case['input'], 'startedAtUnix': started,
                  'endedAtUnix': time.time(), 'physicalPages': physical_pages, 'readerExecuted': False,
                  'status': 'not_run_upload_rejected', 'uploadStatus': upload['actual']['status'],
                  'inventory': {}, 'coverage': {'cellsRead': 0, 'textChars': 0}, 'images': [],
                  'sourceUnchanged': digest(source) == case['input']['sha256'], 'contextExecuted': False,
                  'providerCalls': {'gemini': 0, 'e2b': 0}}
        records.append(record)
        (OUTPUT / 'reader-progress.json').write_text(json.dumps({'records': records}, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'caseId': case['id'], 'readerExecuted': False, 'uploadStatus': record['uploadStatus'], 'physicalPages': physical_pages}), flush=True)
        continue
    captured = io.StringIO()
    before_argv = sys.argv
    try:
        builtins.open = guest_open
        sys.argv = [str(ROOT / 'server' / 'sandbox-document-reader.py'), str(source), case['kind'], str(profile_path)]
        with contextlib.redirect_stdout(captured):
            reader_module.main()
    finally:
        builtins.open = original_open
        sys.argv = before_argv
    profile = json.loads(profile_path.read_text(encoding='utf-8'))
    images = []
    for image in profile.get('images', []):
        image_file = guest / Path(image['path']).name
        images.append({'guestPath': image['path'], 'path': relative(image_file), 'sha256': digest(image_file), 'bytes': image_file.stat().st_size})
    record = {'caseId': case['id'], 'category': case['category'], 'input': case['input'], 'startedAtUnix': started, 'readerExecuted': True,
              'endedAtUnix': time.time(), 'physicalPages': physical_pages,
              'profileRef': {'path': relative(profile_path), 'sha256': digest(profile_path)},
              'status': profile.get('status'), 'inventory': profile.get('inventory'),
              'coverage': profile.get('coverage'), 'warnings': profile.get('warnings'),
              'readerSha256': profile.get('sha256'), 'images': images,
              'sourceUnchanged': digest(source) == case['input']['sha256'],
              'stdout': captured.getvalue(), 'contextExecuted': False, 'providerCalls': {'gemini': 0, 'e2b': 0}}
    records.append(record)
    (OUTPUT / 'reader-progress.json').write_text(json.dumps({'records': records}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'caseId': case['id'], 'reader': record['status'], 'physicalPages': physical_pages, 'images': len(images)}), flush=True)

stable = all(digest(ROOT / entry['path']) == entry['sha256'] for entry in plan['implementationReferences'])
report = {'schemaVersion': '2.0', 'kind': 'offline-actual-trusted-reader-subphase', 'pythonVersion': sys.version,
          'runtime': runtime, 'planSha256': digest(PLAN), 'uploadsSha256': digest(uploads_path), 'implementationStable': stable,
          'guestFilesystem': 'Only /home/user/document-image-N.png writes remapped to local evidence directory.',
          'providerCalls': {'gemini': 0, 'e2b': 0}, 'records': records,
          'completeProductAcceptance': False}
(OUTPUT / 'reader-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
sys.exit(0 if stable else 1)
