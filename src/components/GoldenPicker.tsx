import {useEffect,useRef,useState} from 'react';
import {FolderOpen,X,Loader2,LoaderCircle,Check,ArrowRight,Info,Table2} from 'lucide-react';
import {get,post} from '../api';
import type {GoldenCatalog,GoldenLoadResponse} from '../types';

type GoldenPickerProps = {
  mode?: 'all'|'criteria'|'target';
  onClose: () => void;
  onLoad: (data: GoldenLoadResponse) => void;
};

export default function GoldenPicker({mode='all',onClose,onLoad}: GoldenPickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [catalog,setCatalog] = useState<GoldenCatalog|null>(null);
  const [criterionId,setCriterion] = useState('C01');
  const [ids,setIds] = useState<string[]>(['P01']);
  const [format,setFormat] = useState<'pdf'|'png'>('pdf');
  const [ledgerId,setLedger] = useState('');
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const includesCriteria = mode !== 'target';
  const includesTargets = mode !== 'criteria';
  const maxCertificates = catalog?.maxCertificates ?? 10;
  const criterion = catalog?.criteria.find(entry => entry.id === criterionId);
  const ledger = catalog?.ledgers.find(entry => entry.id === ledgerId);
  const notices = [
    includesCriteria && criterion?.notice,
    mode === 'all' && ledger?.notice,
    ...(includesTargets && ids.includes('P10') && format === 'png'
      ? ['P10 PNG에는 첫 페이지만 있습니다. 전체 성적서는 PDF를 선택하세요.'] : []),
    ...(mode === 'all' && ledgerId && !ids.includes('P01')
      ? ['준비된 검토대장의 연결 예시는 P01 성적서입니다. 다른 성적서는 번호에 맞는 행이 있는지 확인합니다.'] : []),
  ].filter((value): value is string => Boolean(value));

  useEffect(() => {
    const element = dialog.current;
    const controller = new AbortController();
    element?.showModal();
    void get<GoldenCatalog>('/api/golden',controller.signal)
      .then(data => { if (!controller.signal.aborted) setCatalog(data); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => {
      controller.abort();
      element?.close();
    };
  },[]);

  function toggleCertificate(id: string) {
    setIds(current => current.includes(id)
      ? current.filter(selected => selected !== id)
      : current.length < maxCertificates ? [...current,id] : current);
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await post<GoldenLoadResponse>('/api/golden/load',{
        mode,
        ...(includesCriteria ? {criterionId} : {}),
        ...(includesTargets ? {certificateIds:ids,format} : {}),
        ...(mode === 'all' && ledgerId ? {ledgerId} : {}),
      });
      onLoad(data);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return <dialog
    className={`golden-picker golden-picker-mode-${mode}`}
    ref={dialog}
    onCancel={e => { e.preventDefault(); if (!loading) onClose(); }}
    onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}
  >
    <div className="golden-picker-shell">
      <header className="golden-picker-header">
        <div className="golden-picker-emblem"><FolderOpen size={23}/></div>
        <div>
          <span className="golden-picker-eyebrow">GOLDEN DOCUMENTS</span>
          <h2>{mode === 'criteria' ? '검토 기준서 선택' : mode === 'target' ? '시험성적서 선택' : '기준서 · 시험성적서 선택'}</h2>
          <p>실제 파일을 불러와 검토 흐름을 체험합니다.</p>
        </div>
        <button className="golden-picker-close" aria-label="닫기" onClick={onClose} disabled={loading}><X size={20}/></button>
      </header>
      {!catalog ? <div className="golden-picker-empty" role="status">
        {error ? <><Info size={23}/><p>{error}</p></> : <><LoaderCircle className="golden-picker-spinner" size={25}/><p>문서 목록을 불러오는 중입니다.</p></>}
      </div> : <>
        <div className="golden-picker-body">
          {includesCriteria && <section className="golden-picker-panel" aria-labelledby="golden-criteria-label">
            <div className="golden-picker-section-title"><h3 id="golden-criteria-label">기준서</h3><small>1개 선택</small></div>
            <div className="golden-picker-list" role="radiogroup" aria-label="기준서 선택">
              {catalog.criteria.map(d => {
                const checked = criterionId === d.id;
                return <label className={`golden-picker-entry ${checked ? 'is-selected' : ''}`} key={d.id}>
                  <input type="radio" name="golden-criterion" checked={checked} disabled={loading} onChange={() => setCriterion(d.id)}/>
                  <span className="golden-picker-marker">{checked && <Check size={13}/>}</span>
                  <strong>{d.id}</strong>
                  <span className="golden-picker-entry-description">{d.description}</span>
                </label>;
              })}
            </div>
          </section>}
          {includesTargets && <section className="golden-picker-panel" aria-labelledby="golden-certificates-label">
            <div className="golden-picker-section-title"><h3 id="golden-certificates-label">시험성적서</h3><small>{`최대 ${maxCertificates}개 · ${ids.length}개 선택`}</small></div>
            <div className="golden-picker-format" role="group" aria-label="성적서 파일 형식">
              {(['pdf','png'] as const).map(f => <button className={format === f ? 'is-active' : ''} aria-pressed={format === f} disabled={loading} onClick={() => setFormat(f)} key={f}>{f.toUpperCase()}</button>)}
            </div>
            <div className="golden-picker-list golden-picker-certificate-list">
              {catalog.certificates.map(d => {
                const checked = ids.includes(d.id);
                return <label className={`golden-picker-entry ${checked ? 'is-selected' : ''}`} key={d.id}>
                  <input type="checkbox" name="golden" checked={checked} disabled={loading || (!checked && ids.length >= maxCertificates)} onChange={() => toggleCertificate(d.id)}/>
                  <span className="golden-picker-marker">{checked && <Check size={13}/>}</span>
                  <strong>{d.id}</strong>
                  <span className="golden-picker-entry-description">{d.description}</span>
                </label>;
              })}
            </div>
          </section>}
        </div>
        {mode === 'all' && <section className="golden-picker-ledger" aria-labelledby="golden-ledger-label">
          <div><Table2 size={18}/><h3 id="golden-ledger-label">검토대장 선택</h3><small>선택 사항</small></div>
          <select aria-label="검토대장 선택" value={ledgerId} disabled={loading} onChange={e => setLedger(e.target.value)}>
            <option value="">선택 안 함</option>
            {catalog.ledgers.map(entry => <option value={entry.id} key={entry.id}>{entry.id} · {entry.description}</option>)}
          </select>
        </section>}
        {notices.length > 0 && <div className="golden-picker-notices" role="status"><Info size={16}/><div>{notices.map(notice => <p key={notice}>{notice}</p>)}</div></div>}
        {error && <p className="golden-picker-error" role="alert">{error}</p>}
        <footer className="golden-picker-footer">
          <p>선택한 원본 파일을 입력 목록에 추가합니다.</p>
          <button className="golden-picker-load" disabled={loading || (includesTargets && !ids.length)} onClick={load}>
            {loading ? <Loader2 className="spin" size={16}/> : <FolderOpen size={16}/>}
            선택한 파일 불러오기<ArrowRight size={16}/>
          </button>
        </footer>
      </>}
    </div>
  </dialog>;
}
