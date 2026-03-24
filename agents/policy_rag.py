import os
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import MarkdownTextSplitter
from langchain_community.vectorstores import FAISS

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
POLICY_FILE = os.path.join(DATA_DIR, "bank_policy.md")
FAISS_INDEX_PATH = os.path.join(DATA_DIR, "faiss_index_fast")

_embeddings = None

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
        _embeddings = FastEmbedEmbeddings()
    return _embeddings

def get_retriever():
    emb = get_embeddings()
    if os.path.exists(FAISS_INDEX_PATH):
        vectorstore = FAISS.load_local(FAISS_INDEX_PATH, emb, allow_dangerous_deserialization=True)
    else:
        loader = TextLoader(POLICY_FILE)
        docs = loader.load()
        splitter = MarkdownTextSplitter(chunk_size=500, chunk_overlap=50)
        split_docs = splitter.split_documents(docs)
        vectorstore = FAISS.from_documents(split_docs, emb)
        vectorstore.save_local(FAISS_INDEX_PATH)
    
    return vectorstore.as_retriever(search_kwargs={"k": 2})

def query_policy(query: str) -> str:
    retriever = get_retriever()
    docs = retriever.invoke(query)
    # Combine the top retrieved policy chunks
    return "\n\n".join([doc.page_content for doc in docs])
