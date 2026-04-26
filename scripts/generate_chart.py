"""
Generate rhythm chart JSON from BGM beat analysis.
Uses bgm_analysis.json (produced by analyze_bgm.py) as input.

Chart format:
{
  "audioFile": "bgm-grill-theme.mp3",
  "duration": 162.17,
  "tempo": 89,
  "totalNotes": 170,
  "notes": [
    { "t": 1.045, "type": "don", "sausage": "flying-fish-roe" },
    ...
  ]
}

Note types:
  - "don" (red): 強拍 / 主節奏點
  - "ka"  (blue): 弱拍 / 邊節奏點
"""
import json
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INPUT = SCRIPT_DIR / "bgm_analysis.json"
OUTPUT = SCRIPT_DIR.parent / "public" / "chart-grill-theme.json"

# Common sausages (4): standard pool
SAUSAGES_COMMON = ["flying-fish-roe", "cheese", "big-taste", "big-wrap-small"]
# Rare bonus (great-wall): only in chorus, low probability
RARE_SAUSAGE = "great-wall"

# Section-aware density rules
DENSITY_RULES = [
    # (t_start, t_end, label)
    (0.0,    20.27,  "intro"),
    (20.27,  81.08,  "verse"),
    (81.08, 141.90,  "chorus"),
    (141.90, 999.0,  "outro"),
]

# Difficulty: how aggressively to spawn notes
# "extreme" = every beat in all sections + half-beat syncopation in verse and chorus
DIFFICULTY = "extreme"


def get_section(t: float) -> tuple[int, str]:
    for i, (s, e, label) in enumerate(DENSITY_RULES):
        if s <= t < e:
            return i, label
    return -1, "unknown"


def main() -> None:
    random.seed(42)  # deterministic chart

    with open(INPUT, encoding="utf-8") as f:
        data = json.load(f)

    beats: list[float] = data["all_beats"]
    duration: float = data["duration_sec"]
    tempo: float = data["tempo_bpm"]

    notes = []

    # 1) Place a note on every beat for verse/chorus, every 2nd for intro, every 3rd for outro
    for i, t in enumerate(beats):
        sec_idx, label = get_section(t)

        if label == "intro":
            if i % 2 != 0:
                continue
        elif label == "verse":
            pass  # every beat
        elif label == "chorus":
            pass  # every beat
        elif label == "outro":
            if i % 3 != 0:
                continue
        else:
            continue

        note_type = "don" if (len(notes) % 4) in (0, 2) else "ka"

        if label == "chorus" and random.random() < 0.06:
            sausage = RARE_SAUSAGE
        else:
            sausage = random.choice(SAUSAGES_COMMON)

        notes.append({
            "t": round(float(t), 3),
            "type": note_type,
            "sausage": sausage,
        })

    # 2) Add syncopation in verse and chorus
    if DIFFICULTY in ("hard", "extreme"):
        # Chorus: half-beat syncopation between every adjacent beat pair (heavy density)
        chorus_beats = [t for _, t in [(i, t) for i, t in enumerate(beats) if 81.08 <= t < 141.90]]
        for k in range(len(chorus_beats) - 1):
            mid_t = (chorus_beats[k] + chorus_beats[k + 1]) / 2
            # Skip if too close to existing note (< 0.12s)
            if any(abs(n["t"] - mid_t) < 0.12 for n in notes):
                continue
            notes.append({
                "t": round(float(mid_t), 3),
                "type": "ka",
                "sausage": random.choice(SAUSAGES_COMMON),
            })

    if DIFFICULTY == "extreme":
        # Verse: half-beat syncopation every 4 beats (lighter density than chorus)
        verse_beats = [t for _, t in [(i, t) for i, t in enumerate(beats) if 20.27 <= t < 81.08]]
        for k in range(0, len(verse_beats) - 1, 4):
            if k + 1 >= len(verse_beats):
                break
            mid_t = (verse_beats[k] + verse_beats[k + 1]) / 2
            if any(abs(n["t"] - mid_t) < 0.12 for n in notes):
                continue
            notes.append({
                "t": round(float(mid_t), 3),
                "type": "ka",
                "sausage": random.choice(SAUSAGES_COMMON),
            })

    # Sort by time after all insertions
    notes.sort(key=lambda n: n["t"])

    # 3) Re-balance don/ka after sort (alternate for visual rhythm)
    for idx, n in enumerate(notes):
        n["type"] = "don" if (idx % 4) in (0, 2) else "ka"

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

    # Print summary stats
    by_section = {"intro": 0, "verse": 0, "chorus": 0, "outro": 0}
    by_type = {"don": 0, "ka": 0}
    by_sausage: dict[str, int] = {}
    for n in notes:
        _, lbl = get_section(n["t"])
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
