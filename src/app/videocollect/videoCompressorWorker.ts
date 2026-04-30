/// <reference lib="webworker" />
// src/app/videocollect/videoCompressorWorker.ts
import * as mp4box from 'mp4box';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { scaleOutput } from './videoCompressorUtils';

type WorkerQuality = 'high' | 'medium' | 'low';

interface WorkerInMessage {
  blob: Blob;
  quality: WorkerQuality;
}

type WorkerOutMessage =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string; logs: string[] };

const PRESETS: Record<WorkerQuality, {
  maxWidth: number; maxHeight: number;
  videoBitrate: number; audioBitrate: number;
}> = {
  high:   { maxWidth: Infinity, maxHeight: Infinity, videoBitrate: 4_000_000, audioBitrate: 128_000 },
  medium: { maxWidth: 1280,     maxHeight: 720,      videoBitrate: 2_000_000, audioBitrate: 96_000  },
  low:    { maxWidth: 854,      maxHeight: 480,      videoBitrate: 800_000,   audioBitrate: 64_000  },
};

// ─── Demux ───────────────────────────────────────────────────────────────────

interface VideoTrackInfo {
  id: number; codec: string;
  timescale: number; duration: number; nb_samples: number;
  video: { width: number; height: number };
}
interface AudioTrackInfo {
  id: number; codec: string;
  timescale: number; duration: number; nb_samples: number;
  audio: { channel_count: number; sample_rate: number };
}
interface DemuxResult {
  videoTrack: VideoTrackInfo;
  audioTrack: AudioTrackInfo;
  videoSamples: mp4box.Sample[];
  audioSamples: mp4box.Sample[];
  videoDescription: Uint8Array | undefined;
  audioDescription: Uint8Array | undefined;
}

function getBoxDescription(file: mp4box.ISOFile, trackId: number): Uint8Array | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = (file as any).getTrackById(trackId)
    ?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const box = entry?.avcC ?? entry?.hvcC ?? entry?.vpcC;
  if (!box) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = new (mp4box as any).DataStream(undefined, 0, (mp4box as any).DataStream.BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array(stream.buffer, 8); // 8バイトのボックスヘッダをスキップ
}

function getAudioDescription(file: mp4box.ISOFile, trackId: number): Uint8Array | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (file as any).getTrackById(trackId)
      ?.mdia?.minf?.stbl?.stsd?.entries?.[0];
    const esds = entry?.esds ?? entry?.mp4a?.esds;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asc: unknown = (esds as any)?.esd?.descs?.[0]?.decConfigDescr?.decSpecificInfo?.data;
    return asc instanceof Uint8Array ? asc : undefined;
  } catch {
    return undefined;
  }
}

function demux(arrayBuffer: ArrayBuffer): Promise<DemuxResult> {
  return new Promise((resolve, reject) => {
    const file = mp4box.createFile();
    const videoSamples: mp4box.Sample[] = [];
    const audioSamples: mp4box.Sample[] = [];
    let videoTrack!: VideoTrackInfo;
    let audioTrack!: AudioTrackInfo;
    let totalVideo = 0;
    let totalAudio = 0;

    const tryResolve = () => {
      if (videoSamples.length >= totalVideo && audioSamples.length >= totalAudio && totalVideo > 0 && totalAudio > 0) {
        resolve({
          videoTrack, audioTrack, videoSamples, audioSamples,
          videoDescription: getBoxDescription(file, videoTrack.id),
          audioDescription: getAudioDescription(file, audioTrack.id),
        });
      }
    };

    file.onReady = (info: mp4box.Movie) => {
      if (!info.videoTracks.length) { reject(new Error('映像トラックが見つかりません')); return; }
      if (!info.audioTracks.length) { reject(new Error('音声トラックが見つかりません')); return; }
      videoTrack = info.videoTracks[0] as unknown as VideoTrackInfo;
      audioTrack = info.audioTracks[0] as unknown as AudioTrackInfo;
      totalVideo = videoTrack.nb_samples;
      totalAudio = audioTrack.nb_samples;
      file.setExtractionOptions(videoTrack.id, 'video', { nbSamples: Infinity });
      file.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: Infinity });
      file.start();
    };

    file.onSamples = (_id: number, user: unknown, samples: mp4box.Sample[]) => {
      if (user === 'video') videoSamples.push(...samples);
      else if (user === 'audio') audioSamples.push(...samples);
      tryResolve();
    };

    file.onError = (e: string) => reject(new Error(e));

    const buf = arrayBuffer as mp4box.MP4BoxBuffer;
    buf.fileStart = 0;
    file.appendBuffer(buf);
    file.flush();
  });
}

// ─── Codec selection ─────────────────────────────────────────────────────────

