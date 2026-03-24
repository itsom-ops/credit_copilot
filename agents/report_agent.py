import os
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

def generate_report(state: dict):
    applicant_data = state.get("extracted_data")
    risk_analysis = state.get("risk_analysis")
    recommendation = state.get("recommendation")
    stress_test = state.get("stress_test_analysis", "No stress test conducted.")

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the Lead EY Underwriting Architect. Your job is to format the final decision into a visually stunning, comparative Markdown report.

CRITICAL INSTRUCTION 1 (HALLUCINATION HEATMAP):
You MUST deeply interweave HTML `<span>` tags into the Applicant Data numbers to visually flag extraction confidence for the UI.
Use these EXACT HTML classes:
- `<span class="conf-high">[Number]</span>` for hard facts (e.g. Credit Score, Exact Income).
- `<span class="conf-med">[Number]</span>` for variables that are estimated or volatile (e.g. Monthly Debt, Loan Amortization).

CRITICAL INSTRUCTION 2 (COMPARATIVE ANALYSIS):
Instead of a single recommendation, generate a rich Markdown Table comparing TWO entirely different bank risk personas:
1. "Conservative Bank (Standard Policy)"
2. "Aggressive Growth Bank (High-Risk Appetite)"
Compare how they would respectively rule on this exact application!

Format structure:
# EY Underwriting Copilot: Final Report
## 1. Applicant Snapshot (Use <span> heatmap tags here)
## 2. Automated Risk Analysis
## 3. Macro-Economic Stress Test Strategy
## 4. "What-If" Comparative Strategy (The Markdown Table)

Return ONLY the raw Markdown string (do not wrap it in ```markdown blocks)."""),
        ("human", "Decision: {recommendation}\nAnalysis: {risk_analysis}\nStress: {stress_test}\nData: {data}")
    ])
    
    llm = ChatGroq(model_name="llama-3.1-8b-instant", temperature=0)
    chain = prompt | llm | StrOutputParser()
    
    report = chain.invoke({
        "recommendation": recommendation, 
        "risk_analysis": risk_analysis, 
        "stress_test": stress_test, 
        "data": applicant_data
    })
    
    return {"final_report": report}
