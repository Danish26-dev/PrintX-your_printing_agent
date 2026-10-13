"""Closed operation schema for document editing.

This is the security and reliability boundary of PrintX. The AI agent is only
ever allowed to produce operations defined here. Anything it returns is treated
as untrusted input and validated against these models before any document is
touched. There is deliberately NO "run arbitrary code" or "freeform edit"
operation, and there never should be.

V1 operations:
  - replace_text : find/replace a literal string
  - set_copies   : set the number of print copies (document metadata, not an edit)

To add a new operation you:
  1. Add a model here (subclass of Operation with a unique literal `type`).
  2. Add it to the `Operation` union and `OPERATION_MODELS`.
  3. Implement its deterministic executor in operations.py.
Nothing else in the pipeline needs to change.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator


# Hard limits to keep a single request bounded and predictable.
MAX_OPERATIONS = 50
MAX_TEXT_LENGTH = 5000
MAX_COPIES = 999


class PageRange(BaseModel):
    """An inclusive 1-based page range, e.g. {from: 1, to: 3} means pages 1,2,3.

    Page numbers are 1-based in the user-facing instruction and in this schema.
    The deterministic executor converts them to 0-based indexes internally.
    """

    # `from` is a Python keyword, so expose it via an alias and read it as
    # `from_page` in code. Clients still send {"from": 1, "to": 3}.
    from_page: int = Field(..., ge=1, alias="from")
    to_page: int = Field(..., ge=1, alias="to")

    model_config = {"populate_by_name": True}

    @field_validator("to_page")
    @classmethod
    def to_after_from(cls, v: int, info) -> int:  # type: ignore[no-untyped-def]
        start = info.data.get("from_page")
        if start is not None and v < start:
            raise ValueError("`to` page must be >= `from` page")
        return v


class ReplaceTextOperation(BaseModel):
    """Replace every literal occurrence of `find` with `replace`.

    Matching is literal (not regex) and case-sensitive. The executor preserves
    surrounding document formatting; it only rewrites the matched text.

    `pages` is OPTIONAL. When omitted, the replacement applies to the WHOLE
    document (the long-standing default). When present, the replacement is
    restricted to the given inclusive 1-based page range; occurrences on any
    other page are left unchanged. Page scoping is only meaningful for PDFs
    (which have fixed pages); the engine rejects it for DOCX input where there
    is no fixed pagination.
    """

    type: Literal["replace_text"]
    find: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    replace: str = Field(..., max_length=MAX_TEXT_LENGTH)
    pages: PageRange | None = None

    @field_validator("find")
    @classmethod
    def find_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("`find` cannot be blank or whitespace-only")
        return v


class SetCopiesOperation(BaseModel):
    """Set how many copies should be printed. This is print metadata and does
    not modify the document content itself."""

    type: Literal["set_copies"]
    copies: int = Field(..., ge=1, le=MAX_COPIES)


# Discriminated union: pydantic picks the right model based on the `type` field.
Operation = Annotated[
    Union[ReplaceTextOperation, SetCopiesOperation],
    Field(discriminator="type"),
]

# Registry of supported operation type names -> model, for validation/help text.
OPERATION_MODELS = {
    "replace_text": ReplaceTextOperation,
    "set_copies": SetCopiesOperation,
}


class OperationPlan(BaseModel):
    """The full, validated plan the agent produces for one document.

    `operations` are content/metadata operations applied in order.
    """

    operations: list[Operation] = Field(default_factory=list, max_length=MAX_OPERATIONS)

    @field_validator("operations")
    @classmethod
    def at_least_something(cls, v: list) -> list:
        # An empty plan is allowed structurally (caller decides if that's an
        # error for their context), but we surface it clearly.
        return v


def supported_operations() -> list[str]:
    """Names of operations the engine can execute, for prompts and error text."""
    return list(OPERATION_MODELS.keys())
