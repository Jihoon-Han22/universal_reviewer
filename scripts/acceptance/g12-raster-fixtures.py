"""Prepare only synthetic G12 image bytes. No product import or environment reads."""
import hashlib
import json
from pathlib import Path
import sys
from datetime import datetime, timezone
from PIL import Image, __version__ as pillow_version

root = Path(__file__).resolve().parents[2]
if len(sys.argv) != 2:
    raise SystemExit('Usage: python -B scripts/acceptance/g12-raster-fixtures.py .cache/rebuild/OUTPUT')
relative = Path(sys.argv[1])
if relative.is_absolute() or '..' in relative.parts or relative.parts[:2] != ('.cache', 'rebuild'):
    raise SystemExit('G12_UNSAFE_OUTPUT')
current = root
for part in relative.parts:
    current = current / part
    if current.exists() and (current.is_symlink() or current.is_junction() or not current.is_dir()):
        raise SystemExit('G12_UNSAFE_OUTPUT')
    current.mkdir(exist_ok=True)
if any(current.iterdir()):
    raise SystemExit('G12_OUTPUT_NOT_EMPTY')
started = datetime.now(timezone.utc).isoformat()
image = Image.new('RGB', (2, 2), (40, 100, 160))
files = {}
for extension, format_name in [('png', 'PNG'), ('jpg', 'JPEG'), ('webp', 'WEBP')]:
    destination = current / ('valid.' + extension)
    image.save(destination, format=format_name)
    data = destination.read_bytes()
    with Image.open(destination) as reopened:
        reopened.load()
        if reopened.size != (2, 2) or reopened.format != format_name:
            raise SystemExit('G12_RASTER_REOPEN_FAILED')
    files[extension] = {'path': destination.relative_to(root).as_posix(), 'sha256': hashlib.sha256(data).hexdigest()}
manifest = {'schemaVersion': '1.0', 'kind': 'g12-synthetic-rasters', 'acceptanceProfile': 'CURRENT_REPRODUCTION', 'origin': 'actual-Pillow-synthetic-image-generation-and-reopen', 'command': [sys.executable, '-B', *sys.argv], 'startedAt': started, 'endedAt': datetime.now(timezone.utc).isoformat(), 'exitCode': 0, 'pythonVersion': sys.version.split()[0], 'pillowVersion': pillow_version, 'oracleAccess': False, 'providerCalls': {'gemini': 0, 'e2b': 0}, 'files': files}
destination = current / 'manifest.json'
destination.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'manifest': destination.relative_to(root).as_posix(), 'images': len(files), 'productExecuted': False}))
