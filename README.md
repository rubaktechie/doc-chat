#Requirement
Title : Chat With Your Docs 
Desc : Build a system that answers questions about content from a document collection
(PDFs, text files, or any format you choose). This is the same classic RAG use-case
you might be familiar with.

#Assumptions : 
-> You have a collection of documents that you want to query. 
-> Document collection can be in any format (PDFs, text files, etc.) and can be of any size.
-> Need to build a Portal where users can upload documents and ask questions about them.
-> Basic Authentication is required for users to access the portal.
-> The system should be able to handle multiple users and their respective document collections.


#Tech Stack :
-> Frontend: React.js
-> Backend: Node.js with Express.js
-> SQlite for user authentication and document metadata storage
-> OpenAI API for question answering and document embeddings
-> Python for document processing (e.g., extracting text from PDFs) use markitdown from microsoft for pdf to text conversion
-> Faiss for vector search and retrieval of relevant document sections

#Guardrails
-> Ensure that the system is secure and user data is protected.
-> Only document related questions should be answered, and the system should not provide any unrelated information.
-> If outside the scope of the document collection, the system should respond with a message indicating that it cannot answer the question.


#Future Enhancements:
-> Support for additional document formats (e.g., Word, Excel, etc.)
-> Implement advanced search features (e.g., keyword search, filtering by document type)
-> Migrate to a more robust database system (e.g., PostgreSQL, MongoDB) for better scalability and performance
-> Persistent chats instead of ephemeral chats, allowing users to save and revisit previous conversations
-> Instead of HTTP Polling for chat, implement WebSockets for real-time communication between the frontend and backend
-> Add support for other LLM providers (e.g., Anthropic, Gemini,...) to give users more options for question answering and document embeddings
