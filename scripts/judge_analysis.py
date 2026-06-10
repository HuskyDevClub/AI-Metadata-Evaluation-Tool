#!/usr/bin/env python3
"""Judge meta-evaluation and score-distribution analysis.

This is the tooling for the Output Evaluation Report's #1 open question — does
the LLM judge actually agree with humans? — plus the score-quality checks that
tell you whether the 0-10 scale discriminates and whether any scoring
categories are redundant.

Three modes, all pure-Python standard library (no numpy/scipy needed):

  # 1. Score distribution + inter-category correlation, straight from a run.
  #    Needs no human labels. Flags scores that cluster at the ceiling (the
  #    scale isn't discriminating) and category pairs that move together
  #    (they're double-counted in the total).
  python scripts/judge_analysis.py distribution path/to/run_output.json

  # 2. Emit a CSV for human raters: one row per judged description, the judge's
  #    scores pre-filled, and blank human_<category> columns to fill in.
  python scripts/judge_analysis.py template run_output.json human_scores.csv --sample 40

  # 3. After humans fill it in, compute judge<->human agreement per category:
  #    Spearman rho, quadratic-weighted Cohen's kappa, mean bias, MAE.
  python scripts/judge_analysis.py agreement human_scores.csv

The run JSON is whatever the eval saves — either the `output` object
(`metadata` + `results`) or the streamed `{"type":"complete","output":{...}}`.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import sys
from pathlib import Path
from typing import Any


# --------------------------------------------------------------------------- #
# Pure-Python statistics
# --------------------------------------------------------------------------- #
def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2 or len(ys) != n:
        return None
    mx, my = _mean(xs), _mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


def _ranks(xs: list[float]) -> list[float]:
    """Average ranks, ties shared (so Spearman handles repeated scores)."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1  # 1-based average rank for the tie group
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def _spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 2 or len(xs) != len(ys):
        return None
    return _pearson(_ranks(xs), _ranks(ys))


def _quadratic_weighted_kappa(a: list[int], b: list[int]) -> float | None:
    """Cohen's kappa with quadratic weights — the standard agreement metric for
    ordinal ratings (penalizes far-apart disagreements more than near ones)."""
    if not a or len(a) != len(b):
        return None
    lo = min(min(a), min(b))
    hi = max(max(a), max(b))
    n_cat = hi - lo + 1
    if n_cat < 2:
        return None
    n = len(a)
    obs = [[0.0] * n_cat for _ in range(n_cat)]
    for x, y in zip(a, b):
        obs[x - lo][y - lo] += 1
    hist_a = [sum(row) for row in obs]
    hist_b = [sum(obs[i][j] for i in range(n_cat)) for j in range(n_cat)]
    num = den = 0.0
    for i in range(n_cat):
        for j in range(n_cat):
            w = ((i - j) ** 2) / ((n_cat - 1) ** 2)
            exp = hist_a[i] * hist_b[j] / n
            num += w * obs[i][j]
            den += w * exp
    if den == 0:
        return 1.0
    return 1 - num / den


# --------------------------------------------------------------------------- #
# Run-output extraction
# --------------------------------------------------------------------------- #
def _load_output(path: str) -> dict[str, Any]:
    raw = Path(path).read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Maybe ndjson stream — find the line carrying the complete output.
        data = None
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict) and obj.get("type") == "complete":
                data = obj.get("output")
        if data is None:
            sys.exit(f"Could not parse a run output from {path}")
    if isinstance(data, dict) and "output" in data and "results" not in data:
        data = data["output"]
    if not isinstance(data, dict) or "results" not in data:
        sys.exit("File does not look like an eval run output (no 'results').")
    return data


def _category_keys(meta: dict[str, Any], level: str) -> list[str]:
    key = f"scoring_categories_{level}"
    cats = meta.get(key) or []
    return [c["key"] for c in cats if isinstance(c, dict) and "key" in c]


def _iter_blocks(output: dict[str, Any]):
    """Yield (level, source, candidate_label, score_block) for every judged
    description in the run. `source` is 'gold' (candidate1) or 'generated'
    (candidate2)."""
    for result in output.get("results", []):
        if not isinstance(result, dict):
            continue
        for cand in result.get("model_evaluations", []) or []:
            label = cand.get("generator_model", "?")
            ds_j = (cand.get("dataset_evaluation") or {}).get("judgment") or {}
            for src, block_key in (("gold", "candidate1"), ("generated", "candidate2")):
                block = ds_j.get(block_key)
                if isinstance(block, dict):
                    yield "dataset", src, label, block
            for col in cand.get("column_evaluations", []) or []:
                col_j = col.get("judgment") or {}
                for src, block_key in (
                    ("gold", "candidate1"),
                    ("generated", "candidate2"),
                ):
                    block = col_j.get(block_key)
                    if isinstance(block, dict):
                        yield "column", src, label, block


