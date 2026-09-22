"""Synthetic demo evaluator; standard-library only. Not an OCR implementation."""
from pathlib import Path
import json,math,sys
ROOT=Path(__file__).resolve().parents[1]
def equal(a,b):
    if isinstance(a,(int,float)) and not isinstance(a,bool) and isinstance(b,(int,float)) and not isinstance(b,bool):return math.isclose(a,b,rel_tol=1e-8,abs_tol=1e-10)
    return a==b
def evaluate(pred,gold):
    errors=[];scores={}; g=gold['fields'];p={(r['case_id'],r['field_id']):r for r in pred.get('fields',[])}
    if len(p)!=len(pred.get('fields',[])):errors.append('duplicate_field_ids')
    keys={(r['case_id'],r['field_id']) for r in g}
    if set(p)-keys:errors.append('unexpected_field_ids')
    correct=dict(value=0,criterion=0,verdict=0,source=0);tp=fp=fn=0
    for f in g:
        key=(f['case_id'],f['field_id']);q=p.get(key,{})
        value=all(equal(q.get(k),f.get(k)) for k in ['value','unit','qualifier']) and bool(q)
        criterion=all(equal(q.get(k),f.get(k)) for k in ['operator','limit','criterion_unit']) and bool(q)
        verdict=q.get('verdict')==f['verdict']
        source=q.get('criterion_source')==f['criterion_source']
        for name,ok in [('value',value),('criterion',criterion),('verdict',verdict),('source',source)]:
            correct[name]+=int(ok)
            if not ok:errors.append(':'.join(key)+':'+name)
        want=set(f['report_pages']);got=set(q.get('report_pages',[]));tp+=len(want&got);fp+=len(got-want);fn+=len(want-got)
        if want!=got:errors.append(':'.join(key)+':retrieval')
    scores.update({k+'_accuracy':v/len(g) for k,v in correct.items()})
    scores['page_precision']=tp/(tp+fp) if tp+fp else 0
    scores['page_recall']=tp/(tp+fn) if tp+fn else 0
    scores['page_f1']=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0
    wanted={(x['case_id'],x['sheet'],x['cell']):x['value'] for x in gold['writer_cells']}
    got={(x['case_id'],x['sheet'],x['cell']):x['value'] for x in pred.get('writer_cells',[])}
    hits=sum(k in got and equal(got[k],v) for k,v in wanted.items());scores['writer_cell_accuracy']=hits/len(wanted)
    extras=set(got)-set(wanted);scores['unexpected_written_cells']=len(extras)
    if hits<len(wanted) or extras:errors.append('writer_cells_mismatch')
    return dict(exact_pass=not errors,metrics=scores,error_count=len(errors),errors=errors)
if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: python evaluation/evaluate.py prediction.json')
    gold=json.loads((ROOT/'golden/canonical_answer.json').read_text(encoding='utf-8'))
    pred=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    result=evaluate(pred,gold);print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(0 if result['exact_pass'] else 1)
