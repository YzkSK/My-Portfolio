importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const params = new URL(location.href).searchParams;
const projectId = params.get('projectId');

// パラメータなしで直接ロードされた場合は初期化しない
if (projectId) {
  firebase.initializeApp({
    apiKey: params.get('apiKey'),
    authDomain: params.get('authDomain'),
    projectId,
    storageBucket: params.get('storageBucket'),
    messagingSenderId: params.get('messagingSenderId'),
    appId: params.get('appId'),
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.data?.title ?? payload.notification?.title ?? '時間割';
    const body = payload.data?.body ?? payload.notification?.body ?? '';
    self.registration.showNotification(title, {
      body,
      icon: '/vite.svg',
    });
  });
}
