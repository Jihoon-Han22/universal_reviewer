"""Verify six actual ledger executions with independent stdlib ZIP/XML reading.

This never imports or invokes the product mapper/writer and never reads oracle JSON.
"""
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


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_ref(reference):
    candidate = (ROOT / reference["path"]).resolve()
    if not candidate.is_relative_to(ROOT) or any(p == ".." for p in pathlib.PurePosixPath(reference["path"]).parts):
        raise ValueError("Unsafe evidence path")
    data = candidate.read_bytes()
    if sha(data) != reference["sha256"]:
        raise ValueError(f"Artifact digest changed: {reference['path']}")
    return data


def strip_target_cells(data, addresses):
    value = data.decode("utf-8")
    for address in addresses:
        pattern = r'<((?:\w+:)?c)\b[^>]*\br=["\x27]' + re.escape(address) + r'["\x27][^>]*(?:\s*/>|>[\s\S]*?</\1>)'
        value = re.sub(pattern, "", value)
    return value


def cell_values(xml):
    return {cell.attrib["r"]: {"attrs": dict(cell.attrib), "value": "".join(cell.find("m:is", NS).itertext()) if cell.find("m:is", NS) is not None else None, "formula": cell.find("m:f", NS) is not None} for cell in ET.fromstring(xml).findall("m:sheetData/m:row/m:c", NS)}


directory = (ROOT / sys.argv[1]).resolve()
if not directory.is_relative_to((ROOT / ".cache/rebuild/evidence").resolve()):
    raise ValueError("Pass a project evidence directory")
execution = json.loads((directory / "executions.json").read_text(encoding="utf-8"))
plan = json.loads(read_ref(execution["planRef"]))
if not execution["complete"] or len(plan["documents"]) != 6 or len(execution["records"]) != 6:
    raise ValueError("Require all six original planned and executed ledgers")
inventory = json.loads(read_ref(plan["sourceInventoryRef"]))
started = datetime.now(timezone.utc).isoformat()
cases = []
for definition in plan["documents"]:
    matches = [r for r in execution["records"] if r["caseId"] == definition["caseId"]]
    if len(matches) != 1:
        raise ValueError("Missing or duplicated actual ledger case")
    actual = matches[0]
    assertions = []

    def check(name, expected, observed):
        assertions.append({"name": name, "expected": expected, "actual": observed, "passed": type(expected) is type(observed) and expected == observed})

    original = read_ref(definition["input"])
    check("actual product invocation completed", None, actual["error"])
    check("original source file preserved", definition["input"]["sha256"], sha(original))
    check("original buffer before mapper", definition["input"]["sha256"], actual.get("bufferDigestBefore"))
    check("original buffer after writer", definition["input"]["sha256"], actual.get("bufferDigestAfter"))
    check("source file after writer", definition["input"]["sha256"], actual.get("inputDigestAfter"))
    mapping = actual.get("mapping") or {}
    check("mapping status", definition["status"], mapping.get("status"))
    check("mapping code", definition["code"], mapping.get("code"))
    check("exact original key", definition["key"], mapping.get("key"))
    check("target addresses", definition["targets"], mapping.get("targetCells"))
    if definition["code"] == "duplicate_key":
        check("all duplicate source candidates", [{"sheet": "검토대장", "row": 5}, {"sheet": "검토대장", "row": 12}], mapping.get("candidates"))
    else:
        check("worksheet", definition["sheet"], mapping.get("sheet"))
        check("header row", 1, mapping.get("headerRow"))
        check("role columns", definition["columns"], [mapping.get(k) for k in ["keyColumn", "resultColumn", "noteColumn"]])
        check("matching row", definition["rows"], mapping.get("matchingRows"))
        check("original blank target values", {a: "" for a in definition["targets"]}, mapping.get("existingValues"))
        check("mapping source digest", definition["input"]["sha256"], mapping.get("sourceDigest"))
    writer = actual.get("writer") or {}
    check("writer result kind", definition["expectedWriter"]["kind"], writer.get("kind"))
    if definition["status"] == "blocked":
        check("blocked writer rejection status", 400, writer.get("status"))
        check("blocked writer no copy", False, bool(writer.get("outputRef")))
    elif writer.get("kind") == "copy":
        output = read_ref(writer["outputRef"])
        with zipfile.ZipFile(io.BytesIO(original)) as before, zipfile.ZipFile(io.BytesIO(output)) as after:
            before_names, after_names = sorted(before.namelist()), sorted(after.namelist())
            check("ZIP entry names unchanged", before_names, after_names)
            changed = [name for name in before_names if name not in after_names or before.read(name) != after.read(name)]
            check("only worksheet entry bytes changed", [definition["sheetPath"]], changed)
            source_xml, copy_xml = before.read(definition["sheetPath"]), after.read(definition["sheetPath"])
            check("XML outside two target cells byte equivalent", sha(strip_target_cells(source_xml, definition["targets"]).encode()), sha(strip_target_cells(copy_xml, definition["targets"]).encode()))
            before_cells, after_cells = cell_values(source_xml), cell_values(copy_xml)
            for address, value in zip(definition["targets"], [plan["result"], plan["note"]]):
                cell = after_cells.get(address, {})
                check(f"{address} literal text", value, cell.get("value"))
                check(f"{address} text type", "inlineStr", cell.get("attrs", {}).get("t"))
                check(f"{address} no formula", False, cell.get("formula"))
                check(f"{address} original style preserved", before_cells.get(address, {}).get("attrs", {}).get("s"), cell.get("attrs", {}).get("s"))
            source_record = next(r for r in inventory["records"] if r["id"] == definition["id"])
            check("source archive inventory hashes", source_record["entries"], [{"path": name, "sha256": sha(before.read(name)), "bytes": len(before.read(name))} for name in before_names])
    cases.append({"caseId": definition["caseId"], "input": definition["input"], "assertions": assertions, "subphaseAssertionsMatched": all(a["passed"] for a in assertions), "fullCaseStatus": "not_run", "pendingPhases": definition["pendingPhases"]})
