"""Deterministic, code-based quality checks for metadata descriptions.

These complement the LLM judge (``router.py``) by computing the *objective* WA
plain-language and formatting rules directly in Python — no tokens, no model
variance, identical result on every run. Pulling these dimensions out of the
LLM judge means the judge can focus its budget on the genuinely subjective
dimensions (usefulness, natural flow, factual grounding), while the
mechanical rules (word count, acronym expansion, the "deadly 7 verbs",
sentence length, Flesch-Kincaid readability, jargon, formatting) are scored
reproducibly.

Implements the checks scoped in the Output Evaluation Report, Section 9
("Automated Quality Checks"). The thresholds mirror WA EO 23-02 / the federal
Plain Writing Act and the data.wa.gov metadata guidance.

Everything here is pure-Python standard library so it can run anywhere the
backend runs and inside the analysis scripts.
"""

from __future__ import annotations

import re
from typing import Any

# Word-count targets (soft) from the WA guidance, expressed as accept ranges.
_DATASET_WORD_RANGE = (80, 120)
_COLUMN_WORD_RANGE = (30, 70)

# Federal Plain Writing Act aims for grade 6-8; we allow up to 9 because
# metadata legitimately references coded values and technical standards.
_FK_GRADE_MAX = 9.0

# WA EO 23-02 "deadly 7 verbs" — prefer action verbs over these linking verbs.
_DEADLY_7 = {"am", "is", "are", "was", "were", "be", "been"}

# A representative slice of the WA EO 23-02 word-substitution list: each of
# these has a plainer everyday equivalent and should be flagged.
_JARGON = {
    "utilize": "use",
    "utilization": "use",
    "prior to": "before",
    "subsequent to": "after",
    "in order to": "to",
    "facilitate": "help",
    "commence": "start",
    "terminate": "end",
    "endeavor": "try",
    "furnish": "give / provide",
    "ascertain": "find out",
    "additional": "more / extra",
    "approximately": "about",
    "in the event that": "if",
    "with regard to": "about",
    "in conjunction with": "with",
    "pursuant to": "under / following",
    "aforementioned": "this / these",
    "henceforth": "from now on",
    "leverage": "use",
    "comprise": "make up / include",
    "demonstrate": "show",
    "indicate": "show",
    "methodology": "method",
    "numerous": "many",
    "obtain": "get",
    "regarding": "about",
    "sufficient": "enough",
}

# Generic, low-information openings the WA guidance tells publishers to vary.
_GENERIC_OPENINGS = (
    "this dataset",
    "this data set",
    "this column",
    "this field",
    "this data",
    "the dataset",
    "the column",
)

_SENTENCE_SPLIT = re.compile(r"[.!?]+(?:\s+|$)")
_WORD_RE = re.compile(r"[A-Za-z0-9']+")
_ACRONYM_RE = re.compile(r"\b[A-Z][A-Z0-9]{1,}\b")
_BULLET_RE = re.compile(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+")
# Passive-voice heuristic: a "be" verb followed (within a couple words) by a
# word ending in -ed/-en, or an explicit "by" agent. Deliberately a first-pass
# filter, not a parser — flagged as approximate in the report.
_PASSIVE_RE = re.compile(
    r"\b(?:am|is|are|was|were|be|been|being)\b(?:\s+\w+){0,2}\s+\w+(?:ed|en)\b",
    re.IGNORECASE,
)


def _sentences(text: str) -> list[str]:
    parts = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    return parts


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text)


def _count_syllables(word: str) -> int:
    """Heuristic syllable count: vowel groups, minus a silent trailing 'e',
    floored at 1. Good enough for Flesch-style readability estimates."""
    w = word.lower()
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    count = len(groups)
    if w.endswith("e") and not w.endswith(("le", "ye")) and count > 1:
        count -= 1
    return max(count, 1)


def _flesch(text: str, sentences: list[str], words: list[str]) -> tuple[float, float]:
    """Return (reading_ease, fk_grade). Empty/degenerate input → (0, 0)."""
    n_sentences = max(len(sentences), 1)
    n_words = len(words)
    if n_words == 0:
        return 0.0, 0.0
    n_syllables = sum(_count_syllables(w) for w in words)
    words_per_sentence = n_words / n_sentences
    syllables_per_word = n_syllables / n_words
    reading_ease = 206.835 - 1.015 * words_per_sentence - 84.6 * syllables_per_word
    fk_grade = 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59
    return round(reading_ease, 1), round(fk_grade, 1)


