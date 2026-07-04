import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

const STATUS_LABEL = { processing: '⏳ Processing', ready: '✅ Ready', error: '⚠️ Error' };
const ACCEPT = '.pdf,.txt,.md,.docx,.pptx,.html,.csv,.xlsx';
const MAX_UPLOAD_MB = 25; // must match the server's multer limit
const POLL_MS = 2500;

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total }
  const [dragging, setDragging] = useState(false);
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [confirmingId, setConfirmingId] = useState(null);
  const fileRef = useRef(null);
  const pollRef = useRef(null);
  const confirmTimerRef = useRef(null);
  const toast = useToast();

  // Poll only while something is processing; stop once everything settles.
  const load = async () => {
    try {
      const { documents } = await api.listDocuments();
      setDocs(documents);
      const anyProcessing = documents.some((d) => d.status === 'processing');
      if (!anyProcessing && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (!pollRef.current) pollRef.current = setInterval(load, POLL_MS);
  };

  useEffect(() => {
    load();
    startPolling();
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const uploadFiles = async (fileList) => {
    const files = [...(fileList || [])];
    if (files.length === 0) return;

    const oversized = files.filter((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    for (const f of oversized) {
      toast(`"${f.name}" is larger than the ${MAX_UPLOAD_MB} MB limit`);
    }
    const valid = files.filter((f) => !oversized.includes(f));
    if (valid.length === 0) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploadProgress({ done: 0, total: valid.length });
    let ok = 0;
    let failed = 0;
    for (const file of valid) {
      try {
        await api.uploadDocument(file);
        ok += 1;
      } catch (err) {
        failed += 1;
        toast(`"${file.name}": ${err.message}`);
      }
      setUploadProgress({ done: ok + failed, total: valid.length });
    }
    setUploadProgress(null);
    if (fileRef.current) fileRef.current.value = '';
    if (ok > 0) {
      toast(`Uploaded ${ok} document${ok === 1 ? '' : 's'} — processing…`, 'info');
      await load();
      startPolling();
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    uploadFiles(e.dataTransfer.files);
  };

  // Two-step inline delete: first click arms, second click (within 3 s) deletes.
  const onDeleteClick = async (id, name) => {
    if (confirmingId !== id) {
      setConfirmingId(id);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmingId(null), 3000);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmingId(null);
    try {
      await api.deleteDocument(id);
      toast(`Deleted "${name}"`, 'info');
      await load();
    } catch (err) {
      toast(err.message);
    }
  };

  const onRetry = async (id, name) => {
    try {
      await api.retryDocument(id);
      toast(`Retrying "${name}" — processing…`, 'info');
      await load();
      startPolling();
    } catch (err) {
      toast(err.message);
    }
  };

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const sorted = [...docs].sort((a, b) => {
    const { key, dir } = sort;
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return dir === 'asc' ? cmp : -cmp;
  });

  const sortHeader = (key, label) => (
    <th role="button" tabIndex={0} className="sortable" onClick={() => toggleSort(key)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(key); } }}>
      {label}{sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="page">
      <h1>Documents</h1>

      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => uploadFiles(e.target.files)}
        />
        {uploadProgress ? (
          <span>Uploading {Math.min(uploadProgress.done + 1, uploadProgress.total)}/{uploadProgress.total}…</span>
        ) : (
          <span>
            <strong>Drag &amp; drop</strong> documents here, or <u>click to browse</u>
            <br />
            <span className="muted small">PDF, DOCX, PPTX, XLSX, HTML, CSV, Markdown, TXT · max {MAX_UPLOAD_MB} MB each</span>
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="doc-table">
          <thead>
            <tr>
              {sortHeader('original_name', 'Name')}
              {sortHeader('status', 'Status')}
              <th>Chunks</th>
              <th>Model</th>
              {sortHeader('created_at', 'Uploaded')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && [0, 1, 2].map((i) => (
              <tr key={`sk-${i}`} className="skeleton-row"><td colSpan={6}><span className="skeleton" /></td></tr>
            ))}
            {!loading && docs.length === 0 && (
              <tr><td colSpan={6} className="muted">No documents yet — upload one to get started.</td></tr>
            )}
            {!loading && sorted.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.original_name}
                  {d.status === 'error' && d.error && (
                    <div className="error small doc-error">{d.error}</div>
                  )}
                </td>
                <td title={d.error || ''} className={`status-${d.status}`}>{STATUS_LABEL[d.status] || d.status}</td>
                <td>{d.chunk_count}</td>
                <td className="muted">{d.embed_model || '—'}</td>
                {/* SQLite datetime('now') is UTC "YYYY-MM-DD HH:MM:SS" — make it ISO. */}
                <td className="muted">{d.created_at ? new Date(`${d.created_at.replace(' ', 'T')}Z`).toLocaleDateString() : '—'}</td>
                <td className="row-actions">
                  {d.status === 'error' && (
                    <button className="link-btn" onClick={() => onRetry(d.id, d.original_name)}>Retry</button>
                  )}
                  <button
                    className={`link-btn danger ${confirmingId === d.id ? 'confirming' : ''}`}
                    onClick={() => onDeleteClick(d.id, d.original_name)}
                  >
                    {confirmingId === d.id ? 'Confirm?' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
