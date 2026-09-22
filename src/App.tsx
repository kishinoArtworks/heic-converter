import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { UploadCloud, Image as ImageIcon, FileText, Loader2, Download, Trash2, CheckCircle2 } from 'lucide-react';
import { FORMATS, PNG_COLORS, GIF_COLORS, INPUT_EXT, PDF_EXT, ACCEPT, PDF_SCALES, extOf, convertImage, convertCanvas, loadPdf } from './convert';
import type { Format, PdfDoc } from './convert';
import './App.css';

type DownloadMethod = 'zip' | 'multiple' | 'manual';

const ZIP_NAME = 'converted_images.zip';

interface FileItem {
  id: string;
  baseName: string;              // 保存するときの名前（拡張子なし）
  label: string;                 // 画面に出す名前
  file?: File;                   // 画像のとき
  pdf?: { doc: PdfDoc; page: number }; // PDF の1ページぶんのとき
  status: 'pending' | 'converting' | 'done' | 'error';
  blob?: Blob;
  error?: string;
}

const newId = () => Math.random().toString(36).substring(7);

// 「変換後に自動保存」の選択はブラウザに覚えさせる。初期値はオフ
const AUTO_SAVE_KEY = 'hengen.autoSaveZip';
const readAutoSaveZip = () => {
  try { return localStorage.getItem(AUTO_SAVE_KEY) === '1'; } catch { return false; }
};
const writeAutoSaveZip = (on: boolean) => {
  try { localStorage.setItem(AUTO_SAVE_KEY, on ? '1' : '0'); } catch { /* 使えない環境では覚えないだけ */ }
};

