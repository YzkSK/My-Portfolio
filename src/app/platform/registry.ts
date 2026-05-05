import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../shared/firebase';
import { clearImageCache } from '../quiz/imageCache';

export type RouteConfig = {
  /** main.tsx の <Routes> 内の相対 path (例: 'timetable', 'quiz/play') */
  path: string;
  getComponent: () => Promise<{ default: React.ComponentType }>;
  protected: boolean;
};

/** シェルページ（常に存在・インストール概念なし） */
export type ShellMeta = {
  id: string;
  label: string;
  icon: string;
  route: RouteConfig;
  extraRoutes?: RouteConfig[];
  /** AppMenu での表示位置 */
  menuPosition: 'top' | 'bottom';
};

/** アプリ（Marketplace でインストール/アンインストール可能） */
export type AppMeta = {
  id: string;
  label: string;
  icon: string;
  description: string;
  route: RouteConfig;
  extraRoutes?: RouteConfig[];
  /**
   * 既存ユーザー向けマイグレーション用。
   * このパスのドキュメントが存在する場合、既存ユーザーとして自動的に導入済みとみなす。
   */
  migrateCheckPath: (uid: string) => string;
  /** アンインストール時のクリーンアップ（任意） */
  onUninstall?: (opts: { deleteData: boolean; uid: string }) => Promise<void>;
  /** 設定ページに表示するコンポーネント（任意・lazy 推奨） */
  SettingsSection?: LazyExoticComponent<ComponentType<SettingsSectionProps>> | ComponentType<SettingsSectionProps>;
};

/** 設定セクションコンポーネントが受け取る共通 props */
export type SettingsSectionProps = {
  addToast: (msg: string, type?: 'normal' | 'error' | 'warning') => void;
};

export const SHELL_REGISTRY: readonly ShellMeta[] = [
  {
    id: 'dashboard',
    label: 'ホーム',
    icon: '🏠',
    route: {
      path: 'dashboard',
      getComponent: () => import('../shell/Dashboard').then(m => ({ default: m.Dashboard })),
      protected: true,
    },
    menuPosition: 'top',
  },
  {
    id: 'marketplace',
    label: 'アプリ一覧',
    icon: '🛍️',
    route: {
      path: 'marketplace',
      getComponent: () => import('../marketplace/Marketplace').then(m => ({ default: m.Marketplace })),
      protected: true,
    },
    menuPosition: 'bottom',
  },
  {
    id: 'settings',
    label: '設定',
    icon: '⚙️',
    route: {
      path: 'settings',
      getComponent: () => import('../settings/Settings').then(m => ({ default: m.Settings })),
      protected: true,
    },
    extraRoutes: [
      {
        path: 'settings/edit',
        getComponent: () => import('../settings/EditProfile').then(m => ({ default: m.EditProfile })),
        protected: true,
      },
    ],
    menuPosition: 'bottom',
  },
];

export const APP_REGISTRY: readonly AppMeta[] = [
  {
    id: 'timetable',
    label: '時間割',
    icon: '📅',
    description: '授業・時間割の管理',
    route: {
      path: 'timetable',
      getComponent: () => import('../timetable/Timetable').then(m => ({ default: m.Timetable })),
      protected: true,
    },
    migrateCheckPath: uid => `users/${uid}/timetable/data`,
    onUninstall: async ({ deleteData, uid }) => {
      if (deleteData) {
        await deleteDoc(doc(db, `users/${uid}/timetable/data`));
      }
    },
    SettingsSection: lazy(() =>
      import('../timetable/TimetableSettings').then(m => ({ default: m.TimetableSettings }))
    ),
  },
  {
    id: 'quiz',
    label: '問題集',
    icon: '📚',
    description: '問題登録・ランダム出題',
    route: {
      path: 'quiz',
      getComponent: () => import('../quiz/Quiz').then(m => ({ default: m.Quiz })),
      protected: true,
    },
    extraRoutes: [
      {
        path: 'quiz/play',
        getComponent: () => import('../quiz/QuizPlay').then(m => ({ default: m.QuizPlay })),
        protected: true,
      },
    ],
    migrateCheckPath: uid => `users/${uid}/quiz/data`,
    onUninstall: async ({ deleteData, uid }) => {
      clearImageCache();
      if (deleteData) {
        await deleteDoc(doc(db, `users/${uid}/quiz/data`));
      }
    },
  },
  {
    id: 'transcribe',
    label: '文字起こし',
    icon: '🎙️',
    description: '音声ファイルを Gemini で文字起こし・要約',
    route: {
      path: 'transcribe',
      getComponent: () => import('../transcribe/Transcribe').then(m => ({ default: m.Transcribe })),
      protected: true,
    },
    migrateCheckPath: uid => `users/${uid}/transcribe/data`,
    onUninstall: async ({ deleteData, uid }) => {
      if (deleteData) {
        await deleteDoc(doc(db, `users/${uid}/transcribe/data`));
      }
    },
  },
  {
    id: 'videocollect',
    label: '動画',
    icon: '🎬',
    description: 'Google Drive 動画の管理・再生',
    route: {
      path: 'videocollect',
      getComponent: () => import('../videocollect/Videocollect').then(m => ({ default: m.Videocollect })),
      protected: true,
    },
    extraRoutes: [
      {
        path: 'videocollect/play',
        getComponent: () => import('../videocollect/VideoPlayer').then(m => ({ default: m.VideoPlayer })),
        protected: true,
      },
    ],
    migrateCheckPath: uid => `users/${uid}/videocollect/data`,
    onUninstall: async ({ deleteData, uid }) => {
      if (deleteData) {
        await Promise.all([
          deleteDoc(doc(db, `users/${uid}/videocollect/data`)),
          deleteDoc(doc(db, `users/${uid}/videocollect/auth`)),
        ]);
      }
    },
    SettingsSection: lazy(() =>
      import('../videocollect/VideocollectSettings').then(m => ({ default: m.VideocollectSettings }))
    ),
  },
];

/** 既存ユーザーの installedApps をマイグレーションする（一回限り） */
export async function migrateInstalledApps(uid: string): Promise<string[]> {
  const results = await Promise.all(
    APP_REGISTRY.map(async app => {
      const snap = await getDoc(doc(db, app.migrateCheckPath(uid)));
      return snap.exists() ? app.id : null;
    })
  );
  const installed = results.filter((id): id is string => id !== null);
  await setDoc(doc(db, `users/${uid}/profile/data`), { installedApps: installed }, { merge: true });
  return installed;
}
