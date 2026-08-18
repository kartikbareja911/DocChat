'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, FileText, ChevronDown, ChevronUp, Sparkles, Loader2, Paperclip, Mic, MicOff } from 'lucide-react'

interface Source {
  id: number
  content: string
  document_name: string
  page_number?: number
  similarity: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

interface ChatBoxProps {
  userId: string | null
  uploadedDocuments: string[]
  selectedDocument?: string | null
  activeSessionId: string | null
  onSessionCreated?: (sessionId: string) => void
  onUploadSuccess?: (doc: { name: string; size: string }) => void
}

export default function ChatBox({ 
  userId, 
  uploadedDocuments, 
  selectedDocument, 
  activeSessionId, 
  onSessionCreated,
  onUploadSuccess
}: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [openSourcesIdx, setOpenSourcesIdx] = useState<string | null>(null)
  
  // Voice Input States
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  // File Upload States
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, uploadingFileName])

  // Load chat session history or reset to welcome state
  useEffect(() => {
    if (!activeSessionId) {
      if (selectedDocument) {
        setMessages([
          {
            role: 'assistant',
            content: `I've scoped my queries strictly to **${selectedDocument}**. Ask me any question, and I'll consult only this document's contents!`,
          },
        ])
      } else if (uploadedDocuments.length > 0) {
        setMessages([
          {
            role: 'assistant',
            content: `I've loaded your index (latest: **${uploadedDocuments[uploadedDocuments.length - 1]}**). Ask a question to search all files, or click any file on the shelf to focus queries to it.`,
          },
        ])
      } else {
        setMessages([
          {
            role: 'assistant',
            content: "Welcome to DocChat AI! Please upload a PDF, DOCX, TXT, MD, or CSV file on the left, and we can start chatting.",
          },
        ])
      }
      return
    }

    const fetchHistory = async () => {
      setHistoryLoading(true)
      try {
        const res = await fetch(`/api/chat/messages?sessionId=${activeSessionId}`)
        if (!res.ok) throw new Error('Failed to load chat history')
        const data = await res.json()
        setMessages(data.map((m: any) => ({
          role: m.role,
          content: m.content,
          sources: m.sources,
        })))
      } catch (err) {
        console.error('Error fetching chat history messages:', err)
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [activeSessionId, selectedDocument, uploadedDocuments])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          userIdInput: userId,
          documentName: selectedDocument,
          sessionId: activeSessionId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate answer')
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          sources: data.sources,
        },
      ])

      if (data.sessionId && data.sessionId !== activeSessionId && onSessionCreated) {
        onSessionCreated(data.sessionId)
      }
    } catch (err: any) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error:** ${err.message || 'I encountered an error trying to connect to the model.'}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  // Voice Input Handlers using Web Speech API
  const startListening = () => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
    }

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  // File Upload Handlers (Paperclip button)
  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const allowedExtensions = ['pdf', 'docx', 'txt', 'md', 'csv']
      const extension = file.name.split('.').pop()?.toLowerCase() || ''

      if (!allowedExtensions.includes(extension)) {
        alert('Invalid file format. Please upload a PDF, DOCX, TXT, MD, or CSV file.')
        return
      }

      setUploadingFileName(file.name)

      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
      }
      
      const sizeStr = formatFileSize(file.size)

      const formData = new FormData()
      formData.append('file', file)
      if (userId) {
        formData.append('userId', userId)
      }

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Upload failed')
        }

        // Notify parent catalog to refresh files list
        if (onUploadSuccess) {
          onUploadSuccess({ name: file.name, size: sizeStr })
        }

        // Add a success confirmation in the conversation log
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `✅ **Successfully indexed:** I've uploaded and generated vector embeddings for **${file.name}**. I've scoped my queries strictly to this file!`,
          },
        ])
      } catch (err: any) {
        console.error('File Upload error inside ChatBox:', err)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `⚠️ **Upload failed:** ${err.message || 'An error occurred during file upload.'}`,
          },
        ])
      } finally {
        setUploadingFileName(null)
        if (fileInputRef.current) fileInputRef.current.value = '' // Clear input
      }
    }
  }

  const toggleSource = (key: string) => {
    if (openSourcesIdx === key) {
      setOpenSourcesIdx(null)
    } else {
      setOpenSourcesIdx(key)
    }
  }

  return (
    <div className="flex flex-col h-[600px] rounded-2xl glass-panel border border-white/5 overflow-hidden shadow-2xl">
      {/* Hidden File Input for Paperclip */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.docx,.txt,.md,.csv"
        className="hidden"
      />

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-sm tracking-wide text-gray-200 uppercase flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-blue-500" />
            {selectedDocument ? 'Document Chat (Focused)' : 'AI Query Panel'}
          </span>
        </div>
        <span className="text-xs text-gray-400 font-mono">
          {selectedDocument ? `Scope: ${selectedDocument}` : `${uploadedDocuments.length} document(s) loaded`}
        </span>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {historyLoading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="text-xs text-gray-500 font-mono">Loading history...</span>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-4 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                {/* Avatar */}
                <div
                  className={`p-2.5 rounded-full border flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-blue-600/20 border-blue-500/30 text-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.1)]'
                      : 'bg-white/[0.03] border-white/10 text-gray-400'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-blue-500" />}
                </div>

                {/* Bubble */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div
                    className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600/90 text-white shadow-lg rounded-tr-none'
                        : 'bg-white/[0.02] border border-white/[0.04] text-gray-100 rounded-tl-none shadow-md'
                    }`}
                  >
                    {/* Basic Markdown-like Bold support */}
                    {msg.content.split('\n').map((para, i) => (
                      <p key={i} className={i > 0 ? 'mt-2' : ''}>
                        {para.split('**').map((text, j) => {
                          if (j % 2 === 1) {
                            return <strong key={j} className="font-bold text-white">{text}</strong>
                          }
                          return text
                        })}
                      </p>
                    ))}
                  </div>

                  {/* Numbered Citation Cards */}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block mb-1">
                        Citations & Sources
                      </span>
                      {msg.sources.map((src, sIdx) => {
                        const isExpanded = openSourcesIdx === `${idx}-${sIdx}`
                        return (
                          <div
                            key={src.id}
                            className="rounded-full bg-white/[0.01] border border-white/[0.05] overflow-hidden transition-all duration-200 hover:border-white/10"
                          >
                            <button
                              onClick={() => toggleSource(`${idx}-${sIdx}`)}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-medium text-gray-300 hover:bg-white/[0.01] transition-colors focus:outline-none cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <span className="h-5 w-5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 font-bold flex items-center justify-center text-[10px] shadow-sm">
                                  {sIdx + 1}
                                </span>
                                <span className="text-gray-300 flex items-center gap-1.5 truncate max-w-[280px]">
                                  <FileText className="h-3 w-3 text-blue-500" />
                                  {src.document_name} {src.page_number ? `(pg. ${src.page_number})` : ''}
                                </span>
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-500">
                                  {Math.round(src.similarity * 100)}% Match
                                </span>
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-500" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
                              </span>
                            </button>
                            
                            {isExpanded && (
                              <div className="px-5 py-3.5 bg-white/[0.005] border-t border-white/[0.03] rounded-b-2xl">
                                <p className="text-[11px] leading-relaxed text-gray-400 italic font-mono">
                                  &quot;{src.content}&quot;
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-4 max-w-[85%]">
                <div className="p-2.5 rounded-full border bg-white/[0.03] border-white/10 text-gray-400">
                  <Bot className="h-4 w-4 text-blue-500 animate-pulse" />
                </div>
                <div className="flex items-center space-x-2 bg-white/[0.03] border border-white/[0.05] py-3.5 px-5 rounded-2xl rounded-tl-none shadow-md">
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  <span className="text-xs text-gray-400">Thinking...</span>
                </div>
              </div>
            )}

            {/* In-Chat File Indexing Status Loader */}
            {uploadingFileName && (
              <div className="flex items-start gap-4 max-w-[85%]">
                <div className="p-2.5 rounded-full border bg-white/[0.03] border-white/10 text-gray-400">
                  <FileText className="h-4 w-4 text-blue-500 animate-pulse" />
                </div>
                <div className="flex items-center space-x-2 bg-white/[0.03] border border-white/[0.05] py-3.5 px-5 rounded-2xl rounded-tl-none shadow-md">
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  <span className="text-xs text-gray-400">Indexing {uploadingFileName}...</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="p-4 bg-white/[0.01] border-t border-white/5 flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            selectedDocument 
              ? `Ask about ${selectedDocument}...` 
              : uploadedDocuments.length > 0 
                ? "Ask DocChat AI (searching all documents)..." 
                : "Upload a file to begin chatting..."
          }
          className="flex-1 px-5 py-3.5 rounded-full glass-input text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-0 disabled:opacity-50"
          disabled={loading || !!uploadingFileName || uploadedDocuments.length === 0}
        />
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            type="submit"
            disabled={!input.trim() || loading || !!uploadingFileName || uploadedDocuments.length === 0}
            className="p-3.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-[0_0_15px_rgba(37,99,235,0.25)] disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center focus:outline-none cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={triggerFileSelect}
            disabled={loading || !!uploadingFileName}
            className="p-3.5 rounded-full bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-all flex items-center justify-center focus:outline-none cursor-pointer disabled:opacity-40"
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleListening}
            disabled={loading || !!uploadingFileName}
            className={`p-3.5 rounded-full border transition-all flex items-center justify-center focus:outline-none cursor-pointer disabled:opacity-40 ${
              isListening 
                ? 'bg-blue-600 border-blue-500 text-white animate-pulse shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:bg-blue-500' 
                : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
            }`}
            title={isListening ? "Stop listening" : "Voice input (Speech-to-Text)"}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  )
}