async function selectVideoCodec(
  width: number, height: number,
  bitrate: number, framerate: number,
): Promise<string> {
  for (const codec of ['avc1.640028', 'avc1.42001f']) {
    const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
    if (supported) return codec;
  }
  throw new Error('H.264 エンコードに対応していません');
}

// ─── Main compress ───────────────────────────────────────────────────────────

async function runCompress(blob: Blob, quality: WorkerQuality, logs: string[]): Promise<Blob> {
  const preset = PRESETS[quality];
  const post = (msg: WorkerOutMessage) =>
    (self as DedicatedWorkerGlobalScope).postMessage(msg);

  let firstCodecError: Error | null = null;
  const captureError = (label: string) => (e: DOMException) => {
    logs.push(`[${label}] ${e.message}`);
    if (!firstCodecError) firstCodecError = e;
  };

  const { videoTrack, audioTrack, videoSamples, audioSamples, videoDescription, audioDescription } =
    await demux(await blob.arrayBuffer());

  const { width: outW, height: outH } = scaleOutput(
    videoTrack.video.width, videoTrack.video.height,
    preset.maxWidth, preset.maxHeight,
  );

  const fps = Math.max(1, Math.min(120,
    Math.round(videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale)),
  ));
  const videoCodec = await selectVideoCodec(outW, outH, preset.videoBitrate, fps);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: outW, height: outH },
    audio: { codec: 'aac', numberOfChannels: audioTrack.audio.channel_count, sampleRate: audioTrack.audio.sample_rate },
    fastStart: 'in-memory',
  });

  const totalFrames = videoSamples.length;
  let frameIndex = 0;
  const needsScale = outW !== videoTrack.video.width || outH !== videoTrack.video.height;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: captureError('VideoEncoder'),
  });
  videoEncoder.configure({
    codec: videoCodec, width: outW, height: outH,
    bitrate: preset.videoBitrate, framerate: fps,
  });

  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      const ts = frame.timestamp;
      let encodeFrame: VideoFrame;
      if (needsScale) {
        const canvas = new OffscreenCanvas(outW, outH);
        canvas.getContext('2d')!.drawImage(frame, 0, 0, outW, outH);
        frame.close();
        encodeFrame = new VideoFrame(canvas, { timestamp: ts });
      } else {
        encodeFrame = frame;
      }
      videoEncoder.encode(encodeFrame, { keyFrame: frameIndex % 60 === 0 });
      encodeFrame.close();
      frameIndex++;
      post({ type: 'progress', ratio: frameIndex / totalFrames });
    },
    error: captureError('VideoDecoder'),
  });
  videoDecoder.configure({
    codec: videoTrack.codec,
    codedWidth: videoTrack.video.width,
    codedHeight: videoTrack.video.height,
    ...(videoDescription ? { description: videoDescription } : {}),
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: captureError('AudioEncoder'),
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: audioTrack.audio.sample_rate,
    numberOfChannels: audioTrack.audio.channel_count,
    bitrate: preset.audioBitrate,
  });

  const audioDecoder = new AudioDecoder({
    output: (audioData) => {
      audioEncoder.encode(audioData);
      audioData.close();
    },
    error: captureError('AudioDecoder'),
  });
  audioDecoder.configure({
    codec: audioTrack.codec,
    sampleRate: audioTrack.audio.sample_rate,
    numberOfChannels: audioTrack.audio.channel_count,
    ...(audioDescription ? { description: audioDescription } : {}),
  });

  for (const sample of videoSamples) {
    videoDecoder.decode(new EncodedVideoChunk({
      type:      sample.is_sync ? 'key' : 'delta',
      timestamp: Math.round((sample.cts      / videoTrack.timescale) * 1_000_000),
      duration:  Math.round((sample.duration / videoTrack.timescale) * 1_000_000),
      data:      sample.data!,
    }));
  }

  for (const sample of audioSamples) {
    audioDecoder.decode(new EncodedAudioChunk({
      type:      sample.is_sync ? 'key' : 'delta',
      timestamp: Math.round((sample.cts      / audioTrack.timescale) * 1_000_000),
      duration:  Math.round((sample.duration / audioTrack.timescale) * 1_000_000),
      data:      sample.data!,
    }));
  }

  await videoDecoder.flush();
  await audioDecoder.flush();
  await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
  if (firstCodecError) throw firstCodecError;

  videoDecoder.close();
  audioDecoder.close();
  videoEncoder.close();
  audioEncoder.close();

  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(self as DedicatedWorkerGlobalScope).onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const { blob, quality } = event.data;
  const logs: string[] = [];
  try {
    const result = await runCompress(blob, quality, logs);
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'done', blob: result } satisfies WorkerOutMessage);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'error', message, logs } satisfies WorkerOutMessage);
  }
};
