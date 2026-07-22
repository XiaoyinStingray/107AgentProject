"""World control endpoint response models."""

from pydantic import BaseModel


class WorldControlResponse(BaseModel):
    """Return the result of a World lifecycle mutation."""

    status: str
    world_id: str | None = None