source_stable = all(sha((ROOT / r["path"]).read_bytes()) == r["sha256"] for r in plan["implementationReferences"])
failures = sum(not a["passed"] for c in cases for a in c["assertions"])
exit_code = 1 if failures or not source_stable or not execution["implementationStable"] else 0
report = {"schemaVersion": "1.0", "acceptanceProfile": "CURRENT_REPRODUCTION", "loop": plan["loop"], "kind": "actual-offline-ledger-subphases-independently-verified", "planRef": execution["planRef"], "executionRef": {"path": (directory / "executions.json").relative_to(ROOT).as_posix(), "sha256": sha((directory / "executions.json").read_bytes())}, "startedAt": started, "endedAt": datetime.now(timezone.utc).isoformat(), "command": [sys.executable, "-B", "scripts/acceptance/verify-ledger-slice.py", sys.argv[1]], "exitCode": exit_code, "origin": "independent-Python-stdlib-ZIP-XML-verification-of-actual-product-output", "oracleAccess": False, "providerCalls": {"gemini": 0, "e2b": 0}, "implementationStable": source_stable and execution["implementationStable"], "counts": {"selectedOriginalLedgers": 6, "mapperInvocations": 6, "writerInvocations": 6, "copies": sum(r.get("writer", {}).get("kind") == "copy" for r in execution["records"]), "assertions": sum(len(c["assertions"]) for c in cases), "assertionFailures": failures, "fullGateCasesPassed": 0}, "cases": cases, "completeProductAcceptance": False, "limitations": ["Only original ledger deterministic mapping and copy/rejection subphases executed. Actual run proposals/fingerprints, provider assessment, HTTP confirmation, browser download remain NOT_RUN.", "No Excel application render/recalculation is claimed. Formulas, other entries and XML outside two targets were compared as original bytes.", "No oracle JSON entered the runtime. Expectations were fixed from independent original XML inventory before product import/invocation."]}
(directory / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"report": (directory / "report.json").relative_to(ROOT).as_posix(), "sha256": sha((directory / "report.json").read_bytes()), "counts": report["counts"], "implementationStable": report["implementationStable"], "exitCode": exit_code}))
sys.exit(exit_code)
