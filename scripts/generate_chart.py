"""
Generate rhythm chart JSON from BGM beat analysis.
Pattern-based generation: each 4-beat phrase picks a rhythm pattern,
producing notes with real musical phrasing rather than uniform density.
"""
import json
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INPUT = SCRIPT_DIR / "bgm_analysis.json"
OUTPUT = SCRIPT_DIR.parent / "public" / "chart-grill-theme.json"

SAUSAGES_COMMON = ["flying-fish-roe", "cheese", "big-taste", "big-wrap-small"]
RARE_SAUSAGE = "great-wall"

# Section ranges
DENSITY_RULES = [
    (0.0,    20.27,  "intro"),
    (20.27,  81.08,  "verse"),
    (81.08, 141.90,  "chorus"),
    (141.90, 999.0,  "outro"),
]

# Patterns are (beat_offset_within_4_beats, note_type) tuples.
# Offset 0..3.999 covers 4 beats; 0.5 = half-beat after beat 0.
# Note types: 'don' = strong (red), 'ka' = light (blue).
# Following太鼓達人 convention: strong beats prefer don, weak beats / off-beats prefer ka.
PATTERNS = {
    # Intro patterns: sparse, leave room
    'intro_basic':   [(0, 'don'), (2, 'ka')],
    'intro_pause':   [(0, 'don')],
    'intro_call':    [(0, 'don'), (1, 'ka'), (2, 'don')],

    # Verse patterns: medium density with breathing room
    'verse_basic':   [(0, 'don'), (1, 'ka'), (2, 'don'), (3, 'ka')],
    'verse_pause':   [(0, 'don'), (1, 'ka'), (3, 'don')],          # rest beat 2
    'verse_double':  [(0, 'don'), (0.5, 'don'), (2, 'ka'), (2.5, 'ka')],
    'verse_synco':   [(0, 'don'), (1.5, 'ka'), (3, 'don')],        # off-beat
    'verse_pickup':  [(0, 'don'), (1, 'ka'), (2, 'don'), (3, 'ka'), (3.5, 'ka')],

    # Chorus patterns: high energy
    'chor_basic':    [(0, 'don'), (1, 'ka'), (2, 'don'), (3, 'ka')],
    'chor_double':   [(0, 'don'), (0.5, 'don'), (1, 'ka'), (1.5, 'ka'),
                      (2, 'don'), (2.5, 'don'), (3, 'ka'), (3.5, 'ka')],
    'chor_roll_don': [(0, 'don'), (0.25, 'don'), (0.5, 'don'), (0.75, 'don'),
                      (1, 'don'), (2, 'ka'), (3, 'don')],            # 5-hit don roll
    'chor_roll_ka':  [(0, 'don'), (1, 'ka'), (1.25, 'ka'), (1.5, 'ka'),
                      (1.75, 'ka'), (2, 'ka'), (3, 'don')],          # 5-hit ka roll
    'chor_climax':   [(0, 'don'), (0.5, 'ka'), (1, 'don'), (1.5, 'ka'),
                      (2, 'don'), (2.5, 'ka'), (3, 'don'), (3.5, 'ka')],
    'chor_synco':    [(0, 'don'), (1.5, 'ka'), (2, 'don'), (2.5, 'don'), (3.5, 'ka')],
    'chor_pause':    [(0, 'don'), (0.5, 'don'), (1, 'ka'), (3, 'don')],  # tension via gap

    # Outro: minimal
    'outro_close':   [(0, 'don'), (2, 'ka')],
    'outro_final':   [(0, 'don')],
}

# Section pattern pools with weights (pattern_name, weight)
SECTION_PATTERN_POOL = {
    'intro':  [('intro_basic', 0.5), ('intro_pause', 0.3), ('intro_call', 0.2)],
    'verse':  [('verse_basic', 0.30), ('verse_pause', 0.20), ('verse_double', 0.20),
               ('verse_synco', 0.15), ('verse_pickup', 0.15)],
    'chorus': [('chor_basic', 0.10), ('chor_double', 0.20), ('chor_roll_don', 0.15),
               ('chor_roll_ka', 0.15), ('chor_climax', 0.20), ('chor_synco', 0.10),
               ('chor_pause', 0.10)],
    'outro':  [('outro_close', 0.7), ('outro_final', 0.3)],
}


