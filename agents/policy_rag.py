import os
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import MarkdownTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
POLICY_FILE = os.path.join(DATA_DIR, "bank_policy.md")
FAISS_INDEX_PATH = os.path.join(DATA_DIR, "faiss_index")

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

def get_retriever():
    if os.path.exists(FAISS_INDEX_PATH):
        vectorstore = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
    else:
        loader = TextLoader(POLICY_FILE)
        docs = loader.load()
        splitter = MarkdownTextSplitter(chunk_size=500, chunk_overlap=50)
        split_docs = splitter.split_documents(docs)
        vectorstore = FAISS.from_documents(split_docs, embeddings)
        vectorstore.save_local(FAISS_INDEX_PATH)
    
    return vectorstore.as_retriever(search_kwargs={"k": 2})

def query_policy(query: str) -> str:
    retriever = get_retriever()
    docs = retriever.invoke(query)
    # Combine the top retrieved policy chunks
    return "\n\n".join([doc.page_content for doc in docs])
