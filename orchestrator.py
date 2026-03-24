import os
from langgraph.graph import StateGraph, END
from typing import TypedDict
from langgraph.checkpoint.memory import MemorySaver

from agents.extraction_agent import extract_applicant_data
from agents.policy_rag import query_policy
from agents.risk_agent import analyze_risk
from agents.report_agent import generate_report
from agents.guard_agent import run_guardrails
from agents.tools_agent import fetch_live_data
from agents.scenario_agent import run_stress_test

# Define the State
class State(TypedDict, total=False):
    applicant_data_raw: str
    extracted_data: dict
    policy_context: str
    risk_analysis: str
    stress_test_analysis: str
    recommendation: str
    final_report: str
    malicious_intent_score: float

def retrieve_policy(state: dict):
    """Node: RAG Retrieval based on extracted data"""
    extracted = state.get("extracted_data", {})
    query = f"Credit score {extracted.get('credit_score')}, Debt to income, Employment status {extracted.get('employment_status')}"
    policy_info = query_policy(query)
    return {"policy_context": policy_info}

# Routing function after Guard Agent
def route_guard(state: dict):
    if state.get("recommendation") == "Reject (Security Block)":
        return END # Stop the workflow immediately
    return "extract_data"

# Routing function for HITL Pause
def route_hitl(state: dict):
    if state.get("recommendation") == "Manual Review":
        return "human_review"
    return "generate_report"

def route_human_decision(state: dict):
    return "generate_report"

def build_graph():
    # Initialize Memory for Checkpointing
    memory = MemorySaver()
    
    workflow = StateGraph(State)

    # Add Nodes
    workflow.add_node("guard", run_guardrails)
    workflow.add_node("extract_data", extract_applicant_data)
    workflow.add_node("fetch_live_data", fetch_live_data)
    workflow.add_node("retrieve_policy", retrieve_policy)
    workflow.add_node("perform_risk_analysis", analyze_risk)
    workflow.add_node("stress_test", run_stress_test)
    workflow.add_node("generate_report", generate_report)
    
    # Empty node indicating human intervention wait state
    workflow.add_node("human_review", lambda x: x) 

    # Edges
    workflow.set_entry_point("guard")
    
    # Conditional edge from guard
    workflow.add_conditional_edges(
        "guard",
        route_guard,
        {
            "extract_data": "extract_data",
            END: END
        }
    )

    workflow.add_edge("extract_data", "fetch_live_data")
    workflow.add_edge("fetch_live_data", "retrieve_policy")
    workflow.add_edge("retrieve_policy", "perform_risk_analysis")
    
    # Conditional edge for Risk Analysis -> HITL or Stress Test
    workflow.add_conditional_edges(
        "perform_risk_analysis",
        route_hitl,
        {
            "human_review": "human_review",
            "generate_report": "stress_test"
        }
    )
    
    # Path from human review
    workflow.add_edge("human_review", "stress_test")
    
    # Stress test directly to report
    workflow.add_edge("stress_test", "generate_report")
    workflow.add_edge("generate_report", END)

    # Compile the graph with an interrupt on the 'human_review' node
    app = workflow.compile(checkpointer=memory, interrupt_before=["human_review"])
    return app

credit_copilot_app = build_graph()
