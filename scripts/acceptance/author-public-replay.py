"""Independently inspect every public input and author test-only replay drafts.

Only the input manifest and original copied XLSX/CSV bytes are read. The evaluator
oracle and generator implementation are never read or imported by this process.
No product module, provider, or browser is executed. Drafts remain NOT_RUN.
"""
import csv
import hashlib
import io
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
CRITERIA_HEADERS = ["항목", "기준", "단위", "조건", "필수", "비고"]
TARGET_HEADERS = ["시료명", "항목", "결과", "단위", "조건"]


def sha(value):
    return hashlib.sha256(value).hexdigest()


def read_ref(reference):
    candidate = (ROOT / reference["path"]).resolve()
    if not candidate.is_relative_to(ROOT) or "evaluator" in candidate.parts:
        raise ValueError("Only project input/evidence files outside evaluator area are allowed")
    raw = candidate.read_bytes()
    if sha(raw) != reference["sha256"]:
        raise ValueError("Input changed after preparation")
    return raw


def coordinates(address):
    match = re.fullmatch(r"([A-Z]+)([1-9]\d*)", address)
    column = 0
    for char in match[1]:
        column = column * 26 + ord(char) - 64
    return int(match[2]), column


def address(row, column):
    letters = ""
    while column:
        column, digit = divmod(column - 1, 26)
        letters = chr(65 + digit) + letters
    return f"{letters}{row}"


