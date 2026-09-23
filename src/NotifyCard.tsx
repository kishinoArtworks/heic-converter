// 更新のお知らせ（メルマガ）登録欄。変換が済んだあとにだけ出す。
// 画像は送らない。登録ボタンを押したときに、入力したメールアドレスだけを Kit に送る
import { useState } from 'react';
import type { FormEvent } from 'react';
import { hideNotifyForever } from './notify';

const KIT_FORM_URL = 'https://app.kit.com/forms/9951955/subscriptions';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type State = 'idle' | 'sending' | 'sent' | 'error';

export default function NotifyCard({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  const hideForever = () => { hideNotifyForever(); onClose(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setState('error');
      setMessage('メールアドレスを確かめてください。');
      return;
    }
    setState('sending');
    try {
      const res = await fetch(KIT_FORM_URL, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams({ email_address: address }),
      });
      const data = await res.json() as { status?: string };
      if (data.status !== 'success') throw new Error(data.status);
      setState('sent');
      hideNotifyForever();
    } catch {
      setState('error');
      setMessage('登録できませんでした。時間をおいて、もう一度お試しください。');
    }
  };

  if (state === 'sent') {
    return (
      <div className="notify-card" role="status">
        <h3>確認メールを送りました</h3>
        <p><span>メールの中のボタンを押すと、登録が完了します。</span><span>届かないときは、迷惑メールのフォルダもご確認ください。</span></p>
        <button className="notify-close" onClick={onClose} title="この案内を閉じます">閉じる</button>
      </div>
    );
  }

  return (
    <div className="notify-card">
      <h3>AIと便利ツールの実験工房</h3>
      <p className="notify-body">
        {[
          '面倒な作業をサクッと終わらせる便利ツールを作っています。',
          'キャラクターAI「理玄」の育成実験も発信しています。',
        ].map(line => <span key={line}>{line}</span>)}
      </p>
      <form className="notify-form" onSubmit={e => void submit(e)} noValidate>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="メールアドレス"
          aria-label="メールアドレス"
          value={email}
          onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
          disabled={state === 'sending'}
        />
        <button type="submit" disabled={state === 'sending'} title="お知らせの登録をします。確認メールが届きます">
          {state === 'sending' ? '送信中…' : '登録'}
        </button>
      </form>
      {state === 'error' && <p className="notify-error">{message}</p>}
      <p className="notify-fine">画像データは送信されません。登録はメールアドレスのみで、いつでも配信停止できます。</p>
      <button className="notify-close" onClick={hideForever} title="この案内を閉じ、次からは表示しません">今後は表示しない</button>
    </div>
  );
}
