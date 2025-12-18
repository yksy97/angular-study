// src/app/messages.ts
export const MSG = {
  login: {
    userIdRequired: 'ユーザIDの入力は必須です',
    passwordRequired: 'パスワードの入力は必須です',
    passwordMinLength: 'パスワードは5文字以上入力してください',

    loginFailed: 'ユーザIDまたはパスワードが違います',
    authLookupFailed: 'ユーザ情報の照合に失敗しました',
  },
} as const;

export type LoginMessageId = keyof typeof MSG.login;
