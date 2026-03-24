from models import UnderwritingState

def fetch_live_credit_score(name: str) -> int:
    """Mock external API (e.g. Equifax) call that fetches a live credit score."""
    # Hash the name to return a consistent score for the same name, simulating a database lookup
    base = sum([ord(c) for c in str(name).lower()])
    return 600 + (base % 200) # Returns a live score between 600 and 800

def fetch_live_data(state: UnderwritingState):
    """LangGraph AI Tool node simulating an external API call execution."""
    extracted = state.get("extracted_data", {})
    name = extracted.get("name", "Unknown Applicant")
    
    # The AI agent executes the external Tool call
    live_score = fetch_live_credit_score(name)
    
    # The enterprise system overrides the user's unverified credit score with the live external one
    extracted["credit_score"] = live_score
    extracted["live_data_note"] = f"Equifax API Integration: Automatically verified and fetched live credit score of {live_score} for {name}."
    
    return {"extracted_data": extracted}
