from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

llm = ChatGroq(model_name="llama-3.3-70b-versatile", temperature=0)

class RiskDecision(BaseModel):
    analysis: str = Field(description="Detailed step-by-step risk analysis based on policies.")
    recommendation: str = Field(description="Final decision: 'Approve', 'Reject', or 'Manual Review'.")

risk_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a strict Bank Credit Underwriter. 
Analyze the applicant's financial metrics against the bank's lending policies.
Calculate the Debt-to-Income (DTI) ratio.
Identify any red flags and make a final decision.

CRITICAL REQUIREMENT 1: For every rule you apply, you MUST explicitly cite the exact policy section (e.g. "[Section 1.2]") that justifies your decision in your analysis to guarantee audit compliance.

CRITICAL REQUIREMENT 2: DO NOT use 'Manual Review' as a lazy fallback. You MUST issue a rigid 'Reject' immediately if the applicant is clearly unqualified. 
If the extracted Credit Score is < 620, output 'Reject'.
If the extracted DTI is > 43% and there is no explicit mention of immense liquid assets, you MUST output 'Reject'.
ONLY use 'Manual Review' if the score is exactly [620-719], or DTI is exactly [42-43%].
If DTI < 41% and Credit Score >= 720, you MUST output 'Approve'.
"""),
    ("human", """
Applicant Data:
{extracted_data}

Bank Lending Policies:
{policy_context}
""")
])

risk_chain = risk_prompt | llm.with_structured_output(schema=RiskDecision)

def analyze_risk(state: dict):
    """LangGraph node to evaluate risk and make a decision."""
    extracted = state.get("extracted_data", {})
    policy = state.get("policy_context", "")
    
    decision = risk_chain.invoke({
        "extracted_data": extracted,
        "policy_context": policy
    })
    
    return {
        "risk_analysis": decision.analysis,
        "recommendation": decision.recommendation
    }