def _unexpanded_acronyms(text: str) -> list[str]:
    """Acronyms (2+ uppercase letters) that never appear with an expansion.

    We treat an acronym as expanded if it is immediately followed by a
    parenthetical — ``Department of Licensing (DOL)`` — or if the same token is
    introduced in parentheses after a capitalized phrase. This is a first-pass
    filter: it catches the common ``DOL`` / ``GIS`` case without a parser.
    """
    found: list[str] = []
    seen: set[str] = set()
    for m in _ACRONYM_RE.finditer(text):
        token = m.group(0)
        if token in seen:
            continue
        seen.add(token)
        tail = text[m.end() : m.end() + 2]
        # Expanded inline as "ACRONYM (Full Name)" or introduced as "(ACRONYM)".
        introduced_inline = tail.strip().startswith("(")
        introduced_paren = f"({token})" in text
        if not introduced_inline and not introduced_paren:
            found.append(token)
    return found


def _jargon_hits(text: str) -> list[str]:
    low = text.lower()
    return sorted(
        {term for term in _JARGON if re.search(rf"\b{re.escape(term)}\b", low)}
    )


def _deadly7(sentences: list[str], words: list[str]) -> tuple[int, float]:
    count = sum(1 for w in words if w.lower() in _DEADLY_7)
    n_sentences = max(len(sentences), 1)
    sentences_with = sum(
        1 for s in sentences if any(w.lower() in _DEADLY_7 for w in _words(s))
    )
    return count, round(sentences_with / n_sentences, 2)


def _passive_ratio(sentences: list[str]) -> float:
    n_sentences = max(len(sentences), 1)
    passive = sum(1 for s in sentences if _PASSIVE_RE.search(s))
    return round(passive / n_sentences, 2)


def quality_checks(text: str, kind: str = "dataset") -> dict[str, Any]:
    """Compute deterministic quality metrics for one description.

    ``kind`` is ``"dataset"`` or ``"column"`` and selects the word-count target
    and a couple of formatting rules. Returns raw metrics plus a ``flags`` dict
    where ``True`` marks a violation, and a ``violation_count`` summary the UI /
    analysis can sort on.
    """
    text = (text or "").strip()
    sentences = _sentences(text)
    words = _words(text)
    word_count = len(words)

    word_range = _COLUMN_WORD_RANGE if kind == "column" else _DATASET_WORD_RANGE
    sentence_lengths = [len(_words(s)) for s in sentences]
    long_sentences = sum(1 for n in sentence_lengths if n > 20)
    avg_sentence_words = (
        round(sum(sentence_lengths) / len(sentence_lengths), 1)
        if sentence_lengths
        else 0.0
    )
    max_sentence_words = max(sentence_lengths) if sentence_lengths else 0

    reading_ease, fk_grade = _flesch(text, sentences, words)
    unexpanded = _unexpanded_acronyms(text)
    deadly7_count, deadly7_ratio = _deadly7(sentences, words)
    passive_ratio = _passive_ratio(sentences)
    jargon = _jargon_hits(text)

    paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    paragraph_count = len(paragraphs)
    has_bullets = bool(_BULLET_RE.search(text))
    low = text.lower()
    generic_opening = any(low.startswith(op) for op in _GENERIC_OPENINGS)

    # Column guidance asks for 2-5 sentences; datasets stay under 6 per paragraph.
    sentence_count = len(sentences)
    if kind == "column":
        sentence_count_bad = not (2 <= sentence_count <= 5) and word_count > 0
    else:
        sentence_count_bad = sentence_count > 6

    flags = {
        "word_count_out_of_range": word_count > 0
        and not (word_range[0] <= word_count <= word_range[1]),
        "long_sentences": long_sentences > 0,
        "fk_grade_too_high": fk_grade > _FK_GRADE_MAX,
        "unexpanded_acronyms": bool(unexpanded),
        "passive_voice": passive_ratio >= 0.5,
        "deadly7_overuse": deadly7_ratio > 0.5,
        "jargon": bool(jargon),
        "multi_paragraph": paragraph_count > 1,
        "has_bullets": has_bullets,
        "generic_opening": generic_opening,
        "sentence_count": sentence_count_bad,
    }

    return {
        "word_count": word_count,
        "word_target": list(word_range),
        "sentence_count": sentence_count,
        "avg_sentence_words": avg_sentence_words,
        "max_sentence_words": max_sentence_words,
        "long_sentences": long_sentences,
        "flesch_reading_ease": reading_ease,
        "flesch_kincaid_grade": fk_grade,
        "unexpanded_acronyms": unexpanded,
        "deadly7_count": deadly7_count,
        "deadly7_sentence_ratio": deadly7_ratio,
        "passive_sentence_ratio": passive_ratio,
        "jargon_hits": jargon,
        "paragraph_count": paragraph_count,
        "has_bullets": has_bullets,
        "generic_opening": generic_opening,
        "flags": flags,
        "violation_count": sum(1 for v in flags.values() if v),
    }
