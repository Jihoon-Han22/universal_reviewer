"""Fixed typed reread program; requests select source data and never execute code."""
import importlib.util
import json
import os
import re
import sys

def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate key')
        result[key] = value
    return result

def address(value):
    match = re.fullmatch(r'([A-Z]{1,3})([1-9][0-9]{0,6})', str(value).replace('$', '').upper())
    if not match:
        raise ValueError('address')
    column = 0
    for char in match[1]:
        column = column * 26 + ord(char) - 64
    row = int(match[2])
    if column > 16384 or row > 1048576:
        raise ValueError('bounds')
    return column, row

def reread(input_path, kind, request_path):
    if os.path.getsize(request_path) > 16384:
        raise ValueError('request size')
    with open(request_path, encoding='utf-8') as handle:
        request = json.load(handle, object_pairs_hook=strict_object)
    if set(request) != {'requests'} or not isinstance(request['requests'], list) or not 1 <= len(request['requests']) <= 8:
        raise ValueError('requests')
    reader_path = os.path.join(os.path.dirname(__file__), 'document-reader.py')
    if not os.path.exists(reader_path):
        reader_path = os.path.join(os.path.dirname(__file__), 'sandbox-document-reader.py')
    spec = importlib.util.spec_from_file_location('trusted_document_reader', reader_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    reader = module.Reader(input_path, kind)
    profile = reader.read()
    selections, chars, cells_read = [], 0, 0
    complete = profile['coverage']['complete'] is True
    for selector in request['requests']:
        selector_kind = selector.get('kind')
        if selector_kind == 'sheet':
            if set(selector) != {'kind', 'sheet', 'range'}:
                raise ValueError('sheet keys')
            sheet = next((s for s in profile.get('sheets', []) if s['name'] == selector['sheet']), None)
            if not sheet:
                raise ValueError('sheet')
            bounds = selector['range'].split(':')
            if len(bounds) not in (1, 2):
                raise ValueError('range')
            start, end = address(bounds[0]), address(bounds[-1])
            if start[0] > end[0] or start[1] > end[1]:
                raise ValueError('reversed range')
            rows = []
            for row in sheet.get('rows', []):
                values = []
                for cell in row['cells']:
                    column, number = address(cell['cell'])
                    if start[0] <= column <= end[0] and start[1] <= number <= end[1]:
                        if cells_read >= 10000:
                            complete = False
                            break
                        values.append(cell)
                        cells_read += 1
                if values:
                    rows.append({'row': row['row'], 'cells': values})
            region = {'sheet': sheet['name'], 'range': selector['range'], 'rows': rows,
                      'mergedRanges': sheet.get('mergedRanges', []), 'hiddenRows': sheet.get('hiddenRows', []), 'hiddenColumns': sheet.get('hiddenColumns', [])}
        elif selector_kind in ('blocks', 'text'):
            if set(selector) != {'kind', 'start', 'end'}:
                raise ValueError('selection keys')
            start, end = selector['start'], selector['end']
            values = profile.get('blocks', []) if selector_kind == 'blocks' else profile.get('text', '').splitlines()
            maximum = 200 if selector_kind == 'blocks' else 1000
            if type(start) is not int or type(end) is not int or not 1 <= start <= end <= len(values) or end - start + 1 > maximum:
                raise ValueError('selection bounds')
            region = {'blocks': values[start-1:end]} if selector_kind == 'blocks' else {'lines': [{'line': n+1, 'text': values[n]} for n in range(start-1, end)]}
        else:
            raise ValueError('selector kind')
        source = json.dumps(region, ensure_ascii=False)
        remaining = max(0, 120000 - chars)
        if len(source) > remaining:
            source = source[:remaining]
            complete = False
        chars += len(source)
        selections.append({'request': selector, 'source': source})
    return {'sha256': profile['sha256'], 'kind': kind, 'coverage': {'complete': complete, 'requested': len(request['requests']),
        'returned': len(selections), 'truncated': not complete, 'cellsRead': cells_read, 'textChars': chars}, 'selections': selections,
        'warnings': [] if complete else ['Trusted reread retained incomplete source coverage']}

if __name__ == '__main__':
    result = reread(*sys.argv[1:4])
    with open(sys.argv[4], 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False)
    print(json.dumps({'cellsRead': result['coverage']['cellsRead'], 'returned': result['coverage']['returned'], 'requested': result['coverage']['requested']}))
