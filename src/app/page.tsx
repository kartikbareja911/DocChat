'use client'

import React, { useState, useEffect } from 'react'
import { validateEnv, createClient } from '@/lib/supabase/client'
import FileUpload from '@/components/FileUpload'
import ChatBox from '@/components/ChatBox'
import { Sparkles, LogOut, Mail, Lock, UserPlus, LogIn, FileText, CheckCircle2, ShieldAlert, Cpu, Search, Trash2, Loader2 } from 'lucide-react'

export default function Home() {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  
  // Auth Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  
  // App State
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ name: string; size: string }>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [deletingDocs, setDeletingDocs] = useState<string[]>([])
  
  // Chat History State
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isConfigured, setIsConfigured] = useState(true)

  useEffect(() => {
    // Validate environment variables
    validateEnv()
    
    // Check if Supabase keys are default placeholders
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || supabaseUrl.includes('your-project-id')) {
      setIsConfigured(prev => false)
    }

    // Get current session
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setUser(session?.user || null)
      } catch (err) {
        console.error('Error fetching session:', err)
      } finally {
        setLoading(false)
      }
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  // Fetch unique documents on mount or when user session changes
  useEffect(() => {
    if (!user) {
      setUploadedDocs(prev => [])
      return
    }

    const fetchDocuments = async () => {
      try {
        const { data, error } = await supabase
          .from('document_chunks')
          .select('document_name')
          .eq('user_id', user.id)

        if (error) throw error

        if (data) {
          const uniqueNames = Array.from(new Set(data.map((item: any) => item.document_name)))
          setUploadedDocs(uniqueNames.map((name) => ({ name, size: 'Indexed' })))
        }
      } catch (err) {
        console.error('Error fetching uploaded documents:', err)
      }
    }

    fetchDocuments()
  }, [user, supabase])

  // Fetch chat sessions when user session changes
  useEffect(() => {
    if (!user) {
      setSessions(prev => [])
      setActiveSessionId(null)
      return
    }

    const fetchSessions = async () => {
      setSessionsLoading(true)
      try {
        const res = await fetch('/api/chat/sessions')
        if (!res.ok) throw new Error('Failed to fetch chat sessions')
        const data = await res.json()
        setSessions(data)
      } catch (err) {
        console.error('Error fetching sessions:', err)
      } finally {
        setSessionsLoading(false)
      }
    }

    fetchSessions()
  }, [user])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setAuthLoading(true)
    setAuthError('')

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        // Sign up
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        
        // Auto sign-in immediately after signing up to bypass verification flow
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          alert('Registration successful! Please log in using your credentials.')
          setAuthMode('login')
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'An error occurred during authentication')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsDemoMode(false)
    setUploadedDocs([])
    setSelectedDoc(null)
    setSessions([])
    setActiveSessionId(null)
  }

  const handleDemoMode = async () => {
    setAuthLoading(true)
    try {
      const demoEmail = 'demo@docchat.ai'
      const demoPassword = 'DemoPassword123!'
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword
      })
      
      if (error) {
        // Attempt signup if login fails
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: demoEmail,
          password: demoPassword
        })
        if (signUpError) throw signUpError
        setUser(signUpData.user)
      } else {
        setUser(data.user)
      }
      setIsDemoMode(true)
    } catch (err) {
      console.warn('Unable to create DB demo session, falling back to mock UI session:', err)
      setUser({ id: 'demo-user-uuid', email: 'demo@docchat.ai' })
      setIsDemoMode(true)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleUploadSuccess = (doc: { name: string; size: string }) => {
    setUploadedDocs((prev) => {
      if (prev.some((d) => d.name === doc.name)) return prev
      return [...prev, doc]
    })
    setSelectedDoc(doc.name)
  }

  const handleDeleteDoc = async (e: React.MouseEvent, docName: string) => {
    e.stopPropagation() 
    if (!user) return

    const confirmDelete = window.confirm(`Are you sure you want to remove "${docName}" from your indexed catalog?`)
    if (!confirmDelete) return

    setDeletingDocs((prev) => [...prev, docName])

    try {
      const res = await fetch(`/api/upload?documentName=${encodeURIComponent(docName)}&userId=${user.id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete')
      }

      setUploadedDocs((prev) => prev.filter((d) => d.name !== docName))
      if (selectedDoc === docName) {
        setSelectedDoc(null)
      }
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'An error occurred during deletion.')
    } finally {
      setDeletingDocs((prev) => prev.filter((name) => name !== docName))
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const confirmDelete = window.confirm('Are you sure you want to delete this chat conversation?')
    if (!confirmDelete) return

    try {
      const res = await fetch(`/api/chat/sessions?id=${sessionId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete conversation thread')

      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
      }
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Could not delete conversation.')
    }
  }

  const handleSessionCreated = (sessionId: string) => {
    setActiveSessionId(sessionId)
    // Pull fresh threads list from database
    const refreshSessions = async () => {
      try {
        const res = await fetch('/api/chat/sessions')
        if (res.ok) {
          const data = await res.json()
          setSessions(data)
        }
      } catch (err) {
        console.error('Error refreshing chat session threads list:', err)
      }
    }
    refreshSessions()
  }

  const filteredDocs = uploadedDocs.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf':
        return (
          <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <FileText className="h-4 w-4" />
          </div>
        )
      case 'docx':
        return (
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <FileText className="h-4 w-4" />
          </div>
        )
      case 'csv':
        return (
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FileText className="h-4 w-4" />
          </div>
        )
      default:
        return (
          <div className="p-2 rounded-xl bg-gray-500/10 border border-gray-500/20 text-gray-400">
            <FileText className="h-4 w-4" />
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0C]">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 rounded-full border-t-2 border-blue-500 animate-spin" />
          <Cpu className="absolute h-6 w-6 text-blue-400 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <main className="relative min-h-screen flex flex-col justify-between overflow-hidden">
      {/* Decorative Vercel/MagicUI Subtle Radial Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 max-w-7xl w-full mx-auto px-6 py-5 flex items-center justify-between border-b border-white/5 bg-[#0B0B0C]/80 backdrop-blur-md">
        <button
          onClick={() => {
            setSelectedDoc(null)
            setActiveSessionId(null)
          }}
          className="flex items-center space-x-2 cursor-pointer focus:outline-none hover:opacity-90 transition-all text-left"
        >
          {/* Unique Logo - Document + Chat Bubble + AI Sparkle */}
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)] p-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" className="h-full w-full text-white">
              <path d="M6 4h14l6 6v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M16 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
              <ellipse cx="16" cy="20" rx="7" ry="5" fill="currentColor" opacity="0.3"/>
              <ellipse cx="16" cy="20" rx="5" ry="3.5" fill="currentColor"/>
              <circle cx="12" cy="20" r="1" fill="#FFFFFF" opacity="0.9"/>
              <circle cx="16" cy="20" r="1" fill="#FFFFFF" opacity="0.9"/>
              <circle cx="20" cy="20" r="1" fill="#FFFFFF" opacity="0.9"/>
              <g fill="#FBBF24" transform="translate(22, 6)">
                <polygon points="1.5,0 1.9,1.5 3.5,1.5 2.2,2.5 2.6,4 1.5,3.2 0.4,4 0.8,2.5 -0.5,1.5 1,1.5" />
              </g>
            </svg>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white flex items-center">
            DocChat
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent ml-1.5">
              AI
            </span>
          </span>
        </button>

        {/* Hover Dropdown User logout on Top Right */}
        {user && (
          <div className="relative group">
            <button className="flex items-center space-x-2.5 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/10 hover:bg-white/[0.05] transition-all cursor-pointer focus:outline-none">
              <div className="h-6 w-6 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs uppercase">
                {user.email ? user.email[0] : 'U'}
              </div>
              <span className="text-xs font-semibold text-gray-300 max-w-[120px] truncate hidden md:inline">
                {user.email}
              </span>
            </button>

            {/* Hover Menu Panel */}
            <div className="absolute right-0 top-full pt-2 w-48 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-50">
              <div className="rounded-xl glass-panel border border-white/5 shadow-2xl p-2 bg-[#131316]">
                <div className="px-3 py-2">
                  <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider font-mono">User Profile</p>
                  <p className="text-xs font-semibold text-gray-300 truncate mt-0.5">{user.email}</p>
                </div>
                <div className="h-[1px] bg-white/5 my-1" />
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-rose-500/10 text-gray-400 hover:text-rose-400 font-semibold transition-all cursor-pointer flex items-center gap-2"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <div className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col justify-start">
        {!user ? (
          /* Auth Container */
          <div className="max-w-md w-full mx-auto space-y-6">
            <div className="text-center space-y-2">
              {/* MagicUI Hero Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] border border-white/5 text-[10px] text-gray-400 font-mono mb-2 uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                Introducing document chat
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Meet your <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Document Agent</span>
              </h1>
              <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
                An AI assistant designed to streamline your research workflows. Chat with PDFs, DOCX, and text logs instantly.
              </p>
            </div>

            <div className="rounded-2xl glass-panel p-8 border border-white/10 shadow-2xl relative">
              {/* Configuration Alert */}
              {!isConfigured && (
                <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3 text-left">
                  <ShieldAlert className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-300 font-sans">Supabase Keys Required</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
                      Placeholders detected in your `.env.local`. Register/Login requires your own Supabase instance.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider font-sans">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-4.5 w-4.5 text-gray-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-3 rounded-full glass-input text-sm text-white placeholder-gray-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider font-sans">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-4.5 w-4.5 text-gray-500" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-3 rounded-full glass-input text-sm text-white placeholder-gray-600 focus:outline-none"
                    />
                  </div>
                </div>

                {authError && (
                  <p className="text-xs text-rose-400 font-medium text-center font-sans">{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading || !isConfigured}
                  className="w-full py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/30 text-white font-semibold text-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] disabled:shadow-none hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {authLoading ? (
                    <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : authMode === 'login' ? (
                    <>
                      <LogIn className="h-4 w-4" />
                      <span>Log In</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      <span>Register</span>
                    </>
                  )}
                </button>
              </form>

              {/* Toggle Login/Register */}
              <div className="mt-6 text-center">
                <button
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-xs text-blue-500 hover:text-blue-400 transition-colors focus:outline-none cursor-pointer"
                >
                  {authMode === 'login'
                    ? "Don't have an account? Sign up"
                    : 'Already have an account? Sign in'}
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#131316] px-3 text-gray-500 font-mono text-[10px]">Or try out</span>
                </div>
              </div>

              {/* Demo Mode Button */}
              <button
                onClick={handleDemoMode}
                disabled={authLoading}
                className="w-full py-3 rounded-full bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] text-gray-200 hover:text-white font-medium text-sm transition-all focus:outline-none flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {authLoading ? (
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Try Demo Mode</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Dashboard Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Side: Actions, Docs List, and Chat History */}
            <div className="lg:col-span-4 space-y-6">
              {/* User Segment */}
              <div className="rounded-2xl glass-panel p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="h-4.5 w-4.5 text-blue-500" />
                    Document Desk
                  </h2>
                  {isDemoMode && (
                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                      Demo
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 leading-relaxed font-sans">
                  Upload your files to create vector embeddings and save them for instant semantic query reference.
                </p>
                <FileUpload userId={user.id} onUploadSuccess={handleUploadSuccess} />
              </div>

              {/* Indexed Files with Search */}
              <div className="rounded-2xl glass-panel p-6 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-sm font-bold text-gray-200">Indexed Files</h3>
                  <span className="text-xs font-mono text-gray-500">({uploadedDocs.length})</span>
                </div>

                {/* Document Search Bar */}
                {uploadedDocs.length > 0 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 rounded-full glass-input text-xs text-white placeholder-gray-600 focus:outline-none"
                    />
                  </div>
                )}

                {filteredDocs.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-2">
                    {uploadedDocs.length === 0 ? 'No documents indexed yet.' : 'No matching files found.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 overscroll-contain">
                    {filteredDocs.map((doc, idx) => {
                      const isSelected = selectedDoc === doc.name
                      const isDeleting = deletingDocs.includes(doc.name)
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (isDeleting) return
                            setSelectedDoc(isSelected ? null : doc.name)
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl transition-all group cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-blue-600/10 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                              : 'bg-white/[0.01] border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                          } ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={isSelected ? "Click to clear focus" : `Click to query only ${doc.name}`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            {getFileIcon(doc.name)}
                            <div className="flex flex-col min-w-0">
                              <span className={`text-xs font-semibold truncate max-w-[125px] md:max-w-[145px] lg:max-w-[110px] ${
                                isSelected ? 'text-white' : 'text-gray-300'
                              }`}>
                                {doc.name}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">{doc.size}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className={`h-3.5 w-3.5 transition-colors ${
                                  isSelected ? 'text-blue-500' : 'text-gray-600 group-hover:text-gray-400'
                                }`} />
                                <button
                                  onClick={(e) => handleDeleteDoc(e, doc.name)}
                                  className="p-1 rounded hover:bg-rose-500/15 text-gray-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer focus:outline-none"
                                  title="Delete document"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Chat History Shelf */}
              <div className="rounded-2xl glass-panel p-6 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h3 className="text-sm font-bold text-gray-200">Chat History</h3>
                  <button
                    onClick={() => setActiveSessionId(null)}
                    className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer focus:outline-none"
                  >
                    New Chat
                  </button>
                </div>

                {sessionsLoading ? (
                  <div className="py-4 flex items-center justify-center space-x-2">
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                    <span className="text-xs text-gray-500 font-mono">Loading history...</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-2">No past conversations.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1 overscroll-contain">
                    {sessions.map((sess) => {
                      const isActive = activeSessionId === sess.id
                      return (
                        <div
                          key={sess.id}
                          onClick={() => setActiveSessionId(sess.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl transition-all group cursor-pointer ${
                            isActive
                              ? 'border-blue-500 bg-blue-600/10 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                              : 'bg-white/[0.01] border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`}
                            >
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className={`text-xs truncate max-w-[125px] md:max-w-[145px] lg:max-w-[110px] ${
                              isActive ? 'text-white font-semibold' : 'text-gray-300'
                            }`}>
                              {sess.title}
                            </span>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSession(e, sess.id)}
                            className="p-1 rounded hover:bg-rose-500/15 text-gray-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer focus:outline-none"
                            title="Delete conversation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Chat Panel */}
            <div className="lg:col-span-8">
              <ChatBox 
                userId={user.id} 
                uploadedDocuments={uploadedDocs.map((d) => d.name)} 
                selectedDocument={selectedDoc} 
                activeSessionId={activeSessionId}
                onSessionCreated={handleSessionCreated}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-6 border-t border-white/5 bg-white/[0.002]">
        <div className="max-w-7xl mx-auto px-6 text-center text-xs text-gray-500 font-mono">
          DocChat AI &copy; 2026. Powered by Google Gen AI, Voyage, and Supabase.
        </div>
      </footer>
    </main>
  )
}
