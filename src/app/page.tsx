// app/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUp, Send, Plus, MessageSquare, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react';

// Define types
type Source = { content: string; page: number | string; };
type Message = { sender: 'user' | 'ai'; message: string; sources?: Source[]; };
type Conversation = { id: number; created_at: string };
type Notification = { message: string; type: 'success' | 'error'; } | null;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [notification, setNotification] = useState<Notification>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  // --- FIX: Wrapped fetchConversations in useCallback ---
  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/conversations');
      const data = await response.json();
      setConversations(data);
    } catch (error) { showNotification("Error fetching conversations.", 'error'); }
  }, []);

  // --- FIX: Added fetchConversations to the dependency array ---
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);
  
  const handleNewChat = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/new_chat', { method: 'POST' });
      const data = await response.json();
      setActiveConversationId(data.conversation_id);
      setChat([]);
      setFile(null);
      setFileName('');
      await fetchConversations();
    } catch (error) { showNotification("Error starting new chat.", 'error'); }
  };

  const loadConversation = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:5000/api/history/${id}`);
      const data = await response.json();
      setChat(data);
      setActiveConversationId(id);
      setFile(null);
      setFileName('');
    } catch (error) { showNotification("Error loading conversation.", 'error'); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setFileName(e.target.files[0].name);
    }
  };

  const handleUpload = async () => {
    if (!file || !activeConversationId) {
      showNotification("Please select a file and start a new chat first.", 'error');
      return;
    }
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:5000/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) {
        showNotification(data.message || "File processed successfully!", 'success');
      } else {
        throw new Error(data.error || "Failed to upload file.");
      }
    } catch (error) {
      showNotification(String(error), 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!question || !activeConversationId) return;
    
    const userMessage: Message = { sender: 'user', message: question };
    setChat(prevChat => [...prevChat, userMessage]);
    const currentQuestion = question;
    setQuestion('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: currentQuestion, conversation_id: activeConversationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get answer');
      const aiMessage: Message = { sender: 'ai', message: data.answer, sources: data.sources };
      setChat(prevChat => [...prevChat, aiMessage]);
    } catch (error) {
      showNotification(String(error), 'error');
      setChat(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const NotificationComponent = () => {
    if (!notification) return null;
    const isError = notification.type === 'error';
    return (
      <div className={`p-3 rounded-md mb-4 flex items-center text-sm ${
        isError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
      }`}>
        {isError ? <AlertCircle className="mr-2 h-5 w-5" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
        {notification.message}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-screen bg-white text-black">
      <aside className="w-72 border-r border-gray-200 p-4 flex flex-col">
        <h1 className="text-xl font-semibold mb-4">DocuChat</h1>
        <Button onClick={handleNewChat} className="w-full mb-4">
          <Plus className="mr-2 h-4 w-4" /> New Chat
        </Button>
        <div className="flex-grow overflow-y-auto">
          {conversations.map((conv) => (
            <Button
              key={conv.id}
              variant={activeConversationId === conv.id ? "secondary" : "ghost"}
              onClick={() => loadConversation(conv.id)}
              className="w-full justify-start mb-1"
            >
              <MessageSquare className="mr-2 h-4 w-4" /> Chat #{conv.id}
            </Button>
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        {!activeConversationId ? (
          <div className="flex-grow flex items-center justify-center text-gray-400">
            Start a new chat from the sidebar
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <header className="p-4 border-b border-gray-200">
              <NotificationComponent />
              <div className="flex items-center gap-4">
                <Input id="file-upload" type="file" onChange={handleFileChange} className="max-w-xs" />
                <Button onClick={handleUpload} disabled={!file || isUploading} variant="outline">
                  <FileUp className="mr-2 h-4 w-4" />
                  {isUploading ? 'Uploading...' : 'Upload Document'}
                </Button>
                {fileName && <p className="text-sm text-gray-500">Current: {fileName}</p>}
              </div>
            </header>
            <div className="flex-grow p-6 overflow-y-auto">
              <div className="max-w-3xl mx-auto w-full">
                {chat.map((msg, index) => (
                  <div key={index} className={`flex flex-col my-4 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`flex items-start gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`p-3 rounded-lg max-w-lg ${ msg.sender === 'user' ? 'bg-black text-white' : 'bg-gray-100' }`}>
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    </div>
                    {msg.sender === 'ai' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 w-full max-w-lg">
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-gray-500 flex items-center">
                            <BookOpen className="h-4 w-4 mr-1"/> Sources ({msg.sources.length})
                          </summary>
                          <div className="mt-2 space-y-2">
                            {msg.sources.map((source, idx) => (
                              <Card key={idx} className="bg-gray-50 p-2 text-gray-600">
                                <p className="truncate">
                                  {/* --- FIX: Replaced quotes with HTML entities --- */}
                                  <b className="text-black">Page {source.page}:</b> &quot;{source.content}&quot;
                                </p>
                              </Card>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
            <footer className="p-4 border-t border-gray-200">
              <Card className="max-w-3xl mx-auto">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2">
                    <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isLoading && (e.preventDefault(), handleAskQuestion())} placeholder="Ask a question..." className="flex-grow resize-none border-0 shadow-none focus-visible:ring-0" disabled={isLoading} />
                    <Button onClick={handleAskQuestion} disabled={isLoading || !question} size="icon">
                      <Send className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}