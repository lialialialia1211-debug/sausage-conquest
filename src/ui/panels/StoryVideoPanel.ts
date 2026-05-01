import { EventBus } from '../../utils/EventBus';

export interface StoryVideoData {
  title?: string;
  src?: string;
  poster?: string;
  doneEvent?: string;
  loop?: boolean;
  muted?: boolean;
}

const DEFAULT_VIDEO_SRC = 'videos/r18-loop.mp4';

export class StoryVideoPanel {
  private panel: HTMLElement;
  private video: HTMLVideoElement;
  private doneEvent: string;
  private destroyed = false;

  constructor(data?: StoryVideoData) {
    this.doneEvent = data?.doneEvent ?? 'story-video-done';

    this.panel = document.createElement('div');
    this.panel.className = 'story-video-panel ui-interactive';

    const frame = document.createElement('div');
    frame.className = 'story-video-frame';

    const header = document.createElement('div');
    header.className = 'story-video-header';

    const title = document.createElement('div');
    title.className = 'story-video-title';
    title.textContent = data?.title ?? '劇情影片';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'story-video-close';
    close.textContent = '跳過';
    close.addEventListener('click', () => this.finish());

    header.append(title, close);

    this.video = document.createElement('video');
    this.video.className = 'story-video';
    this.video.src = data?.src ?? DEFAULT_VIDEO_SRC;
    if (data?.poster) this.video.poster = data.poster;
    this.video.loop = data?.loop ?? true;
    this.video.muted = data?.muted ?? true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.setAttribute('playsinline', 'true');

    const fallback = document.createElement('div');
    fallback.className = 'story-video-fallback';
    fallback.textContent = '找不到影片，請確認 public/videos/r18-loop.mp4 已存在。';

    this.video.addEventListener('error', () => {
      fallback.classList.add('story-video-fallback--visible');
    });

    const controls = document.createElement('div');
    controls.className = 'story-video-controls';

    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'btn-neon story-video-btn';
    replay.textContent = '重播';
    replay.addEventListener('click', () => {
      this.video.currentTime = 0;
      void this.video.play();
    });

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'btn-neon story-video-btn story-video-btn--primary';
    continueBtn.textContent = '繼續';
    continueBtn.addEventListener('click', () => this.finish());

    controls.append(replay, continueBtn);
    frame.append(header, this.video, fallback, controls);
    this.panel.appendChild(frame);

    const playPromise = this.video.play();
    if (playPromise) {
      playPromise.catch(() => {
        fallback.textContent = '瀏覽器阻擋自動播放，請按重播或繼續。';
        fallback.classList.add('story-video-fallback--visible');
      });
    }
  }

  getElement(): HTMLElement {
    return this.panel;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  private finish(): void {
    this.destroy();
    EventBus.emit(this.doneEvent, {});
    EventBus.emit('hide-panel');
  }
}