def get_section(t: float) -> str:
    for s, e, label in DENSITY_RULES:
        if s <= t < e:
            return label
    return "unknown"


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
    random.seed(42)  # deterministic chart

    with open(INPUT, encoding="utf-8") as f:
        data = json.load(f)

    beats: list[float] = data["all_beats"]
    duration: float = data["duration_sec"]
    tempo: float = data["tempo_bpm"]

    notes = []

    # Process beats in groups of 4 (one phrase per group)
    i = 0
    while i + 1 < len(beats):
        # Determine phrase length: 4 beats if available, else fewer
        phrase_end = min(i + 4, len(beats))
        phrase_beats = beats[i:phrase_end]

        if len(phrase_beats) < 1:
            break

        # Section is determined by the first beat of the phrase
        label = get_section(phrase_beats[0])
        if label not in SECTION_PATTERN_POOL:
            i = phrase_end
            continue

        # Pick a pattern for this phrase
        pool = SECTION_PATTERN_POOL[label]
        pattern_name = weighted_choice(pool)
        pattern = PATTERNS[pattern_name]

        # Calculate per-beat duration within the phrase
        # If phrase has fewer than 4 beats (end of song), scale offsets
        if len(phrase_beats) >= 2:
            avg_beat = (phrase_beats[-1] - phrase_beats[0]) / max(1, len(phrase_beats) - 1)
        else:
            avg_beat = 0.674  # fallback ~89 BPM

        for offset_in_phrase, note_type in pattern:
            # Skip offsets that would land beyond actual beats in this phrase
            if offset_in_phrase >= len(phrase_beats):
                continue
            base_idx = int(offset_in_phrase)
            frac = offset_in_phrase - base_idx
            if base_idx >= len(phrase_beats):
                continue
            note_t = phrase_beats[base_idx] + frac * avg_beat

            # Sausage selection: chorus has rare bonus chance
            if label == 'chorus' and random.random() < 0.06:
                sausage = RARE_SAUSAGE
            else:
                sausage = random.choice(SAUSAGES_COMMON)

            notes.append({
                "t": round(float(note_t), 3),
                "type": note_type,
                "sausage": sausage,
            })

        i = phrase_end

    # Sort by time and dedupe near-identical timestamps (< 100ms gap, same type)
    notes.sort(key=lambda n: n["t"])
    cleaned = []
    for n in notes:
        if cleaned and (n["t"] - cleaned[-1]["t"]) < 0.06:
            # Too close; skip
            continue
        cleaned.append(n)
    notes = cleaned

    chart = {
        "audioFile": "bgm-grill-theme.mp3",
        "duration": round(duration, 2),
        "tempo": round(tempo, 1),
        "totalNotes": len(notes),
        "sections": [
            {"label": label, "t_start": round(s, 2), "t_end": round(e, 2)}
            for s, e, label in DENSITY_RULES if s < duration
        ],
        "notes": notes,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(chart, f, ensure_ascii=False, indent=2)

    by_section: dict[str, int] = {}
    by_type = {"don": 0, "ka": 0}
    by_sausage: dict[str, int] = {}
    for n in notes:
        lbl = get_section(n["t"])
        by_section[lbl] = by_section.get(lbl, 0) + 1
        by_type[n["type"]] += 1
        by_sausage[n["sausage"]] = by_sausage.get(n["sausage"], 0) + 1

    print(f"Chart written: {OUTPUT}")
    print(f"  Total notes: {len(notes)}")
    print(f"  By section:  {by_section}")
    print(f"  By type:     {by_type}")
    print(f"  By sausage:  {by_sausage}")
    print(f"  First note:  t={notes[0]['t']}s")
    print(f"  Last note:   t={notes[-1]['t']}s")


if __name__ == "__main__":
    main()
