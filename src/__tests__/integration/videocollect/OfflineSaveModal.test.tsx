// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OfflineSaveModal } from '@/app/videocollect/modals/OfflineSaveModal';

// offlineStorage と downloadQueue をモック
vi.mock('@/app/videocollect/offlineStorage', () => ({
  getOfflineStorageUsage: vi.fn().mockResolvedValue({ count: 0, totalBytes: 0 }),
  getStorageLimitGb: vi.fn().mockReturnValue(5),
  checkQuota: vi.fn().mockResolvedValue('ok'),
}));

vi.mock('@/app/videocollect/downloadQueue', () => ({
  startDownload: vi.fn(),
}));

// isWebCodecsSupported をモック
vi.mock('@/app/videocollect/videoCompressor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/videocollect/videoCompressor')>();
  return { ...actual, isWebCodecsSupported: vi.fn() };
});

const defaultProps = {
  fileId: 'file1',
  fileName: 'test.mp4',
  fileSize: '10000000',
  proxyUrl: 'https://proxy.example.com',
  accessToken: 'token',
  onClose: vi.fn(),
  addToast: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OfflineSaveModal — WebCodecs サポートチェック', () => {
  it('WebCodecs 非対応時に high/medium/low ボタンが disabled になる', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(false);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      const highBtn = screen.getByRole('button', { name: /高画質/ });
      const midBtn  = screen.getByRole('button', { name: /中画質/ });
      const lowBtn  = screen.getByRole('button', { name: /低画質/ });
      expect(highBtn.hasAttribute('disabled')).toBe(true);
      expect(midBtn.hasAttribute('disabled')).toBe(true);
      expect(lowBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  it('WebCodecs 非対応時に original ボタンは disabled にならない', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(false);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      const origBtn = screen.getByRole('button', { name: /オリジナル/ });
      expect(origBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('WebCodecs 非対応時に警告文が表示される', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(false);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      const warnings = screen.getAllByText(/iOS 16.4 以上が必要/);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  it('WebCodecs 対応時は全ボタンが有効', async () => {
    const { isWebCodecsSupported } = await import('@/app/videocollect/videoCompressor');
    vi.mocked(isWebCodecsSupported).mockResolvedValue(true);

    render(<OfflineSaveModal {...defaultProps} />);

    await waitFor(() => {
      const highBtn = screen.getByRole('button', { name: /高画質/ });
      const midBtn  = screen.getByRole('button', { name: /中画質/ });
      const lowBtn  = screen.getByRole('button', { name: /低画質/ });
      expect(highBtn.hasAttribute('disabled')).toBe(false);
      expect(midBtn.hasAttribute('disabled')).toBe(false);
      expect(lowBtn.hasAttribute('disabled')).toBe(false);
    });
  });
});
