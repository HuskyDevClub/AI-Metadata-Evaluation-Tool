from pydantic import BaseModel, Field, model_validator


class HealthResponse(BaseModel):
    """Response body for the /health check."""

    status: str
    timestamp: str


class PromptOverrides(BaseModel):
    """Per-run generation prompt overrides, edited in the Settings drawer.

    Any field left blank falls back to the resolved default template (the
    canonical PROMPTS_SOURCE_URL copy or the bundled fallback).
    """

    system: str | None = Field(default=None, max_length=50000)
    dataset: str | None = Field(default=None, max_length=50000)
    column: str | None = Field(default=None, max_length=50000)


class ScoringCategory(BaseModel):
    """A single judge metric. `key` is used as the JSON-schema property name the
    judge fills in, so it must be a safe identifier; `label`/`description` guide
    the judge and label the UI. `min`/`max` set the integer score range the judge
    must stay within (default 0–10)."""

    key: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]*$", max_length=60)
    label: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    min: int = Field(default=0, ge=0, le=1000)
    max: int = Field(default=10, ge=1, le=1000)

    @model_validator(mode="after")
    def _check_range(self) -> "ScoringCategory":
        if self.max <= self.min:
            raise ValueError("score range max must be greater than min")
        return self


class EvalRunRequest(BaseModel):
    """Request body for the metadata eval run (POST /api/eval/run).

    Mirrors the tunable knobs in evaluate_metadata_quality.ipynb.
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
    # Per-run prompt + judge-metric overrides from the Settings drawer. When
    # omitted, the backend uses its resolved default prompts and scoring lists.
    prompts: PromptOverrides | None = None
    scoringCategoriesDataset: list[ScoringCategory] | None = Field(
        default=None, max_length=30
    )
    scoringCategoriesColumn: list[ScoringCategory] | None = Field(
        default=None, max_length=30
    )
