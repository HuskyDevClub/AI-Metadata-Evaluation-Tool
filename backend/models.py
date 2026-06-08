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


class PromptVariant(BaseModel):
    """A named generation-prompt set, used to compare prompts side by side in one
    run. Any blank field falls back to the resolved default template (after the
    run-level `prompts` overrides are applied)."""

    name: str = Field(min_length=1, max_length=80)
    system: str | None = Field(default=None, max_length=50000)
    dataset: str | None = Field(default=None, max_length=50000)
    column: str | None = Field(default=None, max_length=50000)


class ImportedDataset(BaseModel):
    """A dataset supplied by the client (e.g. parsed from an AI-Metadata-
    Improvement-Tool export). The dataset is still loaded live from Socrata by
    `uid`; the optional `description`/`columnDescriptions` carry the existing
    human-curated metadata the eval can score on its own."""

    uid: str = Field(min_length=1, max_length=64)
    name: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=20000)
    # Existing column descriptions keyed by column display name.
    columnDescriptions: dict[str, str] | None = None
    domain: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _cap_columns(self) -> "ImportedDataset":
        # Defensive cap so a hand-edited file can't balloon the request body.
        if self.columnDescriptions and len(self.columnDescriptions) > 1000:
            self.columnDescriptions = dict(list(self.columnDescriptions.items())[:1000])
        return self


class EvalRunRequest(BaseModel):
    """Request body for the metadata eval run (POST /api/eval/run).

    A run scores one or more *candidates* per dataset. Candidates come from:
      - existing metadata published live on data.wa.gov (`evaluateLive`),
      - existing metadata supplied via `importedDatasets` (`evaluateImported`),
      - freshly generated metadata, one per generator model × prompt variant.
    Each candidate is scored absolutely on the judge metrics; generated
    candidates are additionally judged head-to-head against the live "gold"
    description when `compareGold` is on (that match produces the winner badge).
    """

    datasetLimit: int | None = Field(default=5, ge=1, le=200)
    evalColumns: bool = True
    maxColumnsPerDataset: int | None = Field(default=8, ge=1, le=100)

    # --- Dataset source (first non-empty wins; else the bundled CSV) ----------
    # Explicit Socrata UIDs, or datasets imported from the Improvement tool's
    # JSON export (which carry their UID plus the curated metadata to validate).
    datasetIds: list[str] | None = Field(default=None, max_length=200)
    importedDatasets: list[ImportedDataset] | None = Field(default=None, max_length=200)

    # --- Generation axes ------------------------------------------------------
    # Each generator model is run against every dataset; an empty list means
    # "don't generate" (evaluate existing metadata only). Blank entries fall back
    # to the LLM_MODEL env var. The chosen models must be served by LLM_ENDPOINT.
    generatorModels: list[str] | None = Field(default=None, max_length=20)
    # Named prompt sets to compare. Omitted → a single "Default" variant.
    promptVariants: list[PromptVariant] | None = Field(default=None, max_length=10)
    judgeModel: str | None = Field(default=None, max_length=200)

    # --- What to evaluate / how to compare ------------------------------------
    # Score the existing metadata as its own candidate (no generation).
    evaluateLive: bool = False  # the live data.wa.gov description
    evaluateImported: bool = False  # the imported (curated) description
    # Judge each generated candidate head-to-head against the live gold (winner).
    compareGold: bool = True

    # Per-run prompt + judge-metric overrides from the Settings drawer. When
    # omitted, the backend uses its resolved default prompts and scoring lists.
    prompts: PromptOverrides | None = None
    scoringCategoriesDataset: list[ScoringCategory] | None = Field(
        default=None, max_length=30
    )
    scoringCategoriesColumn: list[ScoringCategory] | None = Field(
        default=None, max_length=30
    )
