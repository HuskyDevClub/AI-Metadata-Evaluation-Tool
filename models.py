from pydantic import BaseModel, Field


class EvalRunRequest(BaseModel):
    """Request body for the dev-mode metadata eval run (POST /api/eval/run).

    Mirrors the tunable knobs in evaluate_metadata_quality.ipynb. Served by the
    standalone eval backend (eval.main); not part of the main app.
    """

    datasetLimit: int | None = Field(default=5, ge=1, le=200)
    evalColumns: bool = True
    maxColumnsPerDataset: int | None = Field(default=8, ge=1, le=100)
