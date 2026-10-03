"""
Text preprocessing and vectorization.

Baseline approach uses TF-IDF (fast, no internet/pretrained-weights required,
good enough to validate the pipeline and get a real baseline number). Swap
`TfidfTextVectorizer` for a transformer-embedding vectorizer (e.g. sentence
embeddings via `transformers`) once your team has GPU/internet access - keep
the same `.fit_transform` / `.transform` interface so train.py doesn't change.
"""

import re
from sklearn.feature_extraction.text import TfidfVectorizer


_URL_RE = re.compile(r'https?://\S+')
_WHITESPACE_RE = re.compile(r'\s+')


def clean_text(text: str) -> str:
    text = text.lower()
    text = _URL_RE.sub(' ', text)
    text = re.sub(r'[^a-z0-9\s\'\-]', ' ', text)
    text = _WHITESPACE_RE.sub(' ', text).strip()
    return text


class TfidfTextVectorizer:
    """Thin wrapper so the fusion pipeline has one consistent
    fit_transform/transform interface across modalities."""

    def __init__(self, max_features: int = 5000, ngram_range: tuple = (1, 2)):
        self.vectorizer = TfidfVectorizer(
            max_features=max_features,
            ngram_range=ngram_range,
            min_df=1,
            sublinear_tf=True,
        )

    def fit_transform(self, texts):
        cleaned = [clean_text(t) for t in texts]
        return self.vectorizer.fit_transform(cleaned)

    def transform(self, texts):
        cleaned = [clean_text(t) for t in texts]
        return self.vectorizer.transform(cleaned)
