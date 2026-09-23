// 「使い方」タブの中身。変換画面とは別に、読み物として置く
import { FORMATS, PDF_SCALES } from './convert';

const INPUTS = ['HEIC / HEIF（iPhoneの写真）', 'JPG', 'PNG', 'WebP', 'GIF', 'BMP', 'AVIF', 'PDF'];

const OUTPUT_NOTES: Record<string, string> = {
  PNG: '画質を落とさずに保存でき、透過できます。色数を減らせば、ファイルを軽くすることもできます。',
  JPG: '写真の保存に向いていて、ほとんどのパソコンやスマホ、Webサイトでそのまま使えます。画質を下げるほど、ファイルは軽くなります。',
  WebP: 'Webサイトに載せる画像に向いています。JPGより軽く仕上がるうえ、透過できます。',
  GIF: 'アイコンや色数の少ないイラストに向いています。使える色は最大256色で、色数を減らすほどファイルが軽くなります。',
};

const FAQ: { q: string; a: string }[] = [
  {
    q: '画像はどこかに送られますか？',
    a: '送られません。変換はお使いのブラウザの中だけで行われます。一度開いたあとは、ネットにつながっていなくても動きます。',
  },
  {
    q: '位置情報や撮影日時はどうなりますか？',
    a: '変換時に残らないため、SNSなどに載せる際、位置情報を消す目的でも使えます。',
  },
  {
    q: 'スマホで保存した画像はどこに入りますか？',
    a: 'スマホで保存した画像は、端末の写真アプリか、ファイルを管理するアプリの「ダウンロード」に入ります。iPhoneでは保存するときに共有メニューが開くので、「画像を保存」（写真アプリ）か「"ファイル"に保存」（ファイルアプリ）を選んでください。',
  },
  {
    q: '何枚までまとめて変換できますか？',
    a: '上限は特にありませんが、数が多いと時間がかかるため、50枚を超えるときは目安の時間をお知らせします（PDF 200ページで約3分半）。',
  },
  {
    q: 'アプリとして使えますか？',
    a: 'ブラウザのメニューから「アプリをインストール」（iPhoneは「ホーム画面に追加」）を選ぶと、アプリのように起動できます。',
  },
];

export default function Guide() {
  return (
    <article className="guide">
      <section className="guide-section">
        <h2>できること</h2>
        <p>画像やPDFを、別の形式の画像に変換します。何枚でもまとめて変換できます。</p>
        <div className="guide-io">
          <div>
            <h3>読み込める形式</h3>
            <ul className="guide-chips">
              {INPUTS.map(name => <li key={name}>{name}</li>)}
            </ul>
          </div>
          <div>
            <h3>書き出せる形式</h3>
            <ul className="guide-chips">
              {FORMATS.map(f => <li key={f.value}>{f.label}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="guide-section">
        <h2>使い方</h2>
        <ol className="guide-steps">
          <li><b>画像を入れる</b>：枠の中にドロップするか、枠を押してファイルを選びます。</li>
          <li><b>形式を選ぶ</b>：「変換フォーマット」で書き出す形式を選びます。</li>
          <li><b>変換する</b>：「一括変換を開始」を押します。</li>
          <li><b>保存する</b>：選んだ保存方法で保存します（下の表）。</li>
        </ol>
      </section>

      <section className="guide-section">
        <h2>保存方法の違い</h2>
        <table className="guide-table">
          <tbody>
            <tr><th>ZIP</th><td>変換した画像をひとつのファイル（Hengen_images.zip）にまとめて保存します。スマホではZIPを開くためのアプリが必要になる場合があります。（PC／スマホ両方対応）</td></tr>
            <tr><th>一斉保存</th><td>変換した画像を1枚ずつ、すべて保存します。iPhoneでは共有メニューが開くので、「画像を保存」を選ぶと「写真」に入ります。（PC／スマホ両方対応）</td></tr>
            <tr><th>手動保存</th><td>一覧の各行にある保存ボタンで、必要な画像だけを選んで保存します。（PC／スマホ両方対応）</td></tr>
          </tbody>
        </table>
      </section>

      <section className="guide-section">
        <h2>形式の選び方</h2>
        <table className="guide-table">
          <tbody>
            {FORMATS.map(f => (
              <tr key={f.value}><th>{f.label}</th><td>{OUTPUT_NOTES[f.label]}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="guide-note">迷ったときは、どこでも使えるJPGを選ぶと安心です。</p>
      </section>

      <section className="guide-section">
        <h2>PDFを画像にする</h2>
        <p>PDFを入れると、1ページが1枚の画像になります（資料-p01.png、資料-p02.png…）。PDFが開けないスマホで中身を見たいときなどに使えます。</p>
        <table className="guide-table">
          <tbody>
            {PDF_SCALES.map(s => <tr key={s.value}><th>{s.label}</th><td>{s.note}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="guide-section">
        <h2>よくある質問</h2>
        <dl className="guide-faq">
          {FAQ.map(item => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
