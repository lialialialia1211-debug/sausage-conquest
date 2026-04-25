"""
BGM analysis for chart generation.
Outputs duration, tempo (BPM), beat times, onset times, and per-section energy.
Run: python scripts/analyze_bgm.py <audio_path> [<output_json>]
"""
import json
import sys
from pathlib import Path

import librosa
import numpy as np


def analyze(audio_path: str, output_path: str | None = None) -> dict:
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
    tempo_val = float(tempo) if np.isscalar(tempo) else float(np.asarray(tempo).flatten()[0])

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, units="time", backtrack=False
    )

    rms = librosa.feature.rms(y=y)[0]
    rms_times = librosa.times_like(rms, sr=sr)

    n_sections = 8
    sec_len = duration / n_sections
    sections = []
    for i in range(n_sections):
        t_start = i * sec_len
        t_end = (i + 1) * sec_len
        mask = (rms_times >= t_start) & (rms_times < t_end)
        avg_rms = float(np.mean(rms[mask])) if mask.any() else 0.0
        n_beats_sec = int(np.sum((np.asarray(beats) >= t_start) & (np.asarray(beats) < t_end)))
        n_onsets_sec = int(np.sum((np.asarray(onsets) >= t_start) & (np.asarray(onsets) < t_end)))
        sections.append({
            "section": i + 1,
            "t_start": round(t_start, 2),
            "t_end": round(t_end, 2),
            "avg_energy": round(avg_rms, 4),
            "n_beats": n_beats_sec,
            "n_onsets": n_onsets_sec,
        })

    summary = {
        "audio_path": str(audio_path),
        "duration_sec": round(duration, 2),
        "tempo_bpm": round(tempo_val, 1),
        "n_beats": int(len(beats)),
        "n_onsets": int(len(onsets)),
        "first_10_beats": [round(float(b), 3) for b in beats[:10]],
        "last_5_beats": [round(float(b), 3) for b in beats[-5:]],
        "first_10_onsets": [round(float(o), 3) for o in onsets[:10]],
        "sections": sections,
    }

    full = dict(summary)
    full["all_beats"] = [round(float(b), 3) for b in beats]
    full["all_onsets"] = [round(float(o), 3) for o in onsets]

    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(full, f, ensure_ascii=False, indent=2)

    return summary


if __name__ == "__main__":
    # CRITICAL: must analyse the SAME mp3 the game plays.
    # Analysing the source WAV gives a different time axis (LAME encoder padding ~26ms)
    # which causes the chart to be systematically out of sync with the played audio.
    default_audio = "C:/Users/user/sausage-conquest/public/bgm-grill-theme.mp3"
    audio = sys.argv[1] if len(sys.argv) > 1 else default_audio
    out = sys.argv[2] if len(sys.argv) > 2 else "C:/Users/user/sausage-conquest/scripts/bgm_analysis.json"
    summary = analyze(audio, out)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
