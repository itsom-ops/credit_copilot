import os
import uuid
import fitz # PyMuPDF
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()
from orchestrator import credit_copilot_app
from models import UnderwritingState

app = FastAPI(title="Credit Underwriting AI Copilot", description="Multi-Agent System for Loan Processing")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app_metadata = {}  # In-memory storage to track threads

class ApplicationRequest(BaseModel):
    raw_text: str

class ResumeRequest(BaseModel):
    thread_id: str
    decision: str

class ChatRequest(BaseModel):
    query: str

def process_workflow(initial_state: dict):
    if not os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY") == "your_groq_api_key_here":
        raise HTTPException(status_code=500, detail="GROQ_API_KEY environment variable not set in .env")
        
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    
    # Track the new application
    app_metadata[thread_id] = {"status": "processing"}
    
    # Run the Workflow
    final_state = credit_copilot_app.invoke(initial_state, config=config)
    
    # Check if the graph interrupted/paused
    state_snap = credit_copilot_app.get_state(config)
    if len(state_snap.next) > 0:
        next_node = state_snap.next[0]
        
        if next_node == "Policy":
            # LangGraph paused after Extraction for Pre-Flight Review
            app_metadata[thread_id]["status"] = "pending_extraction"
            return {
                "status": "extraction_review", 
                "thread_id": thread_id, 
                "extracted_data": final_state.get("extracted_data")
            }
            
        elif next_node == "human_review":
            # LangGraph paused after Risk Critic for Final Override
            app_metadata[thread_id]["status"] = "pending_review"
            return {"status": "manual_review", "thread_id": thread_id, "analysis": final_state.get("risk_analysis")}
        
    app_metadata[thread_id]["status"] = "completed"
    return {
        "status": "completed",
        "thread_id": thread_id,
        "recommendation": final_state.get("recommendation", "Unknown"),
        "report": final_state.get("final_report", "Report generation failed."),
        "policy_context": final_state.get("policy_context", "No context available"),
        "malicious_intent_score": final_state.get("malicious_intent_score", 0.0)
    }

@app.post("/analyze")
async def analyze_application(request: ApplicationRequest):
    try:
        return process_workflow({"applicant_data_raw": request.raw_text})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze_pdf")
async def analyze_pdf(file: UploadFile = File(...)):
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        extracted_text = "".join(page.get_text() for page in doc)
        return process_workflow({"applicant_data_raw": extracted_text})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/pending")
def get_pending():
    pending_list = []
    history_list = []
    for tid, meta in app_metadata.items():
        if meta["status"] == "pending_review":
            st = credit_copilot_app.get_state({"configurable": {"thread_id": tid}})
            pending_list.append({
                "thread_id": tid,
                "data": st.values.get("extracted_data"),
                "analysis": st.values.get("risk_analysis"),
                "recommendation_reason": st.values.get("recommendation")
            })
        elif meta["status"] == "completed" and "human_decision" in meta:
            st = credit_copilot_app.get_state({"configurable": {"thread_id": tid}})
            history_list.append({
                "thread_id": tid,
                "data": st.values.get("extracted_data", {}),
                "decision": meta["human_decision"],
                "timestamp": meta["timestamp"]
            })
    return {"pending": pending_list, "history": history_list}

@app.post("/resume")
def resume_workflow(req: ResumeRequest):
    from datetime import datetime
    config = {"configurable": {"thread_id": req.thread_id}}
    
    # Override state with human decision
    credit_copilot_app.update_state(config, {"recommendation": req.decision}, as_node="human_review")
    
    # Continue graph execution
    final_state = credit_copilot_app.invoke(None, config=config)
    
    app_metadata[req.thread_id].update({
        "status": "completed",
        "human_decision": req.decision,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    return {
        "status": "completed",
        "recommendation": final_state.get("recommendation"),
        "report": final_state.get("final_report")
    }

class ResumeExtractionRequest(BaseModel):
    thread_id: str
    corrected_data: dict

@app.post("/resume_extraction")
def resume_extraction(req: ResumeExtractionRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    
    # Update state with the user's manually corrected JSON
    credit_copilot_app.update_state(config, {"extracted_data": req.corrected_data}, as_node="Extract")
    
    # Continue graph execution
    final_state = credit_copilot_app.invoke(None, config=config)
    
    app_metadata[req.thread_id]["status"] = "completed"
    
    return {
        "status": "completed",
        "thread_id": req.thread_id,
        "recommendation": final_state.get("recommendation"),
        "report": final_state.get("final_report"),
        "policy_context": final_state.get("policy_context"),
        "malicious_intent_score": final_state.get("malicious_intent_score", 0.0)
    }

@app.get("/policy.md")
def get_policy():
    from fastapi.responses import FileResponse
    return FileResponse("data/bank_policy.md")

@app.post("/chat_policy")
def chat_policy(request: ChatRequest):
    try:
        from langchain_groq import ChatGroq
        from langchain_core.prompts import ChatPromptTemplate
        from agents.policy_rag import query_policy
        
        context = query_policy(request.query)
        llm = ChatGroq(model_name="llama-3.3-70b-versatile", temperature=0)
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are the EY Bank Policy Assistant. Use the following bank policy context to answer the user's question. 
If the exact answer is not explicitly written in the context, you should STILL try to provide the closest possible answer by using your general financial expertise as a credit underwriter. Clearly state that you are sharing general industry standards rather than a strict internal bank rule. 

CRITICAL REQUIREMENT: Whenever you cite a specific policy section in your answer, you MUST format it specifically as a clickable markdown hyperlink pointing to the raw source document!
Example format: According to [[Section 4.1]](/policy.md), the max LTV...

Context: {context}"""),
            ("human", "{question}")
        ])
        chain = prompt | llm
        response = chain.invoke({"context": context, "question": request.query})
        
        return {"response": response.content, "context": context}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class InterrogateRequest(BaseModel):
    thread_id: str
    query: str

@app.post("/interrogate")
def interrogate_agent(req: InterrogateRequest):
    if req.thread_id not in app_metadata:
        raise HTTPException(status_code=404, detail="Thread not found")
        
    config = {"configurable": {"thread_id": req.thread_id}}
    state_snap = credit_copilot_app.get_state(config)
    
    if not state_snap or not state_snap.values:
        raise HTTPException(status_code=400, detail="State is empty")
        
    extracted_data = state_snap.values.get("extracted_data")
    policy_context = state_snap.values.get("policy_context")
    risk_analysis = state_snap.values.get("risk_analysis")
    
    from langchain_groq import ChatGroq
    from langchain_core.prompts import ChatPromptTemplate
    llm = ChatGroq(model_name="llama-3.3-70b-versatile", temperature=0)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the Lead EY Underwriter attached to this application thread. 
Using the exact internal state memory below, concisely answer the user's specific cross-examination about why a decision was reached. Be analytical and authoritative.
        
[THREAD STATE MEMORY]
Metrics Extracted: {data}
Policy Used: {policy}
Graph Analysis Trace: {risk}"""),
        ("human", "{question}")
    ])
    
    res = (prompt | llm).invoke({
        "data": extracted_data,
        "policy": policy_context,
        "risk": risk_analysis,
        "question": req.query
    })
    return {"reply": res.content}

if not os.path.exists("frontend"):
    os.makedirs("frontend")

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