def source_document(definition):
    raw = read_ref(definition["input"])
    if definition["file"].endswith(".csv"):
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
        return [{"name": "", "state": "visible", "cells": [{"cell": address(r, c), "text": text, "row": r, "column": c} for r, row in enumerate(rows, 1) for c, text in enumerate(row, 1)]}]
    result = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(s.itertext()) for s in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        relations = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).findall("m:sheets/m:sheet", NS):
            target = relations[sheet.attrib[RID]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            cells = []
            for cell in ET.fromstring(archive.read(target)).findall("m:sheetData/m:row/m:c", NS):
                value = cell.find("m:v", NS)
                inline = cell.find("m:is", NS)
                text = "".join(inline.itertext()) if inline is not None else value.text if value is not None else ""
                if cell.attrib.get("t") == "s":
                    text = shared[int(text)]
                row, column = coordinates(cell.attrib["r"])
                cells.append({"cell": cell.attrib["r"], "text": text or "", "row": row, "column": column})
            result.append({"name": sheet.attrib["name"], "state": sheet.attrib.get("state", "visible"), "cells": cells})
    return result


def tables(sheets, headers):
    found = []
    for sheet in sheets:
        by_position = {(c["row"], c["column"]): c for c in sheet["cells"]}
        for axis in ["row", "column"]:
            groups = {}
            for cell in sheet["cells"]:
                if cell["text"] in headers:
                    groups.setdefault(cell[axis], {})[cell["text"]] = cell
            for line, head in sorted(groups.items()):
                if set(head) != set(headers):
                    continue
                opposite = "column" if axis == "row" else "row"
                values = []
                maximum = max(c[axis] for c in sheet["cells"])
                for ordinal in range(line + 1, maximum + 1):
                    record = {}
                    for name in headers:
                        position = (ordinal, head[name][opposite]) if axis == "row" else (head[name][opposite], ordinal)
                        if position in by_position:
                            record[name] = by_position[position]
                    if record.get("항목", {}).get("text"):
                        values.append(record)
                if values:
                    all_cells = list(head.values()) + [cell for value in values for cell in value.values()]
                    span = f"{address(min(c['row'] for c in all_cells), min(c['column'] for c in all_cells))}:{address(max(c['row'] for c in all_cells), max(c['column'] for c in all_cells))}"
                    found.append({"sheet": sheet["name"], "state": sheet["state"], "orientation": "horizontal" if axis == "row" else "vertical", "range": span, "headers": head, "rows": values})
    return found


def citation(sheet, cell):
    return {"sheet": sheet, "cell": cell["cell"], "quote": cell["text"]}


def draft(case):
    criteria_source = next(d for d in case["inputs"] if d["role"] == "criteria")
    target_source = next(d for d in case["inputs"] if d["role"] == "target")
    criteria_sheets, target_sheets = source_document(criteria_source), source_document(target_source)
    criteria_tables, target_tables = tables(criteria_sheets, CRITERIA_HEADERS), tables(target_sheets, TARGET_HEADERS)
    candidates, records = [], []
    for table in criteria_tables:
        for row in table["rows"]:
            rule, label, unit, condition = [row[k] for k in ["기준", "항목", "단위", "조건"]]
            candidates.append({"label": label["text"], "rule": rule["text"], "unit": unit["text"], "scope": "", "conditions": [condition["text"]] if condition["text"] else [],
                "citations": [citation(table["sheet"], c) for c in [label, rule]], "unitCitations": [citation(table["sheet"], unit)] if unit["text"] else [], "conditionCitations": [citation(table["sheet"], condition)] if condition["text"] else [], "scopeCitations": [], "categoryPath": [], "hierarchyCitations": [], "sampleName": "", "sampleCitations": [], "classificationStatus": "not_applicable", "classificationNeedsConfirmation": False, "classificationReason": "원문 표에 유형 분류가 없습니다.", "needsConfirmation": False, "sharedScope": False, "replacesIndex": -1,
                "authoringEvidence": {"requiredCell": citation(table["sheet"], row["필수"]), "excludedNote": citation(table["sheet"], row["비고"]), "tableRange": table["range"]}})
    for table in target_tables:
        for row in table["rows"]:
            value = row["결과"]["text"]
            records.append({"label": row["항목"]["text"], "value": value, "unit": row["단위"]["text"], "sampleName": row["시료명"]["text"], "actualCondition": row["조건"]["text"],
                "criterionId": {"identityBinding": "actual criterion with this exact source label", "label": row["항목"]["text"]},
                "status": "pass" if value == "이상 없음" else "review", "explanation": "원문 셀의 값을 그대로 전사한 독립 작성 재현 응답입니다.", "uncertain": value in ["", "N.D.", "판독불가"], "presence": "unknown" if not value else "unreadable" if value == "판독불가" else "present",
                "evidence": [{"documentId": {"identityBinding": "current target document ID"}, **citation(table["sheet"], c)} for c in row.values() if c["text"]],
                "authoringEvidence": {"valueCell": citation(table["sheet"], row["결과"]), "conditionCell": citation(table["sheet"], row["조건"]), "tableRange": table["range"]}})
    if len(candidates) != 4 or len(records) != 4 or sorted(c["label"] for c in candidates) != sorted(r["label"] for r in records):
        raise ValueError("Independent source inspection did not establish four aligned rows")
    context_drafts = []
    for sheets, source_tables in [(criteria_sheets, criteria_tables), (target_sheets, target_tables)]:
        structures = [{"name": "원문 표", "kind": "table", "sheet": t["sheet"], "range": t["range"], "headers": list(t["headers"]), "description": "원문 헤더와 셀 위치를 확인한 표", "orientation": t["orientation"], "uncertain": False} for t in source_tables]
        for sheet in sheets:
            if sheet["cells"] and not any(t["sheet"] == sheet["name"] for t in source_tables):
                structures.append({"name": "원문 안내", "kind": "metadata", "sheet": sheet["name"], "range": sheet["cells"][0]["cell"], "headers": [], "description": sheet["cells"][0]["text"], "orientation": "unknown", "uncertain": False})
        context_drafts.append({"summary": "표 헤더, 원문 값, 조건 및 참고 열을 구분했습니다.", "documentType": "원문 표", "structure": structures, "warnings": [], "questions": []})
    unresolved = ["Context drafts require validation against actual trusted reader profiles; coverage is not authored by this fixture.", "Workbook inventory region IDs and selected-range helper outputs must be recorded before planning/extraction response bindings are completed.", "Current semantic result expectations must be independently frozen before actual pipeline execution; no generated oracle was consulted.", "Blank result handling, N.D., unreadable values, mismatched units and source conditions remain explicit comparison questions, not automatically accepted outcomes."]
    return {"schemaVersion": "1.0", "kind": "independently-source-authored-test-only-model-response-draft", "caseId": case["caseId"], "variantForEvaluatorOnly": case["variant"], "preparedAt": datetime.now(timezone.utc).isoformat(), "inputs": case["inputs"], "oracleRead": False, "productExecuted": False,
        "dispatchPolicy": "Ordered schema requests plus assertions that the observed source content contains the quoted cells. Case IDs, variant names, filenames and hashes cannot select semantic responses. IDs are bound only to observed current documents/criteria.",
        "sourceFacts": {"criteriaSheets": criteria_sheets, "targetSheets": target_sheets, "criteriaTables": criteria_tables, "targetTables": target_tables},
        "draftResponses": {"criteriaContext": context_drafts[0], "targetContext": context_drafts[1], "criteriaEligibility": {"status": "criteria", "hasNormativeContent": True, "reason": "실제 기준 열에 규범값이 있습니다.", "sourceKind": "standard", "evidence": [{"documentId": {"identityBinding": "current criteria document ID"}, **candidates[0]["citations"][1]}]}, "workbookCandidates": candidates, "overlay": {"changes": [], "additions": []}, "targetItems": records},
        "unresolved": unresolved, "readerContextCoverage": "not_run", "semanticComparison": "unresolved", "state": "not_run", "fullGateCasesPassed": 0, "completeProductAcceptance": False}


manifest_path = (ROOT / sys.argv[1]).resolve()
if not manifest_path.is_relative_to((ROOT / ".cache/rebuild/evidence").resolve()) or manifest_path.name != "input-manifest.json":
    raise ValueError("Pass the prepared project input-manifest.json")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
if len(manifest["cases"]) != 13:
    raise ValueError("All thirteen source cases are mandatory")
outputs = []
for case in manifest["cases"]:
    authored = draft(case)
    destination = manifest_path.parent / "authored" / (case["caseId"].replace(":", "-") + ".json")
    destination.parent.mkdir(exist_ok=True)
    with destination.open("x", encoding="utf-8") as stream:
        json.dump(authored, stream, ensure_ascii=False, indent=2)
    outputs.append({"caseId": case["caseId"], "artifact": {"path": destination.relative_to(ROOT).as_posix(), "sha256": sha(destination.read_bytes())}, "state": "not_run", "semanticComparison": "unresolved", "criteriaRows": 4, "targetRows": 4})
    print(json.dumps({"caseId": case["caseId"], "criteriaRows": 4, "targetRows": 4, "criteriaOrientations": [t["orientation"] for t in authored["sourceFacts"]["criteriaTables"]], "sourceValues": [r["value"] for r in authored["draftResponses"]["targetItems"]], "state": "not_run"}), flush=True)
result = {"schemaVersion": "1.0", "preparedAt": datetime.now(timezone.utc).isoformat(), "inputManifest": {"path": manifest_path.relative_to(ROOT).as_posix(), "sha256": sha(manifest_path.read_bytes())}, "authoringCode": {"path": "scripts/acceptance/author-public-replay.py", "sha256": sha(pathlib.Path(__file__).read_bytes())}, "cases": outputs, "selectedCases": 13, "oracleRead": False, "productExecuted": False, "providerCalls": {"gemini": 0, "e2b": 0}, "fullGateCasesPassed": 0}
with (manifest_path.parent / "authored-manifest.json").open("x", encoding="utf-8") as stream:
    json.dump(result, stream, ensure_ascii=False, indent=2)
