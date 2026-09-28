// Windows版（Electron）で動いているか。画面の言い回しを「ブラウザ」から「パソコン」に変えるのに使う
export const IS_APP = /Electron/i.test(navigator.userAgent);

// 変換がどこで完結するかの言い方
export const WHERE = IS_APP ? 'このパソコン' : 'このブラウザ';

// ブラウザ版の場所。Windows版からスマホ向けの案内として開く
export const WEB_URL = 'https://kishinoartworks.github.io/heic-converter/';

// Microsoft Store 版のページ。ブラウザ版から Windows の人向けに案内する
export const STORE_URL = 'https://apps.microsoft.com/detail/9NWNM93CLT5G';
