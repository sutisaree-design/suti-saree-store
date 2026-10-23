// ---------------------------------------------------------------------
// Generates a vertical (9:16) slideshow video from a product's images,
// with a price/name overlay AND a soft ambient background track,
// entirely in the browser — no server-side video processing, no ffmpeg,
// no paid AI video/music API. Uses three native browser APIs:
//   - <canvas> to draw each frame (image + Ken Burns zoom + text overlay)
//   - Web Audio API to synthesize a copyright-free ambient pad (no real
//     song — just oscillators + envelopes — so there's zero licensing
//     risk when this gets posted to Facebook/Instagram/Threads)
//   - MediaRecorder + canvas.captureStream() to record video+audio into
//     a real video file (WebM/VP9+Opus, which Meta's Graph API accepts
//     as a video_url source for Reels/Facebook video/Threads video).
//
// This file is browser-only ('use client' components import it) — it
// uses document.createElement('canvas') and other DOM APIs that don't
// exist server-side.
// ---------------------------------------------------------------------

export interface SlideshowOptions {
  /** Product image URLs, in the order they should appear. */
  images: string[];
  /** Product name, shown as a caption near the bottom. */
  name: string;
  /** Formatted price string to show prominently, e.g. "₹499". */
  priceText: string;
  /** Original MRP, shown struck-through next to priceText if there's a discount. */
  mrpText?: string;
  /** e.g. "45% OFF" — shown as a small badge, omitted if no discount. */
  discountBadge?: string;
  /** Seconds each image is shown for. Default 2.5. */
  secondsPerSlide?: number;
  /** Output canvas size — 9:16 vertical (Reels/Stories). Default 1080x1920. */
  width?: number;
  height?: number;
  /** Called with 0-1 progress as slides render, for a progress bar in the UI. */
  onProgress?: (fraction: number) => void;
  /** Add a soft, synth-generated ambient background track (free, no
   *  copyrighted audio). Default true. */
  includeMusic?: boolean;
  /** Background music volume, 0-1. Default 0.35 (kept low so it never
   *  competes with the platform's own auto-captions/sound). */
  musicVolume?: number;
}

const FPS = 30;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Needed so the browser doesn't taint the canvas — requires the
    // storage bucket/CDN serving these images to send permissive CORS
    // headers, which Supabase's public buckets do by default.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

/** Draws `img` into the canvas "cover"-style (fills the frame, cropping
 *  overflow) with a slow zoom (Ken Burns) driven by `progress` (0-1 across
 *  this slide's duration). */
function drawCoverFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  progress: number
) {
  const zoom = 1 + 0.08 * progress; // slow 8% zoom over the slide's duration
  const imgRatio = img.width / img.height;
  const frameRatio = width / height;

  let drawWidth: number;
  let drawHeight: number;
  if (imgRatio > frameRatio) {
    drawHeight = height * zoom;
    drawWidth = drawHeight * imgRatio;
  } else {
    drawWidth = width * zoom;
    drawHeight = drawWidth / imgRatio;
  }
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  ctx.drawImage(img, x, y, drawWidth, drawHeight);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: SlideshowOptions
) {
  // Bottom gradient scrim so white text stays readable over any photo.
  const scrimHeight = height * 0.32;
  const gradient = ctx.createLinearGradient(0, height - scrimHeight, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height - scrimHeight, width, scrimHeight);

  // Discount badge, top-right.
  if (opts.discountBadge) {
    ctx.font = `bold ${Math.round(width * 0.045)}px sans-serif`;
    const badgeText = opts.discountBadge;
    const paddingX = width * 0.03;
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + paddingX * 2;
    const badgeH = width * 0.09;
    const badgeX = width - badgeW - width * 0.05;
    const badgeY = height * 0.05;
    ctx.fillStyle = '#7a1e35';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 2);
  }

  // Product name, wrapped, above the price.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${Math.round(width * 0.052)}px sans-serif`;
  const nameLines = wrapText(ctx, opts.name, width * 0.9).slice(0, 2);
  let textY = height - scrimHeight + width * 0.16;
  for (const line of nameLines) {
    ctx.fillText(line, width * 0.05, textY);
    textY += width * 0.065;
  }

  // Price (large), with MRP struck through beside it if discounted.
  ctx.font = `bold ${Math.round(width * 0.09)}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(opts.priceText, width * 0.05, textY + width * 0.09);

  if (opts.mrpText) {
    const priceWidth = ctx.measureText(opts.priceText).width;
    ctx.font = `${Math.round(width * 0.05)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    const mrpX = width * 0.05 + priceWidth + width * 0.03;
    const mrpY = textY + width * 0.09;
    ctx.fillText(opts.mrpText, mrpX, mrpY);
    const mrpWidth = ctx.measureText(opts.mrpText).width;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = Math.max(1, width * 0.003);
    ctx.beginPath();
    ctx.moveTo(mrpX, mrpY - width * 0.018);
    ctx.lineTo(mrpX + mrpWidth, mrpY - width * 0.018);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------
// Background music — generated entirely with the Web Audio API (simple
// oscillators + envelopes), NOT a real recorded song. This keeps it
// completely free and copyright-safe (no licensed track, no royalty
// fees, nothing that could trigger Meta's audio-rights matching when
// the video is posted to Facebook/Instagram/Threads).
//
// Fully automatic variation: every call picks a random key, tempo,
// timbre, and note pattern, so back-to-back "Generate Video" runs don't
// produce the exact same tune — no dropdown or manual choice needed.
// ---------------------------------------------------------------------

// A calm, warm pentatonic pattern (semitone offsets from the root) that
// sounds pleasant in almost any order — avoids needing real melody/chord
// design while still giving each key its own character.
const PENTATONIC_INTERVALS = [0, 2, 4, 7, 9, 12, 14, 16];

// Root notes (Hz) spanning a comfortable octave-and-a-bit range — picking
// one at random is what gives each generated video a different "key".
const ROOT_NOTES_HZ = [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0];

const OSC_TIMBRES: OscillatorType[] = ['triangle', 'sine'];

function semitoneToHz(rootHz: number, semitones: number): number {
  return rootHz * Math.pow(2, semitones / 12);
}

/**
 * Builds a soft ambient pad + gentle arpeggio loop for `durationSeconds`,
 * routed into `destination` (a MediaStreamAudioDestinationNode so its
 * output can be merged into the recorded video's audio track).
 * Every call randomizes key/tempo/timbre/pattern so consecutive videos
 * don't sound identical. Returns a stop() function to cut the music
 * early if recording ends sooner than expected.
 */
function startBackgroundMusic(
  audioCtx: AudioContext,
  destination: MediaStreamAudioDestinationNode,
  durationSeconds: number,
  volume: number
): () => void {
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = volume;

  // Random key + timbre + filter tone per generation — this is what
  // gives automatic variety without any manual picker.
  const rootHz = ROOT_NOTES_HZ[Math.floor(Math.random() * ROOT_NOTES_HZ.length)];
  const timbre = OSC_TIMBRES[Math.floor(Math.random() * OSC_TIMBRES.length)];
  const filterFreq = 1400 + Math.random() * 1000; // 1400-2400 Hz — warmer or brighter each time
  const noteInterval = 0.75 + Math.random() * 0.4; // 0.75-1.15s between notes — slightly different tempo each time
  const noteLength = noteInterval * 1.8; // notes overlap for a pad-like sustain, scaled with tempo

  // Gentle lowpass so the synth tones sound soft/warm rather than harsh.
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  masterGain.connect(filter);
  filter.connect(destination);

  const activeNodes: (OscillatorNode | AudioNode)[] = [];
  const totalNotes = Math.ceil(durationSeconds / noteInterval) + 2;

  // Random-walk through the scale instead of a fixed sequential order,
  // so the melody shape itself differs between generations too.
  let intervalIndex = Math.floor(Math.random() * PENTATONIC_INTERVALS.length);

  for (let i = 0; i < totalNotes; i++) {
    const startTime = audioCtx.currentTime + i * noteInterval;
    const freq = semitoneToHz(rootHz, PENTATONIC_INTERVALS[intervalIndex]);

    const osc = audioCtx.createOscillator();
    osc.type = timbre;
    osc.frequency.value = freq;

    const noteGain = audioCtx.createGain();
    // Soft attack, slow release — avoids any clicking and keeps it ambient.
    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.5, startTime + 0.4);
    noteGain.gain.linearRampToValueAtTime(0, startTime + noteLength);

    osc.connect(noteGain);
    noteGain.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + noteLength + 0.05);
    activeNodes.push(osc, noteGain);

    // Step up, down, or stay — a small random walk keeps it musical
    // (no big jarring jumps) while never repeating the same pattern.
    const step = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    intervalIndex = Math.min(
      PENTATONIC_INTERVALS.length - 1,
      Math.max(0, intervalIndex + step)
    );
  }

  return () => {
    for (const node of activeNodes) {
      if (node instanceof OscillatorNode) {
        try {
          node.stop();
        } catch {
          // Already stopped — fine to ignore.
        }
      }
    }
    masterGain.disconnect();
    filter.disconnect();
  };
}


