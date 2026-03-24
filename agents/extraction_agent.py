from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from models import UnderwritingState, ApplicantSchema

llm = ChatGroq(model_name="llama-3.1-8b-instant", temperature=0)

extraction_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are an expert financial document extractor. Extract the required fields from the provided applicant data and format it perfectly according to the schema.

CRITICAL INSTRUCTION: When extracting financial data, perform all necessary mathematical conversions (such as converting monthly income to annual income) internally. You must provide only the final numeric result as a single integer or float in the function call. Do NOT include mathematical expressions like '*' or '+' in the tool arguments."""),
    ("human", "{applicant_data_raw}")
])

# Use LangChain's structured output
extraction_chain = extraction_prompt | llm.with_structured_output(schema=ApplicantSchema)

def extract_applicant_data(state: UnderwritingState):
    """LangGraph node to extract structured data from raw string."""
    raw_data = state["applicant_data_raw"]
    extracted = extraction_chain.invoke({"applicant_data_raw": raw_data})
    
    # Convert Pydantic model to dict to store in state
    return {"extracted_data": extracted.model_dump()}
