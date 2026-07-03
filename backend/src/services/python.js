import { spawn } from 'node:child_process';
import { PYTHON_BIN, PYTHON_DIR } from '../config.js';

// Run a Python script in ./python and parse its single-line JSON stdout. The
// scripts do markitdown extraction and FAISS index work only; embeddings are
// computed in Node and passed in via `input` (JSON on stdin) — vectors are too
// large to fit in argv. Rejects on non-zero exit or invalid JSON.
export function runPython(script, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [script, ...args], {
      cwd: PYTHON_DIR,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      const trimmed = stdout.trim();
      let parsed = null;
      if (trimmed) {
        // The script prints JSON on the last non-empty line.
        const lastLine = trimmed.split(/\r?\n/).filter(Boolean).pop();
        try { parsed = JSON.parse(lastLine); } catch { /* fall through */ }
      }
      if (parsed && parsed.ok === false) {
        return reject(new Error(parsed.error || 'Python script reported failure'));
      }
      if (code !== 0 || !parsed) {
        return reject(new Error(stderr.trim() || `Python exited with code ${code}`));
      }
      resolve(parsed);
    });

    // A script that doesn't read stdin (extract.py, remove.py) may exit before
    // we finish writing; ignore the resulting EPIPE.
    child.stdin.on('error', () => {});
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}
