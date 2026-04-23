from typing import Literal, Optional

from pydantic import BaseModel, Field


class DispenseRequest(BaseModel):
    litres: float = Field(gt=0, le=100, description="Requested litres to dispense.")


class DispenseAccepted(BaseModel):
    id: str
    status: Literal["accepted"]


class DispenseRejected(BaseModel):
    id: str
    status: Literal["rejected"]
    reason: Optional[str] = None


class DispenseTimeout(BaseModel):
    id: str
    status: Literal["timeout"]


class ProgressFrame(BaseModel):
    id: str
    litres: float
    status: Literal["dispensing", "complete", "failed"]
    reason: Optional[str] = None
