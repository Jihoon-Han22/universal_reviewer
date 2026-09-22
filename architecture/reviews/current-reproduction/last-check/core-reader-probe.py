import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('original_reader', root / 'server' / 'sandbox-document-reader.py')
reader_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader_module)
results = []
for length in [1_499_999, 1_500_000, 1_500_001]:
    fixture = Path(__file__).with_name('reader-boundary.txt')
    fixture.write_bytes(b'x' * length)
    reader = reader_module.Reader(fixture, 'txt', Path(__file__).with_name('unused.json'))
    reader.read()
    results.append({'inputChars': length, 'retainedChars': len(reader.result['text']), 'status': reader.result['status'], 'coverage': reader.coverage, 'warnings': reader.result['warnings']})
Path(__file__).with_name('core-reader-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
