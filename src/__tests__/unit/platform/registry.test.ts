import { describe, it, expect, vi } from 'vitest';

vi.mock('@/app/shared/firebase', () => ({
  db: {},
  auth: {},
  storage: {},
  messaging: {},
  functions: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

import { APP_REGISTRY, SHELL_REGISTRY } from '@/app/platform/registry';

describe('APP_REGISTRY', () => {
  it('全アプリが必須フィールドを持つ', () => {
    for (const app of APP_REGISTRY) {
      expect(app.id).toBeTruthy();
      expect(app.label).toBeTruthy();
      expect(app.icon).toBeTruthy();
      expect(app.description).toBeTruthy();
      expect(app.route.path).toBeTruthy();
      expect(typeof app.route.getComponent).toBe('function');
      expect(typeof app.migrateCheckPath).toBe('function');
    }
  });

  it('各アプリの migrateCheckPath が uid を正しいパスに展開する', () => {
    const uid = 'test-user-123';
    const timetable = APP_REGISTRY.find(a => a.id === 'timetable');
    const quiz = APP_REGISTRY.find(a => a.id === 'quiz');
    const vc = APP_REGISTRY.find(a => a.id === 'videocollect');

    expect(timetable?.migrateCheckPath(uid)).toBe(`users/${uid}/timetable/data`);
    expect(quiz?.migrateCheckPath(uid)).toBe(`users/${uid}/quiz/data`);
    expect(vc?.migrateCheckPath(uid)).toBe(`users/${uid}/videocollect/data`);
  });

  it('quiz が extraRoutes を持つ', () => {
    const quiz = APP_REGISTRY.find(a => a.id === 'quiz');
    expect(quiz?.extraRoutes).toBeDefined();
    expect(quiz?.extraRoutes?.some(r => r.path === 'quiz/play')).toBe(true);
  });

  it('videocollect が extraRoutes を持つ', () => {
    const vc = APP_REGISTRY.find(a => a.id === 'videocollect');
    expect(vc?.extraRoutes?.some(r => r.path === 'videocollect/play')).toBe(true);
  });

  it('ID が重複していない', () => {
    const ids = APP_REGISTRY.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('SHELL_REGISTRY', () => {
  it('dashboard / marketplace / settings を含む', () => {
    const ids = SHELL_REGISTRY.map(s => s.id);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('marketplace');
    expect(ids).toContain('settings');
  });

  it('menuPosition が top か bottom のどちらか', () => {
    for (const shell of SHELL_REGISTRY) {
      expect(['top', 'bottom']).toContain(shell.menuPosition);
    }
  });

  it('settings が extraRoutes を持つ', () => {
    const settings = SHELL_REGISTRY.find(s => s.id === 'settings');
    expect(settings?.extraRoutes?.some(r => r.path === 'settings/edit')).toBe(true);
  });
});
