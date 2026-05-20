from pydantic import BaseModel, Field


class EvalRunRequest(BaseModel):
    """Request body for the dev-mode metadata eval run (POST /api/eval/run).

    Mirrors the tunable knobs in evaluate_metadata_quality.ipynb. Served by the
    standalone eval backend (eval.main); not part of the main app.
    """

    datasetLimit: int | None = Field(default=5, ge=1, le=200)
    evalColumns: bool = True
    maxColumnsPerDataset: int | None = Field(default=8, ge=1, le=100)
    # Override the generator/judge model for this run. When blank, the backend
    # falls back to the LLM_MODEL / JUDGE_LLM_MODEL env vars. The chosen models
    # must be served by the configured LLM_ENDPOINT.
    # generatorModels evaluates each model in turn against the same datasets, so
    # their descriptions can be compared side by side.
    generatorModels: list[str] | None = Field(default=None, max_length=20)
    judgeModel: str | None = Field(default=None, max_length=200)