def _scores_by_category(output: dict[str, Any], level: str) -> dict[str, list[int]]:
    keys = _category_keys(output.get("metadata", {}), level)
    by_cat: dict[str, list[int]] = {k: [] for k in keys}
    for lvl, _src, _label, block in _iter_blocks(output):
        if lvl != level:
            continue
        for k in keys:
            v = block.get(k)
            if isinstance(v, int):
                by_cat[k].append(v)
    return {k: v for k, v in by_cat.items() if v}


def _item_vectors(
    output: dict[str, Any], level: str
) -> tuple[list[str], list[list[int]]]:
    """One row per judged block, one column per category — for correlation."""
    keys = _category_keys(output.get("metadata", {}), level)
    rows: list[list[int]] = []
    for lvl, _src, _label, block in _iter_blocks(output):
        if lvl != level:
            continue
        if all(isinstance(block.get(k), int) for k in keys) and keys:
            rows.append([block[k] for k in keys])
    return keys, rows


# --------------------------------------------------------------------------- #
# Mode: distribution
# --------------------------------------------------------------------------- #
def _bar(frac: float, width: int = 24) -> str:
    filled = int(round(frac * width))
    return "█" * filled + "·" * (width - filled)


def cmd_distribution(args: argparse.Namespace) -> None:
    output = _load_output(args.run)
    for level in ("dataset", "column"):
        by_cat = _scores_by_category(output, level)
        if not by_cat:
            continue
        print(
            f"\n{'=' * 70}\n{level.upper()} — score distribution ({sum(len(v) for v in by_cat.values())} scores)\n{'=' * 70}"
        )
        print(f"{'category':<22}{'n':>5}{'mean':>7}{'std':>7}{'%top3':>7}  flag")
        for cat, scores in by_cat.items():
            hi = max(scores)
            top3 = sum(1 for s in scores if s >= hi - 2) / len(scores)
            std = _std([float(s) for s in scores])
            flag = ""
            if std < 1.0:
                flag = "LOW SPREAD — scale barely discriminates"
            elif top3 > 0.8:
                flag = "CEILING — >80% in top 3 values"
            print(
                f"{cat:<22}{len(scores):>5}{_mean([float(s) for s in scores]):>7.2f}{std:>7.2f}{top3 * 100:>6.0f}%  {flag}"
            )

        # Inter-category correlation: redundant categories double-count in totals.
        keys, rows = _item_vectors(output, level)
        if len(rows) >= 3 and len(keys) >= 2:
            print(
                f"\n{level.upper()} — category pairs that move together (|Pearson r| ≥ 0.8):"
            )
            cols = list(zip(*rows))
            redundant = []
            for i in range(len(keys)):
                for j in range(i + 1, len(keys)):
                    r = _pearson(
                        [float(x) for x in cols[i]], [float(x) for x in cols[j]]
                    )
                    if r is not None and abs(r) >= 0.8:
                        redundant.append((keys[i], keys[j], r))
            if redundant:
                for a, b, r in sorted(redundant, key=lambda t: -abs(t[2])):
                    print(
                        f"  {a} ↔ {b}:  r = {r:+.2f}  (consider merging or weighting)"
                    )
            else:
                print("  none — categories carry distinct signal.")
    print()


# --------------------------------------------------------------------------- #
# Mode: template
# --------------------------------------------------------------------------- #
def cmd_template(args: argparse.Namespace) -> None:
    output = _load_output(args.run)
    meta = output.get("metadata", {})
    ds_keys = _category_keys(meta, "dataset")
    col_keys = _category_keys(meta, "column")

    rows: list[dict[str, Any]] = []
    rid = 0
    for result in output.get("results", []):
        if not isinstance(result, dict):
            continue
        ds_id = result.get("dataset_id", "")
        for cand in result.get("model_evaluations", []) or []:
            label = cand.get("generator_model", "?")
            ds_eval = cand.get("dataset_evaluation") or {}
            block = (ds_eval.get("judgment") or {}).get("candidate2")
            if isinstance(block, dict):
                rid += 1
                row = {
                    "item_id": f"ds{rid}",
                    "dataset_id": ds_id,
                    "level": "dataset",
                    "candidate": label,
                    "text": (ds_eval.get("generated_description") or "").replace(
                        "\n", " "
                    ),
                }
                for k in ds_keys:
                    row[f"judge_{k}"] = block.get(k, "")
                    row[f"human_{k}"] = ""
                rows.append(row)
            for col in cand.get("column_evaluations", []) or []:
                block = (col.get("judgment") or {}).get("candidate2")
                if isinstance(block, dict):
                    rid += 1
                    row = {
                        "item_id": f"col{rid}",
                        "dataset_id": ds_id,
                        "level": "column",
                        "candidate": f"{label} · {col.get('display_name', '')}",
                        "text": (col.get("generated_description") or "").replace(
                            "\n", " "
                        ),
                    }
                    for k in col_keys:
                        row[f"judge_{k}"] = block.get(k, "")
                        row[f"human_{k}"] = ""
                    rows.append(row)

    if not rows:
        sys.exit("No scored candidates found to sample.")
    if args.sample and args.sample < len(rows):
        random.seed(args.seed)
        rows = random.sample(rows, args.sample)

    # Union of all columns, stable order.
    fieldnames: list[str] = ["item_id", "dataset_id", "level", "candidate", "text"]
    for k in ds_keys:
        for pre in ("judge", "human"):
            col = f"{pre}_{k}"
            if col not in fieldnames:
                fieldnames.append(col)
    for k in col_keys:
        for pre in ("judge", "human"):
            col = f"{pre}_{k}"
            if col not in fieldnames:
                fieldnames.append(col)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    print(
        f"Wrote {len(rows)} rows to {args.out}. Fill in the human_* columns, then run:\n  python scripts/judge_analysis.py agreement {args.out}"
    )


