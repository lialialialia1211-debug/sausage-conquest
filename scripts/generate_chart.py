"""
Generate rhythm chart JSON from BGM beat analysis.

Difficulty curve:
  0–30s   : easy        (sparse intro patterns)
  30–100s : medium      (verse patterns with breathing)
  100–132s: hard        (chorus density + syncopation)
  132–168s: extreme     (rolls, climax, full 8-hits, EXTENDS PAST BGM end ~6s)

The last segment extends past BGM duration (~162s) to ~168s using extrapolated
beats. Players must keep playing without music for the final stretch.
"""
import json
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INPUT = SCRIPT_DIR / "bgm_analysis.json"
OUTPUT = SCRIPT_DIR.parent / "public" / "chart-grill-theme.json"

SAUSAGES_COMMON = ["flying-fish-roe", "cheese", "big-taste", "big-wrap-small"]
RARE_SAUSAGE = "great-wall"

# Time-based difficulty bands
DIFFICULTY_BANDS = [
    (0.0,    30.0,   "easy"),
    (30.0,  100.0,   "medium"),
    (100.0, 132.0,   "hard"),
    (132.0, 999.0,   "extreme"),
]

PATTERNS = {
    # Easy
    'easy_basic':   [(0, 'don'), (2, 'ka')],
    'easy_pause':   [(0, 'don')],
    'easy_call':    [(0, 'don'), (2, 'don')],

    # Medium
    'med_basic':    [(0, 'don'), (1, 'ka'), (2, 'don'), (3, 'ka')],
    'med_pause':    [(0, 'don'), (1, 'ka'), (3, 'don')],
    'med_double':   [(0, 'don'), (0.5, 'don'), (2, 'ka'), (2.5, 'ka')],
    'med_synco':    [(0, 'don'), (1.5, 'ka'), (3, 'don')],
    'med_pickup':   [(0, 'don'), (1, 'ka'), (2, 'don'), (3, 'ka'), (3.5, 'ka')],

    # Hard
    'hard_basic':   [(0, 'don'), (0.5, 'ka'), (1, 'don'), (2, 'ka'), (3, 'don')],
    'hard_double':  [(0, 'don'), (0.5, 'don'), (1, 'ka'), (1.5, 'ka'),
                     (2, 'don'), (2.5, 'don'), (3, 'ka'), (3.5, 'ka')],
    'hard_synco':   [(0, 'don'), (1.5, 'ka'), (2, 'don'), (2.5, 'don'), (3.5, 'ka')],

    # Extreme
    'ext_climax':   [(0, 'don'), (0.5, 'ka'), (1, 'don'), (1.5, 'ka'),
                     (2, 'don'), (2.5, 'ka'), (3, 'don'), (3.5, 'ka')],
    'ext_roll_don': [(0, 'don'), (0.25, 'don'), (0.5, 'don'), (0.75, 'don'),
                     (1, 'don'), (2, 'ka'), (3, 'don')],
    'ext_roll_ka':  [(0, 'don'), (1, 'ka'), (1.25, 'ka'), (1.5, 'ka'),
                     (1.75, 'ka'), (2, 'ka'), (3, 'don')],
    'ext_double':   [(0, 'don'), (0.5, 'don'), (1, 'ka'), (1.5, 'ka'),
                     (2, 'don'), (2.5, 'don'), (3, 'ka'), (3.5, 'ka')],
}

DIFFICULTY_PATTERN_POOL = {
    'easy':    [('easy_basic', 0.5), ('easy_pause', 0.3), ('easy_call', 0.2)],
    'medium':  [('med_basic', 0.30), ('med_pause', 0.20), ('med_double', 0.20),
                ('med_synco', 0.15), ('med_pickup', 0.15)],
    'hard':    [('hard_basic', 0.30), ('hard_double', 0.40), ('hard_synco', 0.30)],
    'extreme': [('ext_climax', 0.30), ('ext_roll_don', 0.25), ('ext_roll_ka', 0.25),
                ('ext_double', 0.20)],
}


