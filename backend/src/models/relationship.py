"""Relationship API response models."""

from pydantic import BaseModel


class RelationshipNodeResponse(BaseModel):
    """Represent one Agent node in a relationship snapshot."""

    id: str
    name: str


class RelationshipEdgeResponse(BaseModel):
    """Represent one directed relationship edge in a snapshot."""

    source: str
    target: str
    score: float


class RelationshipSnapshotResponse(BaseModel):
    """Return the current relationship graph for an active World."""

    nodes: list[RelationshipNodeResponse]
    edges: list[RelationshipEdgeResponse]
