import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

const STATUS_LABEL = { processing: '⏳ Processing', ready: '✅ Ready', error: '⚠️ Error' };
const ACCEPT = '.pdf,.txt,.md,.docx,.pptx,.html,.csv,.xlsx';
const MAX_UPLOAD_MB = 25; // must match the server's multer limit

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const pollRef = useRef(null);
  const toast = useToast();

  const load = async () => {
    try {
      const { documents } = await api.listDocuments();
      setDocs(documents);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 2500);
    return () => clearInterval(pollRef.current);
  }, []);

  const uploadFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast(`"${file.name}" is larger than the ${MAX_UPLOAD_MB} MB limit`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      await api.uploadDocument(file);
      toast(`Uploaded "${file.name}" — processing…`, 'info');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const onDelete = async (id, name) => {
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
    } catch (err) {
      toast(err.message);
    }
  };

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
          hidden
          onChange={(e) => uploadFile(e.target.files?.[0])}
        />
        {uploading ? (
          <span>Uploading…</span>
        ) : (
          <span>
            <strong>Drag &amp; drop</strong> a document here, or <u>click to browse</u>
            <br />
            <span className="muted small">PDF, DOCX, PPTX, XLSX, HTML, CSV, Markdown, TXT · max {MAX_UPLOAD_MB} MB</span>
          </span>
        )}
      </div>

      <table className="doc-table">
        <thead>
          <tr><th>Name</th><th>Status</th><th>Chunks</th><th>Model</th><th></th></tr>
        </thead>
        <tbody>
          {loading && [0, 1, 2].map((i) => (
            <tr key={`sk-${i}`} className="skeleton-row"><td colSpan={5}><span className="skeleton" /></td></tr>
          ))}
          {!loading && docs.length === 0 && (
            <tr><td colSpan={5} className="muted">No documents yet — upload one to get started.</td></tr>
          )}
          {!loading && docs.map((d) => (
            <tr key={d.id}>
              <td>{d.original_name}</td>
              <td title={d.error || ''} className={`status-${d.status}`}>{STATUS_LABEL[d.status] || d.status}</td>
              <td>{d.chunk_count}</td>
              <td className="muted">{d.embed_model || '—'}</td>
              <td>
                {d.status === 'error' && (
                  <button className="link-btn" onClick={() => onRetry(d.id, d.original_name)}>Retry</button>
                )}
                <button className="link-btn danger" onClick={() => onDelete(d.id, d.original_name)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
