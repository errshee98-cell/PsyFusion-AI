"""
Text dataset loaders.

Expected standardized schema after loading (regardless of source dataset):
    text        : str   - the raw post/utterance
    label       : int   - 0 = low risk, 1 = elevated/high risk
    source      : str   - which dataset this row came from (for provenance/audit)
    subject_id  : str   - anonymized id, if the source dataset provides one

Datasets this is built to ingest (see README.md for download/access instructions):
    - SDCNL (Suicide and Depression Detection, Kaggle CSV)
    - Dreaddit (Reddit stress detection, Kaggle/GitHub CSV)
    - CLPsych shared-task exports (format varies by year - adjust column_map)

Each `load_*` function returns a pandas.DataFrame with the standardized schema
above, so downstream preprocessing/training code never needs to know which
source dataset it's looking at.
"""

import pandas as pd


def _standardize(df: pd.DataFrame, text_col: str, label_col: str, source: str,
                  id_col: str | None = None) -> pd.DataFrame:
    out = pd.DataFrame()
    out['text'] = df[text_col].astype(str)
    out['label'] = df[label_col].astype(int)
    out['source'] = source
    out['subject_id'] = df[id_col].astype(str) if id_col and id_col in df.columns else [
        f'{source}_{i}' for i in range(len(df))
    ]
    return out


def load_sdcnl(csv_path: str, text_col: str = 'text', label_col: str = 'is_suicide') -> pd.DataFrame:
    """Load SDCNL-style CSV. Column names vary by export - override text_col/label_col
    if your copy of the dataset differs (check the CSV header first)."""
    df = pd.read_csv(csv_path)
    return _standardize(df, text_col, label_col, source='sdcnl')


def load_dreaddit(csv_path: str, text_col: str = 'text', label_col: str = 'label') -> pd.DataFrame:
    """Load Dreaddit-style CSV (label: 1 = stressed, 0 = not stressed)."""
    df = pd.read_csv(csv_path)
    return _standardize(df, text_col, label_col, source='dreaddit')


def load_generic_csv(csv_path: str, text_col: str, label_col: str, source_name: str,
                      id_col: str | None = None) -> pd.DataFrame:
    """Fallback loader for any other labeled text CSV (e.g. a CLPsych export),
    as long as you know which columns hold the text and the binary label."""
    df = pd.read_csv(csv_path)
    return _standardize(df, text_col, label_col, source=source_name, id_col=id_col)


def load_and_combine(dataset_configs: list[dict]) -> pd.DataFrame:
    """
    dataset_configs: list of dicts like
        {"loader": "sdcnl", "path": "data/raw/sdcnl.csv"}
        {"loader": "dreaddit", "path": "data/raw/dreaddit.csv"}
        {"loader": "generic", "path": "...", "text_col": "...", "label_col": "...", "source_name": "..."}

    Returns one combined, shuffled DataFrame with the standardized schema.
    Missing files are skipped with a warning rather than raising, so the
    pipeline still runs on whatever subset of datasets you've actually
    downloaded (see synthetic.py for a no-data-at-all fallback).
    """
    loaders = {'sdcnl': load_sdcnl, 'dreaddit': load_dreaddit}
    frames = []
    for cfg in dataset_configs:
        try:
            if cfg['loader'] == 'generic':
                frames.append(
                    load_generic_csv(cfg['path'], cfg['text_col'], cfg['label_col'], cfg['source_name'])
                )
            else:
                frames.append(loaders[cfg['loader']](cfg['path']))
        except FileNotFoundError:
            print(f"[text_loader] WARNING: {cfg['path']} not found, skipping {cfg['loader']}")

    if not frames:
        raise FileNotFoundError(
            'No text datasets could be loaded. Download at least one dataset into data/raw/ '
            '(see README.md) or use src/data/synthetic.py to test the pipeline.'
        )

    combined = pd.concat(frames, ignore_index=True)
    return combined.sample(frac=1, random_state=42).reset_index(drop=True)
