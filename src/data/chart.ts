// chart.ts — Rhythm chart type definitions and loader helper
// Used by GrillScene (Wave 6a+) to drive the taiko-style note track

export type NoteType = 'don' | 'ka';

export interface ChartNote {
  t: number;        // hit time in seconds (from chart start)
  type: NoteType;
  sausage: string;  // sausage type id, e.g. "flying-fish-roe"
}

export interface RhythmChart {
  audioFile: string;
  duration: number;
  tempo: number;
  totalNotes: number;
  sections: { label: string; t_start: number; t_end: number }[];
  notes: ChartNote[];
}

/**
 * Fetch-based chart loader (for future use or non-Phaser contexts).
 * In GrillScene, use Phaser cache instead:
 *   this.cache.json.get('chart-grill-theme') as RhythmChart
 */
export async function loadChart(url: string): Promise<RhythmChart> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load chart: ${url}`);
  return res.json() as Promise<RhythmChart>;
}
