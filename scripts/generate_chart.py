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

# Section-aware density rules (from bgm_analysis.json sections)
# Drop ratio: how many beats to skip
DENSITY_RULES = [
    # (t_start, t_end, keep_every_n_beats, label)
    (0.0,    20.27,  2, "intro"),    # every 2nd beat
    (20.27,  81.08,  1, "verse"),    # every beat (will sub-sample below)
    (81.08, 141.90,  1, "chorus"),   # every beat (full density)
    (141.90, 999.0,  4, "outro"),    # every 4th beat
]


def get_section(t: float) -> tuple[int, str]:
    for i, (s, e, _, label) in enumerate(DENSITY_RULES):
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
    verse_counter = 0  # for sub-sampling verse section

    for i, t in enumerate(beats):
        sec_idx, label = get_section(t)

        # Skip beats per section density
        if label == "intro":
            if i % 2 != 0:
                continue
        elif label == "verse":
            # Keep 2 out of every 3 beats (more dynamic than every 1.5)
            verse_counter += 1
            if verse_counter % 3 == 0:
                continue
        elif label == "chorus":
            pass  # keep all
        elif label == "outro":
            if i % 4 != 0:
                continue
        else:
            continue

        # Note type: alternate by index within kept notes
        note_type = "don" if (len(notes) % 4) in (0, 2) else "ka"

        # Sausage type: chorus gets 5% great-wall bonus
        if label == "chorus" and random.random() < 0.05:
            sausage = RARE_SAUSAGE
        else:
            sausage = random.choice(SAUSAGES_COMMON)

        notes.append({
            "t": round(float(t), 3),
            "type": note_type,
            "sausage": sausage,
        })

    chart = {
        "audioFile": "bgm-grill-theme.mp3",
        "duration": round(duration, 2),
        "tempo": round(tempo, 1),
        "totalNotes": len(notes),
        "sections": [
            {"label": label, "t_start": round(s, 2), "t_end": round(e, 2)}
            for s, e, _, label in DENSITY_RULES if s < duration
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
