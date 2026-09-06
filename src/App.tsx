import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { UploadCloud, Image as ImageIcon, Loader2, Download, Trash2, CheckCircle2 } from 'lucide-react';
import './App.css';

type Format = 'image/png' | 'image/jpeg' | 'image/webp';
type DownloadMethod = 'zip' | 'multiple' | 'manual';

const FORMATS: { value: Format; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
];

const extOf = (format: Format) => FORMATS.find(f => f.value === format)!.ext;

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'converting' | 'done' | 'error';
  blob?: Blob;
  error?: string;
}

interface Heic2AnyOptions {
  blob: Blob;
  toType: 'image/png' | 'image/jpeg';
  quality?: number;
}
type Heic2Any = (options: Heic2AnyOptions) => Promise<Blob | Blob[]>;

const heic2any = (): Heic2Any => (window as unknown as { heic2any: Heic2Any }).heic2any;

// heic2any は PNG/JPG しか書き出せないので、WebP は一度 PNG にしてから Canvas で再エンコードする
async function pngToWebp(png: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(png);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!out || out.type !== 'image/webp') {
    throw new Error('このブラウザはWebPの書き出しに対応していません');
  }
  return out;
}

async function convertOne(file: File, format: Format): Promise<Blob> {
  const toType = format === 'image/webp' ? 'image/png' : format;
  const result = await heic2any()({ blob: file, toType, quality: 0.8 });
  const blob = Array.isArray(result) ? result[0] : result;
  return format === 'image/webp' ? pngToWebp(blob) : blob;
}

function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [format, setFormat] = useState<Format>('image/png');
  const [downloadMethod, setDownloadMethod] = useState<DownloadMethod>('zip');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const processFiles = (newFiles: FileList | File[]) => {
    const heicFiles = Array.from(newFiles).filter(
      file => /\.(heic|heif)$/i.test(file.name)
    );

    if (heicFiles.length === 0) return;

    const newItems: FileItem[] = heicFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...newItems]);
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

  const convertFiles = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    const updatedFiles = [...files];

    for (let i = 0; i < updatedFiles.length; i++) {
      if (updatedFiles[i].status === 'done') continue;

      updatedFiles[i].status = 'converting';
      setFiles([...updatedFiles]);

      try {
        updatedFiles[i].blob = await convertOne(updatedFiles[i].file, format);
        updatedFiles[i].status = 'done';
      } catch (err: unknown) {
        updatedFiles[i].status = 'error';
        updatedFiles[i].error = err instanceof Error ? err.message : '変換エラー';
      }
      setFiles([...updatedFiles]);
    }

    setIsProcessing(false);

    // Auto download after successful conversion
    const doneFiles = updatedFiles.filter(f => f.status === 'done' && f.blob);
    if (doneFiles.length > 0) {
      if (downloadMethod === 'zip' || downloadMethod === 'multiple') {
        downloadFiles(doneFiles);
      }
    }
  };

  const downloadFiles = async (filesToDownload: FileItem[], forceIndividual = false) => {
    const ext = extOf(format);
    const rename = (name: string) => name.replace(/\.(heic|heif)$/i, `.${ext}`);

    if (filesToDownload.length === 1 || downloadMethod === 'multiple' || forceIndividual) {
      filesToDownload.forEach(item => {
        saveAs(item.blob!, rename(item.file.name));
      });
    } else if (downloadMethod === 'zip') {
      const zip = new JSZip();
      filesToDownload.forEach(item => {
        zip.file(rename(item.file.name), item.blob!);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `converted_images.zip`);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo-container">
          <img src="./icon-192.png" alt="" className="logo-img" width={56} height={56} />
          <h1>iPhone写真変換</h1>
        </div>
        <p className="subtitle">HEICファイルをドロップして、ボタン一発でPNG・JPG・WebPに変換します。</p>
        <p className="privacy-note">変換はこのブラウザの中だけで完結します。画像はどこにも送信されません。</p>
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
                  onClick={() => setFormat(f.value)}
                  disabled={isProcessing}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

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
          {downloadMethod === 'multiple' && (
            <p className="hint">ブラウザが「複数ファイルのダウンロードを許可しますか」と聞いてきたら、許可してください。</p>
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
            accept=".heic,.heif,image/heic,image/heif"
            onChange={handleFileInput}
          />
          <div className="drop-content">
            <div className="upload-icon-wrapper">
              <UploadCloud size={48} className="upload-icon" />
            </div>
            <h2>HEICファイルをここにドロップ</h2>
            <p>またはクリックしてファイルを選択</p>
          </div>
        </div>

        {files.length > 0 && (
          <div className="file-list-container">
            <div className="file-list-header">
              <h3>選択されたファイル ({files.length})</h3>
              {files.some(f => f.status === 'done') && (
                <button
                  className="download-all-btn"
                  onClick={() => downloadFiles(files.filter(f => f.status === 'done'))}
                >
                  <Download size={16} /> 結果を保存
                </button>
              )}
            </div>

            <ul className="file-list">
              {files.map(item => (
                <li key={item.id} className={`file-item ${item.status}`}>
                  <div className="file-info">
                    <ImageIcon size={20} className="file-icon" />
                    <span className="file-name" title={item.file.name}>{item.file.name}</span>
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
              onClick={convertFiles}
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
      <footer className="footer">
        作った人: <a href="https://x.com/_kishino" target="_blank" rel="noopener noreferrer">kishino (@_kishino)</a>
        <span className="sep">／</span>
        <a href="https://github.com/kishinoArtworks/heic-converter" target="_blank" rel="noopener noreferrer">ソースコード</a>
      </footer>
    </div>
  );
}

export default App;