export async function generateSlideshowVideo(opts: SlideshowOptions): Promise<Blob> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1920;
  const secondsPerSlide = opts.secondsPerSlide ?? 2.5;
  const images = opts.images.slice(0, 10); // sane cap
  if (images.length === 0) throw new Error('No images to build a video from.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available in this browser.');

  const loadedImages = await Promise.all(images.map(loadImage));

  const videoStream = canvas.captureStream(FPS);

  // ---- Background music (optional, on by default) ----------------------
  const includeMusic = opts.includeMusic ?? true;
  const totalDurationSeconds = images.length * secondsPerSlide;
  let audioCtx: AudioContext | null = null;
  let stopMusic: (() => void) | null = null;
  let combinedStream = videoStream;

  if (includeMusic) {
    audioCtx = new AudioContext();
    const destinationNode = audioCtx.createMediaStreamDestination();
    stopMusic = startBackgroundMusic(audioCtx, destinationNode, totalDurationSeconds, opts.musicVolume ?? 0.35);
    combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destinationNode.stream.getAudioTracks(),
    ]);
  }

  const mimeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 4_000_000 });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = (e) => reject(e);
  });

  recorder.start();

  const totalFrames = Math.round(images.length * secondsPerSlide * FPS);
  const framesPerSlide = Math.round(secondsPerSlide * FPS);
  let frameCount = 0;

  await new Promise<void>((resolve) => {
    let rafId: number;
    const frameIntervalMs = 1000 / FPS;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      if (now - lastTime < frameIntervalMs) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      lastTime = now;

      const slideIndex = Math.min(Math.floor(frameCount / framesPerSlide), loadedImages.length - 1);
      const slideProgress = (frameCount % framesPerSlide) / framesPerSlide;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      drawCoverFrame(ctx, loadedImages[slideIndex], width, height, slideProgress);
      drawOverlay(ctx, width, height, opts);

      frameCount++;
      opts.onProgress?.(Math.min(1, frameCount / totalFrames));

      if (frameCount < totalFrames) {
        rafId = requestAnimationFrame(renderFrame);
      } else {
        cancelAnimationFrame(rafId);
        resolve();
      }
    };
    rafId = requestAnimationFrame(renderFrame);
  });

  recorder.stop();
  stopMusic?.();
  audioCtx?.close().catch(() => {
    // Non-fatal — the context is torn down when the tab/component unmounts either way.
  });
  return recordingDone;
}
