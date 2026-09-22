"""Execute original G08 physical helpers once each from a frozen source-only plan.

One Python process, sequential calls to unchanged product main functions. Expected
source cells remain evaluator-side assertions and are never supplied to a helper.
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import sys
import time
import traceback
from datetime import datetime, timezone

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[2]


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe(name):
    relative = pathlib.PurePosixPath(name)
    if relative.is_absolute() or any(part in ["..", ".", "evaluator"] or part.lower() == "oracle.json" or part.startswith(".env") for part in relative.parts):
        raise ValueError("Unsafe or evaluator-only input path")
    current = ROOT
    for part in relative.parts:
        current = current / part
        if current.is_symlink() or getattr(current, "is_junction", lambda: False)():
            raise ValueError("Linked evidence path")
    resolved = current.resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError("Evidence outside project")
    return resolved


def read_ref(reference):
    raw = safe(reference["path"]).read_bytes()
    if sha(raw) != reference["sha256"]:
        raise ValueError("Input/code hash differs from pre-execution plan: " + reference["path"])
    return raw


def reference(file):
    return {"path": file.relative_to(ROOT).as_posix(), "sha256": sha(file.read_bytes())}


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def ordered(values):
    return sorted(values, key=lambda value: (value["sheet"], value["cell"]))


plan_path = safe(sys.argv[1])
if not plan_path.is_relative_to(ROOT / ".cache/rebuild/evidence") or plan_path.name != "plan.json":
    raise ValueError("Pass the preserved physical execution plan")
plan_raw = plan_path.read_bytes()
plan = json.loads(plan_raw)
if len(plan["cases"]) != 13 or len({case["caseId"] for case in plan["cases"]}) != 13 or sum(len(case["documents"]) for case in plan["cases"]) != 26:
    raise ValueError("All thirteen public cases and twenty-six inputs required")
output = safe(plan["outputDirectory"])
if not output.is_relative_to(ROOT / ".cache/rebuild/evidence"):
    raise ValueError("Invalid physical output directory")
marker = output / "execution-started.json"
with marker.open("x", encoding="utf-8") as stream:
    json.dump({"startedAt": now(), "command": [sys.executable, "-B", "scripts/acceptance/public-physical.py", sys.argv[1]], "planRef": {"path": plan_path.relative_to(ROOT).as_posix(), "sha256": sha(plan_raw)}}, stream, indent=2)
for implementation in plan["implementationReferences"]:
    read_ref(implementation)
for case in plan["cases"]:
    read_ref(case["authoredDraftRef"])
    for document in case["documents"]:
        read_ref(document["input"])
    read_ref(case["criteriaHelper"]["requestRef"])
reader = module("public_actual_trusted_reader", "server/sandbox-document-reader.py")
helper = module("public_actual_workbook_helper", "server/criteria-workbook-profile.py")
records = []
started_at = now()


def persist(complete=False):
    value = {"schemaVersion": "1.0", "acceptanceProfile": "CURRENT_REPRODUCTION", "loop": plan["loop"], "kind": "actual-local-physical-G08-helper-execution", "planRef": {"path": plan_path.relative_to(ROOT).as_posix(), "sha256": sha(plan_raw)}, "startedAt": started_at, "updatedAt": now(), "complete": complete, "records": records, "oracleRead": False, "providerCalls": {"gemini": 0, "e2b": 0}, "fullGateCasesPassed": 0}
    (output / "executions.json").write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def invoke(case_id, phase, entrypoint, arguments, input_reference, expected, output_name):
    record = {"caseId": case_id, "phase": phase, "startedAt": now(), "command": [sys.executable, "-B", *arguments], "invocation": "actual product main imported in this one sequential Python process", "input": input_reference, "assertions": [], "outputRef": None, "exitCode": None}
    begin = time.monotonic()
    stdout, stderr = io.StringIO(), io.StringIO()
    previous = sys.argv

    def check(name, wanted, actual):
        record["assertions"].append({"name": name, "expected": wanted, "actual": actual, "passed": type(wanted) is type(actual) and wanted == actual})

    try:
        source = read_ref(input_reference)
        sys.argv = [str(ROOT / arguments[0]), *[str(safe(arg)) if arg.startswith(".cache/") else arg for arg in arguments[1:]]]
        target = safe(output_name)
        if target.exists():
            raise ValueError("Refusing to overwrite an existing physical output")
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            entrypoint.main()
        raw = json.loads(target.read_text(encoding="utf-8"))
        record["outputRef"] = reference(target)
        check("source bytes unchanged", input_reference["sha256"], sha(safe(input_reference["path"]).read_bytes()))
        if phase.startswith("reader-"):
            check("reader source identity", input_reference["sha256"], raw.get("sha256"))
            check("reader original supported status", expected["status"], raw.get("status"))
            check("reader physical coverage complete for this bounded source", expected["complete"], raw.get("coverage", {}).get("complete"))
            check("reader original sheet inventory", expected["sheets"], [{"name": sheet.get("name"), "state": sheet.get("state")} for sheet in raw.get("sheets", [])])
            actual_cells = [{"sheet": sheet["name"], "cell": cell["cell"], "value": cell.get("value")} for sheet in raw.get("sheets", []) for row in sheet.get("rows", []) for cell in row.get("cells", [])]
            check("all independently observed nonempty source cells", ordered(expected["nonemptyCells"]), ordered([cell for cell in actual_cells if cell["value"] not in ["", None]]))
            if expected["csvCells"] is not None:
                check("CSV includes actual blank fields and cell positions", ordered(expected["csvCells"]), ordered(actual_cells))
            check("no synthetic auxiliary images", expected["images"], len(raw.get("images", [])))
            coverage = raw.get("coverage", {})
            check("current cell limit respected", True, type(coverage.get("cellsRead")) is int and 0 <= coverage["cellsRead"] <= expected["cellCap"])
            check("current text limit respected", True, type(coverage.get("textChars")) is int and 0 <= coverage["textChars"] <= expected["textCap"])
            record["coverage"] = coverage
        elif phase == "criteria-inventory":
            check("inventory physically complete", expected["complete"], raw.get("complete"))
            check("inventory source sheet names and hidden state", expected["sheets"], [{"name": sheet.get("name"), "visibility": sheet.get("visibility")} for sheet in raw.get("sheets", [])])
            check("every physical sheet inventoried completely", True, all(sheet.get("complete") is True for sheet in raw.get("sheets", [])))
            record["regions"] = [{"sheet": sheet["name"], **region} for sheet in raw.get("sheets", []) for region in sheet.get("regions", [])]
        else:
            check("range read physically complete", expected["complete"], raw.get("complete"))
            check("exact frozen requested ranges", expected["ranges"], [{"sheet": region.get("sheet"), "range": region.get("range")} for region in raw.get("ranges", [])])
            cells = {(region["sheet"], cell["cell"]): {"sheet": region["sheet"], "cell": cell["cell"], "value": cell.get("text")} for region in raw.get("ranges", []) for cell in region.get("cells", []) if cell.get("text") not in ["", None]}
            check("all source cells including notes retained as physical evidence", ordered(expected["nonemptyCells"]), ordered(list(cells.values())))
            check("no bounded range truncation", True, all(region.get("truncated") is False for region in raw.get("ranges", [])))
            check("current helper cell limit respected", True, type(raw.get("cellsRead")) is int and 0 <= raw["cellsRead"] <= 6000)
        record["exitCode"] = 0
    except BaseException as error:
        record["exitCode"] = int(error.code) if isinstance(error, SystemExit) and isinstance(error.code, int) and error.code else 1
        record["error"] = {"name": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
        target = safe(output_name)
        if target.is_file():
            record["partialOutputRef"] = reference(target)
    finally:
        sys.argv = previous
        record.update(endedAt=now(),elapsedSeconds=time.monotonic()-begin,stdout=stdout.getvalue(),stderr=stderr.getvalue())
        records.append(record)
        persist()
        print(json.dumps({"caseId": case_id, "phase": phase, "exitCode": record["exitCode"], "assertionFailures": sum(not assertion["passed"] for assertion in record["assertions"])}), flush=True)


for case in plan["cases"]:
    for document in case["documents"]:
        invoke(case["caseId"], "reader-"+document["role"], reader, ["server/sandbox-document-reader.py", document["input"]["path"], document["kind"], document["output"]], document["input"], document["expected"], document["output"])
    definition = case["criteriaHelper"]
    invoke(case["caseId"], "criteria-inventory", helper, ["server/criteria-workbook-profile.py", definition["input"]["path"], "inventory", definition["inventoryOutput"]], definition["input"], definition["expected"], definition["inventoryOutput"])
    invoke(case["caseId"], "criteria-range-read", helper, ["server/criteria-workbook-profile.py", definition["input"]["path"], "read", definition["detailsOutput"], definition["requestRef"]["path"]], definition["input"], definition["expected"], definition["detailsOutput"])
persist(True)
current_references = [reference(safe(item["path"])) for item in plan["implementationReferences"]]
stable = current_references == plan["implementationReferences"]
failures = sum(not assertion["passed"] for record in records for assertion in record["assertions"])
errors = sum(record["exitCode"] != 0 for record in records)
scope_counts = {"publicCases": len(plan["cases"]), "readerInvocations": sum(record["phase"].startswith("reader-") for record in records), "criteriaWorkbooks": len(plan["cases"]), "inventoryInvocations": sum(record["phase"] == "criteria-inventory" for record in records), "rangeReadInvocations": sum(record["phase"] == "criteria-range-read" for record in records), "totalProductHelperInvocations": len(records)}
exit_code = 1 if failures or errors or not stable or scope_counts != plan["expectedScope"] else 0
report = {"schemaVersion": "1.0", "acceptanceProfile": "CURRENT_REPRODUCTION", "loop": plan["loop"], "kind": "actual-local-G08-physical-prerequisites", "planRef": reference(plan_path), "executionRef": reference(output / "executions.json"), "startedAt": started_at, "endedAt": now(), "command": [sys.executable, "-B", "scripts/acceptance/public-physical.py", plan_path.relative_to(ROOT).as_posix()], "exitCode": exit_code, "pythonVersion": sys.version, "origin": "unchanged product trusted-reader and workbook-helper mains executed sequentially in pinned local Python", "implementationReferencesBefore": plan["implementationReferences"], "implementationReferencesAfter": current_references, "implementationStable": stable, "inputManifestRef": plan["inputManifestRef"], "oracleRead": False, "providerCalls": {"gemini": 0, "e2b": 0}, "counts": {**scope_counts, "assertions": sum(len(record["assertions"]) for record in records), "assertionFailures": failures, "executionErrors": errors, "semanticCasesResolved": 0, "fullGateCasesPassed": 0}, "cases": [{"caseId": case["caseId"], "physicalInvocationExitCodes": [record["exitCode"] for record in records if record["caseId"] == case["caseId"]], "semanticState": "unresolved", "fullGateCaseState": "not_run"} for case in plan["cases"]], "completeProductAcceptance": False, "limitations": ["This supplies actual physical source artifacts only. No model/context/eligibility/discovery response replay, engine review or browser was executed.", "Physical source fidelity does not establish semantic criteria completeness or a G08 pass.", "Whole-product freeze and independently reviewed current-behavior expectations remain prerequisites for semantic replay."]}
(output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"report": reference(output / "report.json"), "counts": report["counts"], "implementationStable": stable, "exitCode": exit_code}))
sys.exit(exit_code)