// 1ページあたり約1.05秒（200ページの実測が3分27秒）
const estimate = (count: number) => {
  const sec = Math.round(count * 1.05);
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}分` : `${m}分${s}秒`;
};

function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [format, setFormat] = useState<Format>('image/png');
  const [pngColors, setPngColors] = useState(0);
  const [gifColors, setGifColors] = useState(256);
  const [quality, setQuality] = useState(85);
  const [downloadMethod, setDownloadMethod] = useState<DownloadMethod>('zip');
  const [pdfScale, setPdfScale] = useState(PDF_SCALES[0].value);
  const [autoSaveZip, setAutoSaveZip] = useState(readAutoSaveZip);
  const [zipResult, setZipResult] = useState<{ blob: Blob; count: number } | null>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [isReadingPdf, setIsReadingPdf] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colors = format === 'image/png' ? pngColors : format === 'image/gif' ? gifColors : 0;

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const processFiles = async (newFiles: FileList | File[]) => {
    const accepted = Array.from(newFiles).filter(file => INPUT_EXT.test(file.name));
    if (accepted.length === 0) return;
    setNotice(null);

    const images = accepted.filter(file => !PDF_EXT.test(file.name));
    if (images.length > 0) {
      setFiles(prev => [...prev, ...images.map(file => ({
        id: newId(),
        baseName: file.name.replace(INPUT_EXT, ''),
        label: file.name,
        file,
        status: 'pending' as const,
      }))]);
    }

    // PDF は開いてページ数を数え、1ページ＝1枚として並べる
    for (const file of accepted.filter(f => PDF_EXT.test(f.name))) {
      setIsReadingPdf(true);
      try {
        const doc = await loadPdf(file);
        const base = file.name.replace(PDF_EXT, '');
        const digits = Math.max(2, String(doc.numPages).length);
        setFiles(prev => [...prev, ...Array.from({ length: doc.numPages }, (_, i) => {
          const page = i + 1;
          return {
            id: newId(),
            baseName: `${base}-p${String(page).padStart(digits, '0')}`,
            label: `${base}（${page}/${doc.numPages}ページ）`,
            pdf: { doc, page },
            status: 'pending' as const,
          };
        })]);
      } catch (err: unknown) {
        setNotice(`${file.name}: ${err instanceof Error ? err.message : 'このPDFを読み込めませんでした'}`);
      } finally {
        setIsReadingPdf(false);
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    // reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // 形式や色数を変えたら、変換済みのものも作り直せるように待機中に戻す
  const resetDone = () => {
    setFiles(prev => prev.map(f => (f.status === 'done' ? { ...f, status: 'pending', blob: undefined } : f)));
    setZipResult(null);
  };

  const changeAutoSaveZip = (on: boolean) => { setAutoSaveZip(on); writeAutoSaveZip(on); };

  const changeFormat = (f: Format) => { setFormat(f); resetDone(); };
  const changePngColors = (n: number) => { setPngColors(n); resetDone(); };
  const changeGifColors = (n: number) => { setGifColors(n); resetDone(); };
  const changeQuality = (n: number) => { setQuality(n); resetDone(); };
  const changePdfScale = (n: number) => { setPdfScale(n); resetDone(); };

  const startConvert = () => {
    const remaining = files.filter(f => f.status !== 'done').length;
    if (remaining > 50) { setConfirmCount(remaining); return; }
    void convertFiles();
  };

  const convertFiles = async () => {
    if (files.length === 0) return;
    setConfirmCount(null);
    setZipResult(null);
    setIsProcessing(true);

    const updatedFiles = [...files];

    for (let i = 0; i < updatedFiles.length; i++) {
      if (updatedFiles[i].status === 'done') continue;

      updatedFiles[i].status = 'converting';
      setFiles([...updatedFiles]);

      try {
        const item = updatedFiles[i];
        updatedFiles[i].blob = item.pdf
          ? await convertCanvas(await item.pdf.doc.render(item.pdf.page, pdfScale), { format, colors, quality })
          : await convertImage(item.file!, { format, colors, quality });
        updatedFiles[i].status = 'done';
      } catch (err: unknown) {
        updatedFiles[i].status = 'error';
        updatedFiles[i].error = err instanceof Error ? err.message : '変換エラー';
      }
      setFiles([...updatedFiles]);
    }

    setIsProcessing(false);

    const doneFiles = updatedFiles.filter(f => f.status === 'done' && f.blob);
    if (doneFiles.length === 0) return;

    if (downloadMethod === 'multiple') {
      downloadFiles(doneFiles);
    } else if (downloadMethod === 'zip') {
      // ZIP はまとめておくだけ。保存するかどうかは利用者が決める
      const blob = await buildZip(doneFiles);
      setZipResult({ blob, count: doneFiles.length });
      if (autoSaveZip) saveAs(blob, ZIP_NAME);
    }
  };

  const buildZip = async (items: FileItem[]) => {
    const ext = extOf(format);
    const zip = new JSZip();
    items.forEach(item => zip.file(`${item.baseName}.${ext}`, item.blob!));
    return zip.generateAsync({ type: 'blob' });
  };

  const downloadFiles = async (filesToDownload: FileItem[], forceIndividual = false) => {
    const ext = extOf(format);

    if (filesToDownload.length === 1 || downloadMethod === 'multiple' || forceIndividual) {
      filesToDownload.forEach(item => saveAs(item.blob!, `${item.baseName}.${ext}`));
    } else if (downloadMethod === 'zip') {
      saveAs(await buildZip(filesToDownload), ZIP_NAME);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="logo-container">
          <img src="./icon-192.png" alt="変幻" className="logo-img" width={72} height={72} />
        </h1>
        <p className="tagline">画像形式、変幻自在。</p>
        <p className="subtitle">
          <span>HEIC・JPG・PNG・WebPなどの</span>
          <span>画像やPDFをドロップして、</span>
          <span>ボタン一発でPNG・JPG・WebP・GIFに</span>
          <span>変換します。</span>
          <span>PDFは1ページずつ</span>
          <span>画像になります。</span>
        </p>
        <p className="privacy-note">
          <span>変換はこのブラウザの中だけで完結します。</span>
          <span>画像はどこにも送信されません。</span>
        </p>
      </header>

      <main className="main-content">
        <div className="controls-panel">
          <div className="format-selector">
            <span className="label">変換フォーマット:</span>
            <div className="toggle-group">
              {FORMATS.map(f => (
                <button
                  key={f.value}
                  className={`toggle-btn ${format === f.value ? 'active' : ''}`}
                  onClick={() => changeFormat(f.value)}
                  disabled={isProcessing}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {format === 'image/png' && (
            <div className="format-selector" style={{ marginTop: '1rem' }}>
              <span className="label">色数:</span>
              <select
                className="color-select"
                value={pngColors}
                onChange={e => changePngColors(Number(e.target.value))}
                disabled={isProcessing}
                title="フルカラーはPNG-24、色数を選ぶと減色したPNG-8になります"
              >
                {PNG_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}

          {format === 'image/gif' && (
            <div className="format-selector" style={{ marginTop: '1rem' }}>
              <span className="label">色数:</span>
              <select
                className="color-select"
                value={gifColors}
                onChange={e => changeGifColors(Number(e.target.value))}
                disabled={isProcessing}
                title="GIFは最大256色。少なくするほどファイルが小さくなります"
              >
                {GIF_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}

          {(format === 'image/jpeg' || format === 'image/webp') && (
            <div className="format-selector" style={{ marginTop: '1rem' }}>
              <span className="label">画質:</span>
              <div className="quality-control" title="低いほどファイルは小さく、画質は粗くなります">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={quality}
                  onChange={e => changeQuality(Number(e.target.value))}
                  disabled={isProcessing}
                />
                <span className="quality-value">{quality}%</span>
              </div>
            </div>
          )}

          {files.some(f => f.pdf) && (
            <div className="format-selector" style={{ marginTop: '1rem' }}>
              <span className="label">PDFの画質:</span>
              <div className="toggle-group">
                {PDF_SCALES.map(s => (
                  <button
                    key={s.value}
                    className={`toggle-btn ${pdfScale === s.value ? 'active' : ''}`}
                    onClick={() => changePdfScale(s.value)}
                    disabled={isProcessing}
                    title={s.note}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="format-selector" style={{ marginTop: '1rem' }}>
            <span className="label">保存方法:</span>
            <div className="toggle-group">
              <button
                className={`toggle-btn ${downloadMethod === 'zip' ? 'active' : ''}`}
                onClick={() => setDownloadMethod('zip')}
                disabled={isProcessing}
              >
                ZIP
              </button>
              <button
                className={`toggle-btn ${downloadMethod === 'multiple' ? 'active' : ''}`}
                onClick={() => setDownloadMethod('multiple')}
                disabled={isProcessing}
              >
                一斉保存
              </button>
              <button
                className={`toggle-btn ${downloadMethod === 'manual' ? 'active' : ''}`}
                onClick={() => setDownloadMethod('manual')}
                disabled={isProcessing}
              >
                手動保存
              </button>
            </div>
          </div>
          {downloadMethod === 'zip' && (
            <label className="option-check" title="チェックを入れると、変換が終わった時点でZIPの保存が始まります">
              <input
                type="checkbox"
                checked={autoSaveZip}
                onChange={e => changeAutoSaveZip(e.target.checked)}
                disabled={isProcessing}
              />
              変換後に自動保存
            </label>
          )}
          {files.length > 1 && downloadMethod === 'zip' && (
            <p className="hint">スマホの場合は「一斉保存」推奨。<br />ZIPは展開できない機種があります。</p>
          )}
          {downloadMethod === 'multiple' && (
            <p className="hint">「複数ファイルの保存」を聞かれたら許可してください。</p>
          )}
        </div>

        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            accept={ACCEPT}
            onChange={handleFileInput}
          />
          <div className="drop-content">
            <div className="upload-icon-wrapper">
              <UploadCloud size={48} className="upload-icon" />
            </div>
            <h2>画像・PDFをここにドロップ</h2>
            <p>またはクリックしてファイルを選択（HEIC / JPG / PNG / WebP / GIF / BMP / PDF）</p>
          </div>
        </div>

        {isReadingPdf && <p className="hint">PDFを読み込んでいます…</p>}
        {notice && <p className="hint" style={{ color: 'var(--error, #b3261e)' }}>{notice}</p>}

        {files.length > 0 && (
          <div className="file-list-container">
            <div className="file-list-header">
              <h3>選択されたファイル ({files.length})</h3>
              {/* ZIP のときは下の「ZIPを保存」が受け持つので、ここには出さない */}
              {downloadMethod !== 'zip' && files.some(f => f.status === 'done') && (
                <button
                  className="download-all-btn"
                  onClick={() => downloadFiles(files.filter(f => f.status === 'done'))}
                >
                  <Download size={16} /> 結果を保存
                </button>
              )}
            </div>

            {zipResult && downloadMethod === 'zip' && (
              <div className="zip-ready">
                <span className="zip-ready-text">
                  {zipResult.count}枚をZIPにまとめました（{(zipResult.blob.size / 1048576).toFixed(1)}MB）
                  <span className="zip-ready-note">このページを閉じると消えます</span>
                </span>
                <button className="zip-ready-btn" onClick={() => saveAs(zipResult.blob, ZIP_NAME)} title="ZIPを保存します">
                  <Download size={18} /> ZIPを保存
                </button>
              </div>
            )}

            <ul className="file-list">
              {files.map(item => (
                <li key={item.id} className={`file-item ${item.status}`}>
                  <div className="file-info">
                    {item.pdf
                      ? <FileText size={20} className="file-icon" />
                      : <ImageIcon size={20} className="file-icon" />}
                    <span className="file-name" title={item.label}>{item.label}</span>
                  </div>
                  <div className="file-actions">
                    {item.status === 'pending' && <span className="status-badge pending">待機中</span>}
                    {item.status === 'converting' && <Loader2 size={18} className="spin status-icon converting" />}
                    {item.status === 'done' && <CheckCircle2 size={18} className="status-icon success" />}
                    {item.status === 'error' && <span className="error-text" title={item.error}>エラー</span>}

                    {item.status === 'done' && downloadMethod === 'manual' && (
                      <button className="delete-btn" style={{ color: 'var(--primary)' }} onClick={() => downloadFiles([item], true)} title="ダウンロード">
                        <Download size={16} />
                      </button>
                    )}

                    {!isProcessing && (
                      <button className="delete-btn" onClick={() => removeFile(item.id)} title="削除">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <button
              className={`convert-btn ${isProcessing ? 'processing' : ''}`}
              onClick={startConvert}
              disabled={isProcessing || files.every(f => f.status === 'done' || f.status === 'error')}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={20} className="spin" /> 変換中...
                </>
              ) : (
                <>一括変換を開始</>
              )}
            </button>
          </div>
        )}
      </main>

      {confirmCount !== null && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3>{files.every(f => f.pdf) ? `${confirmCount}ページあります` : `${confirmCount}枚あります`}</h3>
            <p>
              画像変換に{estimate(confirmCount)}ほどかかります。<br />
              途中で止めることはできません。
            </p>
            <div className="dialog-actions">
              <button className="dialog-btn" onClick={() => setConfirmCount(null)} title="変換せずに戻ります">やめる</button>
              <button className="dialog-btn primary" onClick={() => void convertFiles()} title="変換を始めます">変換する</button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        作った人: <a href="https://x.com/_kishino" target="_blank" rel="noopener noreferrer">kishino (@_kishino)</a>
      </footer>
    </div>
  );
}

export default App;
