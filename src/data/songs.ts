export type SongDifficulty = 'casual' | 'hardcore';

export interface SongVariant {
  chartKey: string;
  audioKey: string;
  chartPath: string;
  audioPath: string;
  label: string;
  noteHint: string;
}

export interface SongDefinition {
  id: string;
  title: string;
  subtitle: string;
  bpm: number;
  durationLabel: string;
  mood: string;
  variants: Record<SongDifficulty, SongVariant>;
}

export const DEFAULT_SONG_ID = 'grill-theme';

export const SONGS: SongDefinition[] = [
  {
    id: 'grill-theme',
    title: 'Sausage Grilling Theme',
    subtitle: '原本烤香腸主題曲',
    bpm: 89,
    durationLabel: '約 2:42',
    mood: '穩定入門 / 夜市基礎節奏',
    variants: {
      casual: {
        chartKey: 'chart-grill-theme',
        audioKey: 'bgm-grill-theme',
        chartPath: 'chart-grill-theme.json',
        audioPath: 'bgm-grill-theme.mp3',
        label: 'CASUAL',
        noteHint: '286 notes',
      },
      hardcore: {
        chartKey: 'chart-grill-theme-ex',
        audioKey: 'bgm-grill-theme-ex',
        chartPath: 'chart-grill-theme-ex.json',
        audioPath: 'bgm-grill-theme-ex.mp3',
        label: 'HARDCORE',
        noteHint: '580 notes',
      },
    },
  },
  {
    id: 'holy-knight',
    title: 'Holy Knight',
    subtitle: '騎士感高速新曲',
    bpm: 160,
    durationLabel: '約 2:14',
    mood: '高速推進 / 中後段密度提升',
    variants: {
      casual: {
        chartKey: 'chart-holy-knight',
        audioKey: 'bgm-holy-knight',
        chartPath: 'chart-holy-knight.json',
        audioPath: 'bgm-holy-knight.mp3',
        label: 'CASUAL',
        noteHint: '406 notes',
      },
      hardcore: {
        chartKey: 'chart-holy-knight-ex',
        audioKey: 'bgm-holy-knight',
        chartPath: 'chart-holy-knight-ex.json',
        audioPath: 'bgm-holy-knight.mp3',
        label: 'HARDCORE',
        noteHint: '743 notes',
      },
    },
  },
];

export function getSongById(id: string | undefined): SongDefinition {
  return SONGS.find(song => song.id === id) ?? SONGS[0];
}

export function getSongVariant(songId: string | undefined, difficulty: SongDifficulty | undefined): SongVariant {
  const song = getSongById(songId);
  return song.variants[difficulty ?? 'casual'];
}
