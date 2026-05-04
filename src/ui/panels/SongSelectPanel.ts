import { SONGS } from '../../data/songs';
import { gameState, updateGameState } from '../../state/GameState';
import { EventBus } from '../../utils/EventBus';

export class SongSelectPanel {
  private panel: HTMLElement;
  private selectedSongId = gameState.selectedSongId || 'grill-theme';

  constructor() {
    this.panel = document.createElement('div');
    this.panel.className = 'game-panel ui-interactive song-select-panel';
    this.panel.style.cssText = [
      'width:min(980px,92vw);',
      'max-width:980px;',
      'padding:0;',
      'overflow:hidden;',
      'background:linear-gradient(180deg,rgba(32,10,2,0.96),rgba(7,6,12,0.98));',
      'border-color:#ffd447;',
      'box-shadow:0 0 28px rgba(255,107,0,0.32),inset 0 0 24px rgba(255,212,71,0.08);',
    ].join('');

    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex;',
      'justify-content:space-between;',
      'align-items:flex-end;',
      'gap:16px;',
      'padding:18px 22px 14px;',
      'border-bottom:1px solid rgba(255,212,71,0.35);',
      'background:linear-gradient(90deg,rgba(255,107,0,0.18),rgba(0,0,0,0));',
    ].join('');

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'panel-title neon-flicker';
    title.style.cssText = 'margin:0;font-size:28px;';
    title.textContent = '選擇今晚曲目';

    const sub = document.createElement('div');
    sub.style.cssText = 'margin-top:5px;color:#d8c79d;font-size:13px;';
    sub.textContent = `目前難度：${gameState.difficulty === 'hardcore' ? '指烤火拼' : '小烤怡情'}`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:13px;color:#ffcc88;text-align:right;line-height:1.45;';
    hint.textContent = '不同曲目會切換音樂與譜面密度';

    header.appendChild(titleWrap);
    header.appendChild(hint);
    this.panel.appendChild(header);

    const list = document.createElement('div');
    list.style.cssText = [
      'display:grid;',
      'grid-template-columns:repeat(2,minmax(0,1fr));',
      'gap:14px;',
      'padding:18px 22px;',
    ].join('');

    SONGS.forEach(song => {
      const variant = song.variants[gameState.difficulty ?? 'casual'];
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.songId = song.id;
      card.style.cssText = this.getCardStyle(song.id === this.selectedSongId);

      const name = document.createElement('div');
      name.style.cssText = 'font-size:24px;font-weight:900;color:#fff;text-shadow:0 0 10px rgba(255,180,40,0.45);';
      name.textContent = song.title;

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'margin-top:4px;color:#ffcc88;font-size:13px;';
      subtitle.textContent = song.subtitle;

      const meta = document.createElement('div');
      meta.style.cssText = [
        'display:grid;',
        'grid-template-columns:repeat(3,1fr);',
        'gap:8px;',
        'margin-top:14px;',
      ].join('');
      [
        `BPM ${song.bpm}`,
        song.durationLabel,
        `${variant.label} ${variant.noteHint}`,
      ].forEach(text => {
        const pill = document.createElement('div');
        pill.style.cssText = 'border:1px solid rgba(255,212,71,0.42);border-radius:6px;padding:6px 7px;color:#ffe6a8;background:rgba(0,0,0,0.26);font-size:12px;text-align:center;';
        pill.textContent = text;
        meta.appendChild(pill);
      });

      const mood = document.createElement('div');
      mood.style.cssText = 'margin-top:12px;color:#c9bda9;font-size:13px;line-height:1.5;';
      mood.textContent = song.mood;

      card.appendChild(name);
      card.appendChild(subtitle);
      card.appendChild(meta);
      card.appendChild(mood);

      card.addEventListener('click', () => {
        this.selectedSongId = song.id;
        updateGameState({ selectedSongId: song.id });
        this.updateCards();
      });

      list.appendChild(card);
    });
    this.panel.appendChild(list);

    const footer = document.createElement('div');
    footer.style.cssText = [
      'display:flex;',
      'justify-content:space-between;',
      'align-items:center;',
      'gap:14px;',
      'padding:14px 22px 18px;',
      'border-top:1px solid rgba(255,107,0,0.28);',
      'background:rgba(0,0,0,0.22);',
    ].join('');

    const note = document.createElement('div');
    note.style.cssText = 'color:#bda98d;font-size:12px;line-height:1.45;';
    note.textContent = 'Holy Knight 目前是初版譜，之後可以依聽感逐段微調。';

    const start = document.createElement('button');
    start.className = 'btn-neon';
    start.style.cssText = 'min-width:170px;font-size:18px;padding:11px 20px;';
    start.textContent = '開始烤';
    start.addEventListener('click', () => {
      window.sessionStorage.removeItem('sausage-test-short-grill');
      updateGameState({ selectedSongId: this.selectedSongId });
      EventBus.emit('song-select-done', { songId: this.selectedSongId });
    });

    footer.appendChild(note);
    footer.appendChild(start);
    this.panel.appendChild(footer);
  }

  getElement(): HTMLElement {
    return this.panel;
  }

  private updateCards(): void {
    this.panel.querySelectorAll<HTMLButtonElement>('[data-song-id]').forEach(card => {
      card.style.cssText = this.getCardStyle(card.dataset.songId === this.selectedSongId);
    });
  }

  private getCardStyle(active: boolean): string {
    return [
      'text-align:left;',
      'border-radius:10px;',
      'padding:18px;',
      'cursor:pointer;',
      'min-height:178px;',
      'font-family:Microsoft JhengHei, PingFang TC, sans-serif;',
      active
        ? 'border:2px solid #ffe600;background:linear-gradient(180deg,rgba(86,48,0,0.72),rgba(16,8,2,0.92));box-shadow:0 0 18px rgba(255,230,0,0.32),inset 0 0 20px rgba(255,198,0,0.10);'
        : 'border:1px solid rgba(255,107,0,0.46);background:linear-gradient(180deg,rgba(35,12,3,0.72),rgba(8,7,12,0.92));box-shadow:0 10px 18px rgba(0,0,0,0.24);',
    ].join('');
  }
}
