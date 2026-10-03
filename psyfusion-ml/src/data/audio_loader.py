"""
Audio dataset loader, built around DAIC-WOZ / E-DAIC's layout:

    data/raw/daic_woz/
        <session_id>_AUDIO.wav
        <session_id>_TRANSCRIPT.csv
    data/raw/daic_woz/labels.csv   (columns: Participant_ID, PHQ8_Binary, PHQ8_Score)

Access note: DAIC-WOZ requires a signed data use agreement with USC before
you can download it - see README.md. This loader assumes the standard
DAIC-WOZ directory layout once you have it; adjust `audio_suffix` /
`label_file` if your copy differs.

Standardized output schema (one row per session):
    subject_id : str
    audio_path : str   - path to the .wav file
    label      : int   - 0/1 binary risk label
    phq_score  : float - raw severity score, kept for regression-style models later
"""

from pathlib import Path
import pandas as pd


def load_daic_woz(root_dir: str, label_file: str = 'labels.csv',
                   audio_suffix: str = '_AUDIO.wav') -> pd.DataFrame:
    root = Path(root_dir)
    labels_path = root / label_file
    if not labels_path.exists():
        raise FileNotFoundError(
            f'{labels_path} not found. DAIC-WOZ requires a signed DUA with USC - '
            'see README.md for the request process.'
        )

    labels = pd.read_csv(labels_path)
    # DAIC-WOZ's own column names; normalize to our schema.
    labels = labels.rename(columns={
        'Participant_ID': 'subject_id',
        'PHQ8_Binary': 'label',
        'PHQ8_Score': 'phq_score',
    })

    rows = []
    for _, row in labels.iterrows():
        sid = str(row['subject_id'])
        audio_path = root / f'{sid}{audio_suffix}'
        if not audio_path.exists():
            print(f'[audio_loader] WARNING: missing audio for subject {sid}, skipping')
            continue
        rows.append({
            'subject_id': sid,
            'audio_path': str(audio_path),
            'label': int(row['label']),
            'phq_score': float(row.get('phq_score', float('nan'))),
        })

    return pd.DataFrame(rows)
