'use client'

import React, { useState, useRef } from 'react'
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface FileUploadProps {
  userId: string | null
  onUploadSuccess: (doc: { name: string; size: string }) => void
}

export default function FileUpload({ userId, onUploadSuccess }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'embedding' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const uploadFile = async (file: File) => {
    if (!file) return

    const allowedExtensions = ['pdf', 'docx', 'txt', 'md', 'csv']
    const extension = file.name.split('.').pop()?.toLowerCase() || ''

    if (!allowedExtensions.includes(extension)) {
      setStatus('error')
      setErrorMessage('Please select a valid PDF, DOCX, TXT, MD, or CSV file.')
      return
    }

    const sizeStr = formatFileSize(file.size)
    setFileDetails({
      name: file.name,
      size: sizeStr,
    })
    setStatus('uploading')
    setErrorMessage('')

    const formData = new FormData()
    formData.append('file', file)
    if (userId) {
      formData.append('userId', userId)
    }

    try {
      setStatus('embedding')
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setStatus('success')
      onUploadSuccess({ name: file.name, size: sizeStr })
    } catch (err: any) {
      console.error(err)
      setStatus('error')
      setErrorMessage(err.message || 'An error occurred during file upload and processing.')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0])
    }
  }

  const onButtonClick = () => {
    inputRef.current?.click()
  }

  const resetUpload = () => {
    setStatus('idle')
    setFileDetails(null)
    setErrorMessage('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative w-full rounded-2xl glass-panel p-8 text-center transition-all duration-300 ${
          dragActive
            ? 'border-blue-500 bg-blue-600/5 shadow-[0_0_20px_rgba(37,99,235,0.15)]'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.01]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.txt,.md,.csv"
          onChange={handleChange}
          disabled={status === 'uploading' || status === 'embedding'}
        />

        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 rounded-full bg-white/[0.03] border border-white/10 text-blue-500 shadow-inner">
              <Upload className="h-8 w-8 animate-pulse" />
            </div>
            <div>
              <button
                onClick={onButtonClick}
                className="text-blue-500 hover:text-blue-400 font-medium transition-colors focus:outline-none cursor-pointer"
              >
                Click to upload
              </button>{' '}
              <span className="text-gray-400">or drag and drop</span>
            </div>
            <p className="text-xs text-gray-500">PDF, DOCX, TXT, MD, CSV (max 10MB)</p>
          </div>
        )}

        {(status === 'uploading' || status === 'embedding') && (
          <div className="flex flex-col items-center justify-center space-y-4 py-3">
            <div className="relative flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-200">
                {status === 'uploading' ? 'Reading document...' : 'Generating embeddings & indexing...'}
              </p>
              {fileDetails && (
                <p className="text-xs text-gray-400 font-mono">
                  {fileDetails.name} ({fileDetails.size})
                </p>
              )}
            </div>
            <p className="text-xs text-gray-500 max-w-[280px] mx-auto">
              This process chunks your document and stores mathematical vectors in pgvector for semantic search.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center justify-center space-y-4 py-2">
            <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-400">Document successfully indexed!</p>
              {fileDetails && <p className="text-xs text-gray-400 mt-1 font-mono">{fileDetails.name}</p>}
            </div>
            <button
              onClick={resetUpload}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] border border-white/10 text-gray-300 hover:bg-white/[0.1] hover:text-white transition-all focus:outline-none cursor-pointer"
            >
              Upload another file
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center space-y-4 py-2">
            <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-rose-400">Upload failed</p>
              <p className="text-xs text-gray-400 max-w-[300px] mt-1 line-clamp-2">{errorMessage}</p>
            </div>
            <button
              onClick={resetUpload}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] focus:outline-none cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
