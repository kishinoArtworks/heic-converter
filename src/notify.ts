// お知らせの登録欄を出すかどうかの記録（ブラウザに覚えさせる）
// 何度も使ってくれる人にだけ出す。閉じた人・登録した人には二度と出さない
const SHOW_FROM = 3;
const COUNT_KEY = 'hengen.convertCount';
const HIDE_KEY = 'hengen.notifyHidden';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* 覚えられない環境では毎回出るだけ */ } };

// 変換を1回終えるたびに呼ぶ
export const countConversion = () => {
  write(COUNT_KEY, String(Number(read(COUNT_KEY) ?? 0) + 1));
};

export const hideNotifyForever = () => write(HIDE_KEY, '1');

export const shouldShowNotify = () => read(HIDE_KEY) !== '1' && Number(read(COUNT_KEY) ?? 0) >= SHOW_FROM;

