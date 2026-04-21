import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatDuration,
  formatDate,
  formatTime,
  parseVcData,
} from '@/app/videocollect/constants';

describe('formatSize', () => {
  it('GB 単位で返す', () => {
    expect(formatSize('1500000000')).toBe('1.5 GB');
  });

  it('MB 単位で返す', () => {
    expect(formatSize('5000000')).toBe('5.0 MB');
  });

  it('KB 単位で返す', () => {
    expect(formatSize('500000')).toBe('500 KB');
  });

  it('数値でない文字列は空文字を返す', () => {
    expect(formatSize('abc')).toBe('');
  });

  it('空文字は空文字を返す', () => {
    expect(formatSize('')).toBe('');
  });
});

describe('formatDuration', () => {
  it('秒のみ（1分未満）を正しくフォーマット', () => {
    expect(formatDuration('45000')).toBe('0:45');
  });

  it('分・秒を正しくフォーマット', () => {
    expect(formatDuration('125000')).toBe('2:05');
  });

  it('時・分・秒を正しくフォーマット', () => {
    expect(formatDuration('3723000')).toBe('1:02:03');
  });

  it('0ミリ秒は 0:00 を返す', () => {
    expect(formatDuration('0')).toBe('0:00');
  });
});

describe('formatDate', () => {
  it('ISO 文字列を ja-JP 形式に変換', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/15/);
  });
});

describe('formatTime', () => {
  it('秒のみを正しくフォーマット', () => {
    expect(formatTime(45)).toBe('0:45');
  });

  it('分・秒を正しくフォーマット', () => {
    expect(formatTime(125)).toBe('2:05');
  });

  it('時・分・秒を正しくフォーマット', () => {
    expect(formatTime(3723)).toBe('1:02:03');
  });

  it('NaN は 0:00 を返す', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('Infinity は 0:00 を返す', () => {
    expect(formatTime(Infinity)).toBe('0:00');
  });

  it('0秒は 0:00 を返す', () => {
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('parseVcData', () => {
  it('正常なデータをパース', () => {
    const result = parseVcData({
      folders: [{ id: 'f1', name: 'Folder A' }, { id: 'f2', name: 'Folder B' }],
      tags: { 'file1': ['tag1', 'tag2'], 'file2': ['tag3'] },
    });
    expect(result.folders).toEqual([
      { id: 'f1', name: 'Folder A' },
      { id: 'f2', name: 'Folder B' },
    ]);
    expect(result.tags).toEqual({
      'file1': ['tag1', 'tag2'],
      'file2': ['tag3'],
    });
  });

  it('folders が空配列の場合', () => {
    const result = parseVcData({ folders: [], tags: {} });
    expect(result.folders).toEqual([]);
    expect(result.tags).toEqual({});
  });

  it('folders が欠如している場合は空配列', () => {
    const result = parseVcData({});
    expect(result.folders).toEqual([]);
    expect(result.tags).toEqual({});
  });

  it('id が空文字のフォルダはフィルタリング', () => {
    const result = parseVcData({
      folders: [{ id: '', name: 'Invalid' }, { id: 'f1', name: 'Valid' }],
      tags: {},
    });
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe('f1');
  });

  it('tags の値が文字列配列でない要素を除外', () => {
    const result = parseVcData({
      folders: [],
      tags: { 'file1': ['tag1', 123, null, 'tag2'] },
    });
    expect(result.tags['file1']).toEqual(['tag1', 'tag2']);
  });
});
