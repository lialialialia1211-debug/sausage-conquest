"""
Generate EX rhythm chart — 50% denser + stronger rhythm patterns.
Source: bgm_analysis_ex.json (from EX bgm).
Output: public/chart-grill-theme-ex.json
"""
import json
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INPUT = SCRIPT_DIR / "bgm_analysis_ex.json"
OUTPUT = SCRIPT_DIR.parent / "public" / "chart-grill-theme-ex.json"

SAUSAGES_COMMON = ["flying-fish-roe", "cheese", "big-taste", "big-wrap-small"]
RARE_SAUSAGE = "great-wall"

# EX uses tighter difficulty progression — entire chart is harder
DIFFICULTY_BANDS = [
    (0.0,    20.0,   "medium"),    # EX: intro starts at medium not easy
    (20.0,   80.0,   "hard"),      # main verse already at hard
    (80.0,  140.0,   "extreme"),   # full extreme zone
    (140.0, 999.0,   "extreme"),   # outro stays extreme (no relaxing)
]

# EX has denser patterns. 'extreme' patterns add more 1/4-beat fills.
PATTERNS = {
    'med_basic':    [(0, 'don'), (0.5, 'ka'), (1, 'don'), (1.5, 'ka'),
                     (2, 'don'), (2.5, 'ka'), (3, 'don'), (3.5, 'ka')],
    'med_double':   [(0, 'don'), (0.5, 'don'), (1, 'ka'), (1.5, 'ka'),
                     (2, 'don'), (2.5, 'don'), (3, 'ka'), (3.5, 'ka')],
    'med_pickup':   [(0, 'don'), (0.5, 'ka'), (1, 'don'), (1.5, 'ka'),
                     (2, 'don'), (2.5, 'ka'), (3, 'don'), (3.5, 'don')],

    'hard_basic':   [(0, 'don'), (0.25, 'don'), (0.5, 'ka'), (1, 'don'),
                     (1.5, 'ka'), (2, 'don'), (2.5, 'ka'), (3, 'don'), (3.5, 'ka')],
    'hard_double':  [(0, 'don'), (0.5, 'don'), (1, 'ka'), (1.5, 'ka'),
                     (2, 'don'), (2.5, 'don'), (3, 'ka'), (3.5, 'ka')],
    'hard_synco':   [(0, 'don'), (0.5, 'ka'), (1, 'don'), (1.75, 'ka'),
                     (2, 'don'), (2.5, 'don'), (3, 'ka'), (3.5, 'don')],
    'hard_roll':    [(0, 'don'), (0.25, 'don'), (0.5, 'don'), (1, 'ka'),
                     (1.5, 'ka'), (2, 'don'), (2.5, 'ka'), (3, 'don'), (3.5, 'ka')],

    'ext_climax':   [(0, 'don'), (0.25, 'ka'), (0.5, 'don'), (0.75, 'ka'),
                     (1, 'don'), (1.5, 'ka'), (2, 'don'), (2.25, 'ka'),
                     (2.5, 'don'), (3, 'ka'), (3.5, 'don')],
    'ext_roll_don': [(0, 'don'), (0.25, 'don'), (0.5, 'don'), (0.75, 'don'),
                     (1, 'don'), (1.25, 'ka'), (1.75, 'ka'), (2, 'don'),
                     (2.5, 'ka'), (3, 'don'), (3.5, 'ka')],
    'ext_roll_ka':  [(0, 'don'), (0.5, 'ka'), (0.75, 'ka'), (1, 'ka'),
                     (1.25, 'ka'), (1.5, 'ka'), (2, 'don'), (2.5, 'ka'),
                     (3, 'don'), (3.5, 'ka')],
    'ext_double':   [(0, 'don'), (0.25, 'don'), (0.5, 'don'), (1, 'ka'),
                     (1.25, 'ka'), (1.5, 'ka'), (2, 'don'), (2.25, 'don'),
                     (2.5, 'don'), (3, 'ka'), (3.25, 'ka'), (3.5, 'ka')],
    'ext_burst':    [(0, 'don'), (0.125, 'ka'), (0.25, 'don'), (0.375, 'ka'),
                     (0.5, 'don'), (1, 'ka'), (2, 'don'), (2.5, 'ka'), (3, 'don'), (3.5, 'ka')],
}

DIFFICULTY_PATTERN_POOL = {
    'medium':  [('med_basic', 0.4), ('med_double', 0.3), ('med_pickup', 0.3)],
    'hard':    [('hard_basic', 0.25), ('hard_double', 0.30), ('hard_synco', 0.20),
                ('hard_roll', 0.25)],
    'extreme': [('ext_climax', 0.25), ('ext_roll_don', 0.20), ('ext_roll_ka', 0.20),
                ('ext_double', 0.20), ('ext_burst', 0.15)],
}


def get_difficulty(t: float) -> str:
    for s, e, label in DIFFICULTY_BANDS:
        if s <= t < e:
            return label
    return "extreme"


def weighted_choice(items):
    total = sum(w for _, w in items)
    r = random.random() * total
    cum = 0.0
    for name, weight in items:
        cum += weight
        if r <= cum:
            return name
    return items[-1][0]


def main() -> None:
    random.seed(42)

    with open(INPUT, encoding="utf-8") as f:
        data = json.load(f)

    beats = list(data["all_beats"])
    bgm_duration = data["duration_sec"]
    tempo = data["tempo_bpm"]

    if len(beats) >= 2:
        avg_beat_gap = (beats[-1] - beats[0]) / (len(beats) - 1)
    else:
        avg_beat_gap = 0.674

    chart_duration = bgm_duration + 6.0
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

        pattern_name = weighted_choice(DIFFICULTY_PATTERN_POOL[difficulty])
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

            if difficulty in ('hard', 'extreme') and random.random() < 0.07:
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
        "audioFile": "bgm-grill-theme-ex.mp3",
        "bgmDuration": round(bgm_duration, 2),
        "duration": round(chart_duration, 2),
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

    by_diff: dict = {}
    by_type = {"don": 0, "ka": 0}
    for n in notes:
        d = get_difficulty(n["t"])
        by_diff[d] = by_diff.get(d, 0) + 1
        by_type[n["type"]] += 1

    print(f"EX chart written: {OUTPUT}")
    print(f"  BGM duration: {bgm_duration:.2f}s, chart: {chart_duration:.2f}s")
    print(f"  Total notes: {len(notes)}")
    print(f"  By difficulty: {by_diff}")
    print(f"  By type: {by_type}")


if __name__ == "__main__":
    main()
