import os
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

def run_stress_test(state: dict):
    extracted_data = state.get("extracted_data", {})
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an EY Quantitative Risk Modeler. Perform a Macro-Economic Stress Test Sensitivity Analysis on this applicant.
Calculate a hypothetical Probability of Default (PD) using a quantitative Logit Model formula assuming interest rates rise by 2.0% and the applicant's industry enters a mild recession.

Formula Concept: P(Default) = 1 / (1 + e^-(B0 + B1*DebtRatio + B2*CreditScore))
Use your estimation to generate dynamic beta coefficients and calculate a final PD percentage based on this specific applicant's Income, Debt, and Credit Score.

Output a highly professional 2-paragraph Analysis explaining the mathematical risk sensitivity and identifying if the PD crosses the critical threshold (>15%).

Return purely the analysis string. Do not include markdown headers like '###'."""),
        ("human", "EY Applicant Data: {data}")
    ])
    
    llm = ChatGroq(model_name="llama-3.1-8b-instant", temperature=0)
    chain = prompt | llm | StrOutputParser()
    
    stress_results = chain.invoke({"data": extracted_data})
    
    return {"stress_test_analysis": stress_results}
