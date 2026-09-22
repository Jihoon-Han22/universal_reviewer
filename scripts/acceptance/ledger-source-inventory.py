"""Independent source XML inventory, before invoking the product ledger mapper/writer.

Reads only L01..L06 original workbooks. No golden JSON or runtime mapper is imported.
"""
import hashlib
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inspect(index):
    relative = f"golden/ledger/L{index:02d}.xlsx"
    source = ROOT / relative
    original = source.read_bytes()
    sheets = []
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        shared = []
        if "xl/sharedStrings.xml" in names:
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(item.itertext()))
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {r.attrib["Id"]: r.attrib["Target"] for r in relationships}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            target = targets[sheet.attrib[RID]]
            xml_path = target.lstrip("/") if target.startswith("/") else "xl/" + target
            xml = ET.fromstring(archive.read(xml_path))
            cells = []
            for cell in xml.findall("m:sheetData/m:row/m:c", NS):
                value_node = cell.find("m:v", NS)
                raw = value_node.text if value_node is not None else None
                kind = cell.attrib.get("t", "n")
                inline = cell.find("m:is", NS)
                value = shared[int(raw)] if kind == "s" and raw is not None else "".join(inline.itertext()) if inline is not None else raw
                formula = cell.find("m:f", NS)
                cells.append({"ref": cell.attrib["r"], "type": kind, "style": cell.attrib.get("s"), "value": value, "formula": formula.text if formula is not None else None})
            sheets.append({"name": sheet.attrib["name"], "state": sheet.attrib.get("state", "visible"), "path": xml_path, "dimension": (xml.find("m:dimension", NS).attrib.get("ref") if xml.find("m:dimension", NS) is not None else None), "cells": cells, "merges": [m.attrib["ref"] for m in xml.findall("m:mergeCells/m:mergeCell", NS)], "protection": xml.find("m:sheetProtection", NS) is not None})
        entries = [{"path": name, "sha256": digest(archive.read(name)), "bytes": len(archive.read(name))} for name in sorted(names)]
    return {"id": f"L{index:02d}", "input": {"path": relative, "sha256": digest(original)}, "sourceUnchanged": digest(source.read_bytes()) == digest(original), "entries": entries, "sheets": sheets}


destination = (ROOT / sys.argv[1]).resolve()
allowed = (ROOT / ".cache/rebuild/evidence").resolve()
if not destination.is_relative_to(allowed):
    raise ValueError("Inventory output must stay in project evidence directory")
destination.mkdir(parents=True, exist_ok=True)
records = []
started = datetime.now(timezone.utc).isoformat()
for index in range(1, 7):
    record = inspect(index)
    records.append(record)
    print(json.dumps({"id": record["id"], "sheets": [{**s, "cells": s["cells"][:100]} for s in record["sheets"]]}, ensure_ascii=True), flush=True)
output = {"schemaVersion": "1.0", "kind": "independent-source-inventory-not-product-execution", "startedAt": started, "endedAt": datetime.now(timezone.utc).isoformat(), "oracleAccess": False, "providerCalls": {"gemini": 0, "e2b": 0}, "records": records}
(destination / "source-inventory.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
