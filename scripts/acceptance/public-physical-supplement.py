"""Execute only the explicitly frozen canonical-range helper supplement.

No model, provider, browser, oracle or semantic assertion is executed here.
"""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import sys
import traceback
from datetime import datetime, timezone

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[2]


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def safe(name):
    relative = pathlib.PurePosixPath(name)
    if relative.is_absolute() or any(part in ["..", ".", "evaluator"] or part.lower() == "oracle.json" or part.startswith(".env") for part in relative.parts):
        raise ValueError("Unsafe or evaluator path")
    current = ROOT
    for part in relative.parts:
        current = current / part
        if current.is_symlink() or getattr(current, "is_junction", lambda: False)():
            raise ValueError("Linked evidence path")
    if not current.resolve().is_relative_to(ROOT):
        raise ValueError("Path outside workspace")
    return current


def read_ref(reference):
    raw = safe(reference["path"]).read_bytes()
    if digest(raw) != reference["sha256"]:
        raise ValueError("Frozen input or program changed: " + reference["path"])
    return raw


def reference(file):
    return {"path": file.relative_to(ROOT).as_posix(), "sha256": digest(file.read_bytes())}


plan_path = safe(sys.argv[1])
if plan_path.name != "supplementary-physical-plan.json" or not plan_path.is_relative_to(ROOT / ".cache/rebuild/evidence/LOOP-004"):
    raise ValueError("Pass the explicit LOOP004 supplement plan")
plan = json.loads(plan_path.read_bytes())
if len(plan["cases"]) != plan["expectedInvocations"] or plan["expectedInvocations"] != 1:
    raise ValueError("Only the reviewed single helper invocation is permitted")
for item in plan["physicalProgramReferences"]:
    read_ref(item)
read_ref(plan["runnerRef"])
runner_before = reference(pathlib.Path(__file__).resolve())
if runner_before != plan["runnerRef"]:
    raise ValueError("Wrong runner for frozen supplement plan")
output = plan_path.parent
with (output / "supplement-started.json").open("x", encoding="utf-8") as stream:
    json.dump({"planRef": reference(plan_path), "runnerRef": runner_before, "startedAt": now()}, stream, indent=2)
started_at = now()
records = []
for case in plan["cases"]:
    read_ref(case["inputRef"])
    read_ref(case["requestRef"])
    read_ref(case["helperRef"])
    output_file = safe(case["outputPath"])
    if output_file.exists():
        raise ValueError("Refusing to overwrite prior physical evidence")
    spec = importlib.util.spec_from_file_location("actual_workbook_helper_supplement", safe(case["helperRef"]["path"]))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    arguments = [case["helperRef"]["path"], case["inputRef"]["path"], "read", case["outputPath"], case["requestRef"]["path"]]
    record = {"caseId": case["caseId"], "phase": "criteria-range-read", "input": case["inputRef"], "requestRef": case["requestRef"], "programRef": case["helperRef"], "command": [sys.executable, "-B", *arguments], "invocation": "actual unchanged product helper main imported once in pinned local Python", "startedAt": now(), "assertions": [], "outputRef": None}
    stdout, stderr = io.StringIO(), io.StringIO()

    def check(name, expected, actual):
        record["assertions"].append({"name": name, "expected": expected, "actual": actual, "passed": type(expected) is type(actual) and expected == actual})

    try:
        sys.argv = [str(safe(arguments[0])), str(safe(arguments[1])), "read", str(output_file), str(safe(arguments[4]))]
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            module.main()
        result = json.loads(output_file.read_bytes())
        record["outputRef"] = reference(output_file)
        check("actual helper read complete", True, result.get("complete"))
        check("literal canonical request ranges", case["expectedRanges"], [{"sheet": region["sheet"], "range": region["range"]} for region in result["ranges"]])
        actual_cells = {(region["sheet"], cell["cell"]): {"sheet": region["sheet"], "cell": cell["cell"], "text": cell["text"]} for region in result["ranges"] for cell in region["cells"] if cell.get("text")}
        order = lambda values: sorted(values, key=lambda value: (value["sheet"], value["cell"]))
        check("all independently inspected nonempty source cells", order(case["expectedNonemptyCells"]), order(list(actual_cells.values())))
        check("no range truncated", True, all(region.get("truncated") is False for region in result["ranges"]))
        check("source input unchanged", case["inputRef"]["sha256"], reference(safe(case["inputRef"]["path"]))["sha256"])
        check("frozen request unchanged", case["requestRef"]["sha256"], reference(safe(case["requestRef"]["path"]))["sha256"])
        record["exitCode"] = 0
    except BaseException as error:
        record["exitCode"] = 1
        record["error"] = {"name": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
        if output_file.is_file():
            record["partialOutputRef"] = reference(output_file)
    finally:
        record.update(endedAt=now(), stdout=stdout.getvalue(), stderr=stderr.getvalue())
        records.append(record)
after = [reference(safe(item["path"])) for item in plan["physicalProgramReferences"]]
stable = after == plan["physicalProgramReferences"] and runner_before == reference(pathlib.Path(__file__).resolve())
exit_code = int(not stable or any(record["exitCode"] or any(not assertion["passed"] for assertion in record["assertions"]) for record in records))
report = {"schemaVersion": "1.0", "acceptanceProfile": "CURRENT_REPRODUCTION", "loop": "LOOP-004", "kind": "actual-local-physical-G08-canonical-range-supplement", "origin": "actual unchanged trusted workbook helper main", "planRef": reference(plan_path), "runnerRef": runner_before, "startedAt": started_at, "endedAt": now(), "command": [sys.executable, "-B", "scripts/acceptance/public-physical-supplement.py", plan_path.relative_to(ROOT).as_posix()], "pythonVersion": sys.version, "implementationReferencesBefore": plan["physicalProgramReferences"], "implementationReferencesAfter": after, "implementationStable": stable, "complete": True, "records": records, "exitCode": exit_code, "oracleRead": False, "providerCalls": {"gemini": 0, "e2b": 0}, "semanticCasesResolved": 0, "fullGateCasesPassed": 0, "completeProductAcceptance": False}
report_file = output / "supplement-report.json"
with report_file.open("x", encoding="utf-8") as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
print(json.dumps({"reportRef": reference(report_file), "invocations": len(records), "assertions": sum(len(record["assertions"]) for record in records), "implementationStable": stable, "exitCode": exit_code}))
sys.exit(exit_code)
