import React, { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { UploadCloud, Image as ImageIcon, Loader2, Download, Trash2, CheckCircle2 } from 'lucide-react';
import { FORMATS, PNG_COLORS, GIF_COLORS, INPUT_EXT, ACCEPT, extOf, convertImage } from './convert';
import type { Format } from './convert';
import './App.css';

type DownloadMethod = 'zip' | 'multiple' | 'manual';

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'converting' | 'done' | 'error';
  blob?: Blob;
  error?: string;
}

function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [format, setFormat] = useState<Format>('image/png');
  const [pngColors, setPngColors] = useState(0);
  const [gifColors, setGifColors] = useState(256);
  const [quality, setQuality] = useState(85);
  const [downloadMethod, setDownloadMethod] = useState<DownloadMethod>('zip');
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

  const processFiles = (newFiles: FileList | File[]) => {
    const imageFiles = Array.from(newFiles).filter(file => INPUT_EXT.test(file.name));

    if (imageFiles.length === 0) return;

    const newItems: FileItem[] = imageFiles.map(file => ({
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

  // 形式や色数を変えたら、変換済みのものも作り直せるように待機中に戻す
  const resetDone = () => {
    setFiles(prev => prev.map(f => (f.status === 'done' ? { ...f, status: 'pending', blob: undefined } : f)));
  };

  const changeFormat = (f: Format) => { setFormat(f); resetDone(); };
  const changePngColors = (n: number) => { setPngColors(n); resetDone(); };
  const changeGifColors = (n: number) => { setGifColors(n); resetDone(); };
  const changeQuality = (n: number) => { setQuality(n); resetDone(); };

  const convertFiles = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    const updatedFiles = [...files];

    for (let i = 0; i < updatedFiles.length; i++) {
      if (updatedFiles[i].status === 'done') continue;

      updatedFiles[i].status = 'converting';
      setFiles([...updatedFiles]);

      try {
        updatedFiles[i].blob = await convertImage(updatedFiles[i].file, { format, colors, quality });
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
    const rename = (name: string) => name.replace(INPUT_EXT, '') + `.${ext}`;

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
          <h1>変幻</h1>
        </div>
        <p className="tagline">画像形式、変幻自在。</p>
        <p className="subtitle">HEIC・JPG・PNG・WebPなどの画像をドロップして、ボタン一発でPNG・JPG・WebP・GIFに変換します。</p>
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
            accept={ACCEPT}
            onChange={handleFileInput}
          />
          <div className="drop-content">
            <div className="upload-icon-wrapper">
              <UploadCloud size={48} className="upload-icon" />
            </div>
            <h2>画像ファイルをここにドロップ</h2>
            <p>またはクリックしてファイルを選択（HEIC / JPG / PNG / WebP / GIF / BMP）</p>
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