def get_difficulty(t: float) -> str:
    for s, e, label in DIFFICULTY_BANDS:
        if s <= t < e:
            return label
    return "extreme"


def weighted_choice(items: list[tuple[str, float]]) -> str:
    total = sum(w for _, w in items)
    r = random.random() * total
    cumulative = 0.0
    for name, weight in items:
        cumulative += weight
        if r <= cumulative:
            return name
    return items[-1][0]


def main() -> None:
    random.seed(42)

    with open(INPUT, encoding="utf-8") as f:
        data = json.load(f)

    beats: list[float] = list(data["all_beats"])
    bgm_duration: float = data["duration_sec"]
    tempo: float = data["tempo_bpm"]

    # Extrapolate beats past BGM end to give the chart 6 extra seconds
    if len(beats) >= 2:
        avg_beat_gap = (beats[-1] - beats[0]) / (len(beats) - 1)
    else:
        avg_beat_gap = 0.674

    chart_duration = bgm_duration + 6.0  # 6 extra seconds past BGM
    while beats[-1] + avg_beat_gap < chart_duration:
        beats.append(beats[-1] + avg_beat_gap)

    notes = []

    i = 0
    while i + 1 < len(beats):
        phrase_end = min(i + 4, len(beats))
        phrase_beats = beats[i:phrase_end]
        if len(phrase_beats) < 1:
            break

        difficulty = get_difficulty(phrase_beats[0])
        if difficulty not in DIFFICULTY_PATTERN_POOL:
            i = phrase_end
            continue

        pool = DIFFICULTY_PATTERN_POOL[difficulty]
        pattern_name = weighted_choice(pool)
        pattern = PATTERNS[pattern_name]

        if len(phrase_beats) >= 2:
            avg_beat = (phrase_beats[-1] - phrase_beats[0]) / max(1, len(phrase_beats) - 1)
        else:
            avg_beat = avg_beat_gap

        for offset_in_phrase, note_type in pattern:
            if offset_in_phrase >= len(phrase_beats):
                continue
            base_idx = int(offset_in_phrase)
            frac = offset_in_phrase - base_idx
            if base_idx >= len(phrase_beats):
                continue
            note_t = phrase_beats[base_idx] + frac * avg_beat

            if difficulty in ('hard', 'extreme') and random.random() < 0.06:
                sausage = RARE_SAUSAGE
            else:
                sausage = random.choice(SAUSAGES_COMMON)

            notes.append({
                "t": round(float(note_t), 3),
                "type": note_type,
                "sausage": sausage,
            })

        i = phrase_end

    notes.sort(key=lambda n: n["t"])
    cleaned = []
    for n in notes:
        if cleaned and (n["t"] - cleaned[-1]["t"]) < 0.06:
            continue
        cleaned.append(n)
    notes = cleaned

    chart = {
        "audioFile": "bgm-grill-theme.mp3",
        "bgmDuration": round(bgm_duration, 2),
        "duration": round(chart_duration, 2),  # chart extends past BGM
        "tempo": round(tempo, 1),
        "totalNotes": len(notes),
        "difficultyBands": [
            {"label": label, "t_start": round(s, 2), "t_end": round(e, 2)}
            for s, e, label in DIFFICULTY_BANDS if s < chart_duration
        ],
        "notes": notes,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(chart, f, ensure_ascii=False, indent=2)

    by_diff: dict[str, int] = {}
    by_type = {"don": 0, "ka": 0}
    for n in notes:
        d = get_difficulty(n["t"])
        by_diff[d] = by_diff.get(d, 0) + 1
        by_type[n["type"]] += 1

    print(f"Chart written: {OUTPUT}")
    print(f"  BGM duration: {bgm_duration:.2f}s")
    print(f"  Chart duration: {chart_duration:.2f}s ({chart_duration - bgm_duration:.1f}s past BGM)")
    print(f"  Total notes: {len(notes)}")
    print(f"  By difficulty: {by_diff}")
    print(f"  By type: {by_type}")
    print(f"  First note: t={notes[0]['t']}s")
    print(f"  Last note: t={notes[-1]['t']}s")


if __name__ == "__main__":
    main()
