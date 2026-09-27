// Windows版（Electron）で動いているか。画面の言い回しを「ブラウザ」から「パソコン」に変えるのに使う
export const IS_APP = /Electron/i.test(navigator.userAgent);

// 変換がどこで完結するかの言い方
export const WHERE = IS_APP ? 'このパソコン' : 'このブラウザ';
