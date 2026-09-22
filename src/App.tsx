import React, { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { UploadCloud, Image as ImageIcon, FileText, Loader2, Download, Trash2, CheckCircle2, Share2 } from 'lucide-react';
import { FORMATS, PNG_COLORS, GIF_COLORS, INPUT_EXT, PDF_EXT, ACCEPT, PDF_SCALES, extOf, convertImage, convertCanvas, loadPdf } from './convert';
import type { Format, PdfDoc } from './convert';
import './App.css';

type DownloadMethod = 'zip' | 'multiple' | 'manual';

const ZIP_NAME = 'Hengen_images.zip';

// 送り先の一覧。アプリからは送らず、利用者が自分で上げるための入口
const STORAGE_LINKS = [
  { label: 'G-Drive', url: 'https://drive.google.com/drive/my-drive' },
  { label: 'ギガファイル便', url: 'https://gigafile.nu/' },
  { label: 'Dropbox', url: 'https://www.dropbox.com/home' },
  { label: 'firestorage', url: 'https://firestorage.jp/' },
  { label: 'ギガワタス', url: 'https://giga-watasu.jp/' },
  { label: 'BOX', url: 'https://www.box.com/ja-jp/home' },
  { label: 'WeTransfer', url: 'https://wetransfer.com/' },
  { label: 'データ便', url: 'https://datadeliver.net/' },
];

// 9つめは利用者が決める。ブラウザに覚えさせる
const CUSTOM_LINK_KEY = 'hengen.customLink';
interface CustomLink { label: string; url: string }

const readCustomLink = (): CustomLink | null => {
  try {
    const raw = localStorage.getItem(CUSTOM_LINK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomLink;
    return parsed.url ? parsed : null;
  } catch { return null; }
};

const writeCustomLink = (link: CustomLink | null) => {
  try {
    if (link) localStorage.setItem(CUSTOM_LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(CUSTOM_LINK_KEY);
  } catch { /* 使えない環境では覚えないだけ */ }
};

// 受け付けるのは http/https とメールアドレスだけ
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeTarget = (input: string): string | null => {
  const value = input.trim();
  if (!value) return null;

  // メールアドレス（mailto: 付きで書かれていても受ける）
  const bare = value.replace(/^mailto:/i, '');
  if (EMAIL.test(bare)) return `mailto:${bare}`;

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch { return null; }
};

// 登録された送り先から、枡に出す名前を決める
const labelFromTarget = (target: string): string => {
  if (target.startsWith('mailto:')) return target.slice(7).split('@')[0];
  try { return new URL(target).hostname.replace(/^www\./, ''); } catch { return '送り先'; }
};

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

// ブラウザ標準の保存。iOS でもプレビュー画面を挟まずにファイルとして保存される
const save = (blob: Blob, name: string) => {
  // 画像やZIPの型のままだと、iOS Safari が「プレビューで開く」画面を挟む。
  // 保存専用の型に包み直すと、そのままファイルとして保存される
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// スマホ・タブレットは「一斉保存」を初期値にする。
// ZIPは端末のダウンロード先に入り、あとから探しにくいため
const defaultDownloadMethod = (): DownloadMethod => {
  try {
    return window.matchMedia('(pointer: coarse)').matches ? 'multiple' : 'zip';
  } catch { return 'zip'; }
};

// iPhone・iPad は保存先が分かりにくいので、置き場所を添える
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
  const [downloadMethod, setDownloadMethod] = useState<DownloadMethod>(defaultDownloadMethod);
  const [saved, setSaved] = useState(false);
  const [pdfScale, setPdfScale] = useState(PDF_SCALES[0].value);
  const [autoSaveZip, setAutoSaveZip] = useState(readAutoSaveZip);
  const [zipResult, setZipResult] = useState<{ blob: Blob; count: number } | null>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [customLink, setCustomLink] = useState<CustomLink | null>(readCustomLink);
  const [linkEditor, setLinkEditor] = useState<{ label: string; url: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isReadingPdf, setIsReadingPdf] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colors = format === 'image/png' ? pngColors : format === 'image/gif' ? gifColors : 0;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

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
    setSaved(false);
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

    if (downloadMethod === 'multiple' && !isIOS()) {
      void downloadFiles(doneFiles);
    } else if (downloadMethod === 'zip') {
      // ZIP はまとめておくだけ。保存するかどうかは利用者が決める
      const blob = await buildZip(doneFiles);
      setZipResult({ blob, count: doneFiles.length });
      if (autoSaveZip && !isIOS()) { save(blob, ZIP_NAME); setSaved(true); }
    }
  };

  // 端末の共有メニューに渡す。送り先を選ぶのは利用者で、アプリは何も送らない
  const shareResults = async () => {
    const done = files.filter(f => f.status === 'done' && f.blob);
    if (done.length === 0) return;

    const payload = zipResult
      ? [new File([zipResult.blob], ZIP_NAME, { type: 'application/zip' })]
      : done.map(item => new File([item.blob!], `${item.baseName}.${extOf(format)}`, { type: format }));

    if (!navigator.canShare?.({ files: payload })) {
      setNotice('この端末では共有できませんでした。保存してから送り先へ上げてください。');
      return;
    }
    try {
      await navigator.share({ files: payload });
    } catch (err: unknown) {
      // 利用者が閉じただけのときは何も言わない
      if ((err as { name?: string })?.name !== 'AbortError') {
        setNotice('共有できませんでした。保存してから送り先へ上げてください。');
      }
    }
  };

  const saveCustomLink = () => {
    if (!linkEditor) return;
    const url = normalizeTarget(linkEditor.url);
    if (!url) {
      setLinkError('アドレスを確かめてください（例: https://example.com / name@example.com）');
      return;
    }
    const label = linkEditor.label.trim() || labelFromTarget(url);
    const link = { label: label.slice(0, 12), url };
    setCustomLink(link);
    writeCustomLink(link);
    setLinkEditor(null);
    setLinkError(null);
  };

  const clearCustomLink = () => {
    setCustomLink(null);
    writeCustomLink(null);
    setLinkEditor(null);
    setLinkError(null);
  };

  // iOS Safari はダウンロードを「プレビューで開く」に変えてしまうので、
  // 共有メニューに渡して「"ファイル"に保存」「画像を保存」を選んでもらう
  const deliver = async (items: { blob: Blob; name: string }[]) => {
    if (items.length === 0) return;

    if (isIOS()) {
      const payload = items.map(i => new File([i.blob], i.name, { type: i.blob.type || 'application/octet-stream' }));
      if (navigator.canShare?.({ files: payload })) {
        try {
          await navigator.share({ files: payload });
          setSaved(true);
          return;
        } catch (err: unknown) {
          if ((err as { name?: string })?.name === 'AbortError') return;
        }
      }
    }
    items.forEach(i => save(i.blob, i.name));
    setSaved(true);
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
      await deliver(filesToDownload.map(item => ({ blob: item.blob!, name: `${item.baseName}.${ext}` })));
    } else if (downloadMethod === 'zip') {
      await deliver([{ blob: await buildZip(filesToDownload), name: ZIP_NAME }]);
    }
  };

  // 変換が済んだあとに ZIP へ切り替えた場合も、その場でまとめて保存できるようにする
  useEffect(() => {
    if (downloadMethod !== 'zip' || zipResult || isProcessing) return;
    const done = files.filter(f => f.status === 'done' && f.blob);
    if (done.length === 0) return;

    let alive = true;
    const ext = extOf(format);
    const zip = new JSZip();
    done.forEach(item => zip.file(`${item.baseName}.${ext}`, item.blob!));
    void zip.generateAsync({ type: 'blob' }).then(blob => {
      if (alive) setZipResult({ blob, count: done.length });
    });
    return () => { alive = false; };
  }, [downloadMethod, zipResult, isProcessing, files, format]);

  // 「まとめて保存」は保存方法によらず常に ZIP。名前も画面に出ているものと同じ
  const saveAllAsZip = async () => {
    const done = files.filter(f => f.status === 'done' && f.blob);
    if (done.length === 0) return;
    const blob = zipResult?.blob ?? await buildZip(done);
    if (!zipResult) setZipResult({ blob, count: done.length });
    await deliver([{ blob, name: ZIP_NAME }]);
  };

  // 枡目を押したとき、まだ保存していなければ先に保存する。
  // 手元にファイルがないままサイトを開いても上げようがないため
  const saveBeforeOpen = () => {
    if (saved) return;
    const done = files.filter(f => f.status === 'done' && f.blob);
    if (done.length === 0) return;
    if (downloadMethod === 'zip') void saveAllAsZip();
    else void downloadFiles(done);
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
              {files.some(f => f.status === 'done') && (
                <button
                  className="download-all-btn"
                  onClick={() => void saveAllAsZip()}
                  title={zipResult
                    ? `${zipResult.count}枚・${(zipResult.blob.size / 1048576).toFixed(1)}MB。このページを閉じると消えます`
                    : '変換した画像をひとつにまとめて保存します'}
                >
                  {ZIP_NAME}を保存 <Download size={16} />
                </button>
              )}
            </div>

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

            {files.length > 0 && (
              <div className="send-box">
                {canShare && files.some(f => f.status === 'done') && (
                  <button className="send-share" onClick={shareResults} title="端末の共有メニューを開き、そのまま送り先を選べます">
                    <Share2 size={18} /> 共有して送る
                  </button>
                )}

                <h4 className="send-title">保存してストレージサービスを利用</h4>
                <div className="send-grid">
                  {STORAGE_LINKS.map(link => (
                    <a
                      key={link.url}
                      className="send-tile"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={saveBeforeOpen}
                      title={`画像を保存して、${link.label}を新しいタブで開きます`}
                    >
                      {link.label}
                    </a>
                  ))}
                  {customLink ? (
                    <a
                      className="send-tile"
                      href={customLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={saveBeforeOpen}
                      title={customLink.url.startsWith('mailto:')
                        ? `画像を保存して、${customLink.url.slice(7)} 宛にメールを作ります`
                        : `画像を保存して、${customLink.url} を新しいタブで開きます`}
                    >
                      {customLink.label}
                    </a>
                  ) : (
                    <button
                      className="send-tile send-tile-set"
                      onClick={() => { setLinkEditor({ label: '', url: '' }); setLinkError(null); }}
                      title="よく使うストレージやメールアドレスを登録できます"
                    >
                      リンクを設定
                    </button>
                  )}
                </div>

                {customLink && (
                  <button
                    className="send-edit"
                    onClick={() => { setLinkEditor({ ...customLink }); setLinkError(null); }}
                    title="登録した送り先を変えます"
                  >
                    「{customLink.label}」を変更
                  </button>
                )}

                <p className="send-note">
                  {files.some(f => f.status === 'done') && (
                    <>
                      <span>各ボタンを押すと</span>
                      <span>自動保存し、</span>
                      <span>リンク先を開きます。</span>
                      <br />
                    </>
                  )}
                  <span>ファイルはご自身で</span>
                  <span>アップロードしてください。</span>
                  {isIOS() && (
                    <>
                      <br />
                      <span>保存したものは</span>
                      <span>「ファイル」アプリの</span>
                      <span>「ダウンロード」にあります。</span>
                    </>
                  )}
                </p>
              </div>
            )}

            {files.some(f => f.status !== 'done') && (
              <button
                className={`convert-btn ${isProcessing ? 'processing' : ''}`}
                onClick={startConvert}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={20} className="spin" /> 変換中...
                  </>
                ) : (
                  <>一括変換を開始</>
                )}
              </button>
            )}
          </div>
        )}
      </main>

      {linkEditor && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3>よく使う送り先</h3>
            <p>
              よく使うストレージのアドレスか、送り先のメールアドレスを登録できます。<br />
              メールを登録すると、押したときにメールソフトが開きます（画像はご自身で添付してください）。<br />
              この端末にだけ保存され、どこにも送信されません。
            </p>

            <label className="field">
              <span>表示名</span>
              <input
                type="text"
                value={linkEditor.label}
                maxLength={12}
                placeholder="例: 社内の共有"
                onChange={e => setLinkEditor({ ...linkEditor, label: e.target.value })}
              />
            </label>

            <label className="field">
              <span>アドレス または メールアドレス</span>
              <input
                type="text"
                inputMode="url"
                value={linkEditor.url}
                placeholder="https://example.com ／ name@example.com"
                onChange={e => setLinkEditor({ ...linkEditor, url: e.target.value })}
              />
            </label>

            {linkError && <p className="field-error">{linkError}</p>}

            <div className="dialog-actions">
              {customLink && (
                <button className="dialog-btn danger" onClick={clearCustomLink} title="登録を消します">削除</button>
              )}
              <button className="dialog-btn" onClick={() => setLinkEditor(null)} title="変更せずに閉じます">やめる</button>
              <button className="dialog-btn primary" onClick={saveCustomLink} title="この送り先を登録します">保存</button>
            </div>
          </div>
        </div>
      )}

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
