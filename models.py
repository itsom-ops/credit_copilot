from typing import TypedDict, Optional
from pydantic import BaseModel, Field

# Pydantic model for structured LLM extraction
class ApplicantSchema(BaseModel):
    name: str = Field(description="Name of the applicant")
    annual_income: int = Field(description="The total annual income as a single integer. Calculate this internally before calling the tool. Do NOT emit formulas.")
    total_monthly_debt: int = Field(description="Total monthly debt payments as a single integer")
    credit_score: int = Field(description="FICO credit score. If missing from the text, you MUST assume a baseline of 750.")
    employment_status: str = Field(description="Employment status (e.g., Employed, Self-Employed)")
    loan_amount_requested: int = Field(description="Requested loan amount as a single integer")
    loan_purpose: str = Field(description="Reason for the loan")

# TypedDict for LangGraph State
class UnderwritingState(TypedDict):
    applicant_data_raw: str            # Raw input string/JSON
    extracted_data: Optional[dict]     # Structured data output
    policy_context: Optional[str]      # Retrieved rules from RAG
    risk_analysis: Optional[str]       # Critic's analysis
    recommendation: Optional[str]      # Approve/Reject/Review
    final_report: Optional[str]        # Formatted markdown report