# --------------------------------------------------------------------------- #
# Mode: agreement
# --------------------------------------------------------------------------- #
def cmd_agreement(args: argparse.Namespace) -> None:
    with open(args.labeled, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("Empty CSV.")
    cats = sorted(
        c[len("human_") :]
        for c in rows[0]
        if c.startswith("human_") and f"judge_{c[len('human_'):]}" in rows[0]
    )
    if not cats:
        sys.exit("No matching human_<cat>/judge_<cat> column pairs found.")

    print(f"\n{'=' * 78}\nJUDGE ↔ HUMAN AGREEMENT  ({len(rows)} rows)\n{'=' * 78}")
    print(
        f"{'category':<22}{'n':>4}{'spearman':>10}{'qwkappa':>9}{'bias':>7}{'MAE':>6}  read"
    )
    print("-" * 78)
    for cat in cats:
        pairs = []
        for row in rows:
            h, j = row.get(f"human_{cat}", ""), row.get(f"judge_{cat}", "")
            try:
                pairs.append((int(float(h)), int(float(j))))
            except (ValueError, TypeError):
                continue
        if len(pairs) < 2:
            print(f"{cat:<22}{len(pairs):>4}  (not enough labeled rows)")
            continue
        hs = [p[0] for p in pairs]
        js = [p[1] for p in pairs]
        rho = _spearman([float(x) for x in hs], [float(x) for x in js])
        kappa = _quadratic_weighted_kappa(js, hs)
        bias = _mean([j - h for h, j in pairs])  # + = judge scores higher
        mae = _mean([abs(j - h) for h, j in pairs])
        read = (
            "strong"
            if (rho or 0) >= 0.7
            else "moderate" if (rho or 0) >= 0.4 else "WEAK — don't trust"
        )
        rho_s = f"{rho:+.2f}" if rho is not None else "  n/a"
        kappa_s = f"{kappa:+.2f}" if kappa is not None else "  n/a"
        print(
            f"{cat:<22}{len(pairs):>4}{rho_s:>10}{kappa_s:>9}{bias:>+7.2f}{mae:>6.2f}  {read}"
        )
    print(
        "\nSpearman ρ = rank correlation (does the judge order items like a human?).\n"
        "QW-kappa  = quadratic-weighted agreement on the actual values.\n"
        "bias      = mean(judge − human); positive means the judge scores high.\n"
        "Use this table to decide which categories the judge can be trusted on,\n"
        "and which should be routed to humans or replaced by deterministic checks.\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_dist = sub.add_parser(
        "distribution", help="score spread + category correlation from a run"
    )
    p_dist.add_argument("run", help="eval run output JSON")
    p_dist.set_defaults(func=cmd_distribution)

    p_tmpl = sub.add_parser("template", help="emit a CSV for human rating")
    p_tmpl.add_argument("run", help="eval run output JSON")
    p_tmpl.add_argument("out", help="CSV path to write")
    p_tmpl.add_argument(
        "--sample", type=int, default=0, help="random subset size (0 = all)"
    )
    p_tmpl.add_argument("--seed", type=int, default=13, help="sampling seed")
    p_tmpl.set_defaults(func=cmd_template)

    p_agree = sub.add_parser(
        "agreement", help="judge<->human agreement from a labeled CSV"
    )
    p_agree.add_argument("labeled", help="CSV with human_<cat> and judge_<cat> columns")
    p_agree.set_defaults(func=cmd_agreement)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
