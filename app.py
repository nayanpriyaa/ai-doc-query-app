# app.py

import os
import sqlite3 # Import the sqlite3 library
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import nest_asyncio

nest_asyncio.apply()

from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.chains import ConversationalRetrievalChain

load_dotenv()
app = Flask(__name__)
CORS(app)

vector_store = None
chat_history = [] # Use a simple list to hold the current conversation's history

# --- NEW: Database Setup ---
def init_db():
    conn = sqlite3.connect('chat_history.db')
    cursor = conn.cursor()
    # Create a table for conversations if it doesn't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Create a table for messages if it doesn't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER,
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations (id)
        )
    ''')
    conn.commit()
    conn.close()

# --- NEW: Endpoint to get a list of all conversations ---
@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations ORDER BY created_at DESC")
    conversations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(conversations)

# --- NEW: Endpoint to get history for a specific conversation ---
@app.route('/api/history/<int:conversation_id>', methods=['GET'])
def get_history(conversation_id):
    conn = sqlite3.connect('chat_history.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT sender, message FROM messages WHERE conversation_id = ?", (conversation_id,))
    messages = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(messages)
    
# --- NEW: Endpoint to start a new chat ---
@app.route('/api/new_chat', methods=['POST'])
def new_chat():
    global chat_history
    chat_history = [] # Clear the in-memory chat history
    
    conn = sqlite3.connect('chat_history.db')
    cursor = conn.cursor()
    cursor.execute("INSERT INTO conversations DEFAULT VALUES")
    conversation_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({"message": "New chat started", "conversation_id": conversation_id})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    # ... (Your upload_file function remains the same) ...
    global vector_store
    
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file:
        filepath = os.path.join("uploads", file.filename)
        file.save(filepath)
        
        try:
            loader = PyPDFLoader(filepath)
            documents = loader.load()
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
            docs = text_splitter.split_documents(documents)
            embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
            vector_store = Chroma.from_documents(docs, embeddings)
            return jsonify({"message": f"File '{file.filename}' processed and ready for questions."}), 200
        except Exception as e:
            print(f"AN ERROR OCCURRED: {e}")
            return jsonify({"error": f"Error processing file: {str(e)}"}), 500

@app.route('/api/query', methods=['POST'])
def handle_query():
    # ... (Your handle_query function is modified to save messages) ...
    global vector_store, chat_history
    
    if vector_store is None:
        return jsonify({"error": "Document not uploaded or processed yet."}), 400

    data = request.get_json()
    question = data.get('question')
    conversation_id = data.get('conversation_id') # Get conversation_id from frontend

    if not question or not conversation_id:
        return jsonify({"error": "Missing question or conversation_id"}), 400

    try:
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.3)
        retriever = vector_store.as_retriever()
        
        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=retriever
        )
        
        result = qa_chain({"question": question, "chat_history": chat_history})
        answer = result['answer']
        
        # Add the new question and answer to our in-memory history
        chat_history.append((question, answer))
        
        # --- NEW: Save question and answer to the database ---
        conn = sqlite3.connect('chat_history.db')
        cursor = conn.cursor()
        cursor.execute("INSERT INTO messages (conversation_id, sender, message) VALUES (?, ?, ?)",
                       (conversation_id, 'user', question))
        cursor.execute("INSERT INTO messages (conversation_id, sender, message) VALUES (?, ?, ?)",
                       (conversation_id, 'ai', answer))
        conn.commit()
        conn.close()
        
        return jsonify({"answer": answer})

    except Exception as e:
        print(f"AN ERROR OCCURRED: {e}")
        return jsonify({"error": f"Error getting answer: {str(e)}"}), 500

if __name__ == '__main__':
    init_db()
    if not os.path.exists('uploads'):
        os.makedirs('uploads')
    # Use port provided by Render, default to 10000 for local testing
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)