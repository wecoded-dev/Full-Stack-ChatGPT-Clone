'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { 
  Send, Bot, User, Settings, Trash2, Edit3, Paperclip, 
  Download, Share2, Heart, Eye, Zap, Code, Image, 
  Mic, Square, Play, Pause, Volume2, Languages,
  ThumbsUp, ThumbsDown, Copy, CheckCheck, MoreVertical,
  Sparkles, Brain, Clock, BarChart3, Users, Lock
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'react-toastify'

export function PremiumChatInterface() {
  const [message, setMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const { 
    currentChat, 
    isStreaming, 
    streamMessage,
    updateChat,
    deleteChat,
    regenerateMessage,
    editMessage
  } = useChatStore()
  const { user } = useAuthStore()

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: 'smooth',
      block: 'end'
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [currentChat?.messages, isStreaming, scrollToBottom])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        await processAudioRecording(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      toast.error('Microphone access denied')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const processAudioRecording = async (audioBlob: Blob) => {
    try {
      // Convert to base64 for API
      const arrayBuffer = await audioBlob.arrayBuffer()
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      )

      // Send to speech-to-text API
      const response = await fetch('/api/v1/speech-to-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio })
      })

      const data = await response.json()
      if (data.success) {
        setMessage(prev => prev + data.text)
      }
    } catch (error) {
      toast.error('Failed to process audio')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!message.trim() || !currentChat) return

    const messageContent = message.trim()
    setMessage('')
    setIsTyping(false)

    try {
      // Process attachments first if any
      if (attachments.length > 0) {
        await processAttachments(attachments)
      }

      streamMessage(currentChat._id, messageContent)
    } catch (error) {
      toast.error('Failed to send message')
    }
  }

  const processAttachments = async (files: File[]) => {
    const formData = new FormData()
    
    files.forEach(file => {
      formData.append('attachments', file)
    })

    try {
      const response = await fetch(`/api/v1/chat/${currentChat?._id}/attachments`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) throw new Error('Upload failed')
    } catch (error) {
      toast.error('Failed to upload attachments')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setAttachments(prev => [...prev, ...files])
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }

    // Command palette shortcuts
    if (e.key === '/' && e.ctrlKey) {
      e.preventDefault()
      setShowTools(true)
    }

    if (e.key === 'Escape') {
      setShowTools(false)
      setSelectedMessage(null)
    }
  }

  const handleRegenerate = (messageId: string) => {
    regenerateMessage(currentChat!._id, messageId)
  }

  const handleEditMessage = (messageId: string, newContent: string) => {
    editMessage(currentChat!._id, messageId, newContent)
    setSelectedMessage(null)
  }

  const handleCopyMessage = async (content: string) => {
    await navigator.clipboard.writeText(content)
    toast.success('Copied to clipboard')
  }

  const handleLikeMessage = (messageId: string) => {
    // Implement message liking
    toast.info('Message liked')
  }

  const handleShareChat = async () => {
    try {
      const shareData = {
        title: currentChat?.title,
        text: `Check out this AI conversation: ${currentChat?.title}`,
        url: window.location.href
      }

      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('Link copied to clipboard')
      }
    } catch (error) {
      console.error('Share failed:', error)
    }
  }

  const generateImage = async (prompt: string) => {
    try {
      const response = await fetch('/api/v1/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      const data = await response.json()
      if (data.success) {
        // Add image to chat
        toast.success('Image generated successfully')
      }
    } catch (error) {
      toast.error('Failed to generate image')
    }
  }

  if (!currentChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-900">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="relative mb-6">
            <motion.div
              animate={{ 
                rotate: 360,
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                scale: { duration: 2, repeat: Infinity }
              }}
            >
              <Sparkles className="w-20 h-20 text-blue-500 mx-auto" />
            </motion.div>
            <Brain className="w-8 h-8 text-purple-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Start an Intelligent Conversation
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Choose a chat from the sidebar or create a new one to begin your AI-powered journey.
          </p>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <Zap className="w-6 h-6 text-yellow-500 mb-2" />
              <p>Fast Responses</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <Code className="w-6 h-6 text-green-500 mb-2" />
              <p>Code Support</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <Image className="w-6 h-6 text-purple-500 mb-2" />
              <p>Image Generation</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <Languages className="w-6 h-6 text-blue-500 mb-2" />
              <p>Multi-language</p>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-900 relative">
      {/* Enhanced Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {currentChat.title}
              </h2>
            </div>
            
            <button
              onClick={() => {
                const newTitle = prompt('Enter new title:', currentChat.title)
                if (newTitle && newTitle !== currentChat.title) {
                  updateChat(currentChat._id, { title: newTitle })
                }
              }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* Analytics */}
            <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>{currentChat.messageCount.total} messages</span>
              </div>
              <div className="flex items-center space-x-1">
                <BarChart3 className="w-4 h-4" />
                <span>{currentChat.tokenCount.total} tokens</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-1">
              <button
                onClick={handleShareChat}
                className="p-2 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                title="Share chat"
              >
                <Share2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this chat?')) {
                    deleteChat(currentChat._id)
                  }
                }}
                className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Delete chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-4xl mx-auto space-y-6">
          <AnimatePresence>
            {currentChat.messages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={`flex space-x-4 group ${
                  msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                {/* Avatar */}
                <div className="flex-shrink-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                        : 'bg-gradient-to-br from-green-500 to-emerald-600'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User className="w-5 h-5 text-white" />
                    ) : (
                      <Bot className="w-5 h-5 text-white" />
                    )}
                  </div>
                </div>
                
                {/* Message Content */}
                <div
                  className={`flex-1 max-w-3xl relative ${
                    msg.role === 'user'
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                  } rounded-2xl px-6 py-4 shadow-sm hover:shadow-md transition-shadow`}
                >
                  {/* Message Actions */}
                  <div className="absolute -top-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1 shadow-lg">
                    <button
                      onClick={() => handleCopyMessage(msg.content)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Copy"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleRegenerate(msg.id!)}
                        className="p-1 text-gray-400 hover:text-green-500 dark:hover:text-green-400"
                        title="Regenerate"
                      >
                        <Zap className="w-3 h-3" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleLikeMessage(msg.id!)}
                      className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      title="Like"
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={() => setSelectedMessage(selectedMessage === msg.id ? null : msg.id!)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="More"
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Message Body */}
                  {msg.role === 'assistant' ? (
                    <div className="prose dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          code: ({ node, inline, className, children, ...props }) => {
                            const match = /language-(\w+)/.exec(className || '')
                            return !inline && match ? (
                              <div className="relative">
                                <div className="absolute top-2 right-2 text-xs text-gray-500">
                                  {match[1]}
                                </div>
                                <pre className={className + ' bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto'}>
                                  <code {...props}>{children}</code>
                                </pre>
                              </div>
                            ) : (
                              <code className={className + ' bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm'} {...props}>
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  )}

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.attachments.map((attachment, idx) => (
                        <div key={idx} className="flex items-center space-x-2 text-sm text-gray-500">
                          <Paperclip className="w-3 h-3" />
                          <span>{attachment.name}</span>
                          <span className="text-xs">({(attachment.size / 1024).toFixed(1)}KB)</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Footer */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                      {msg.tokens.total > 0 && ` • ${msg.tokens.total} tokens`}
                      {msg.cost > 0 && ` • $${msg.cost.toFixed(4)}`}
                    </div>
                    
                    {msg.sentiment && (
                      <div className={`text-xs px-2 py-1 rounded-full ${
                        msg.sentiment.label === 'positive' ? 'bg-green-100 text-green-800' :
                        msg.sentiment.label === 'negative' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {msg.sentiment.label}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Streaming Indicator */}
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex space-x-4"
            >
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-4 shadow-sm">
                <div className="flex space-x-2 items-center">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-2 h-2 bg-green-500 rounded-full"
                  ></motion.div>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    className="w-2 h-2 bg-green-500 rounded-full"
                  ></motion.div>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    className="w-2 h-2 bg-green-500 rounded-full"
                  ></motion.div>
                  <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Enhanced Input Area */}
      <motion.footer 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm"
      >
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <div key={index} className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Paperclip className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-blue-700 dark:text-blue-300">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex space-x-4">
            {/* Tools Sidebar */}
            {showTools && (
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-xl"
              >
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">AI Tools</h4>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => generateImage(message)}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-3"
                  >
                    <Image className="w-5 h-5 text-purple-500" />
                    <span>Generate Image</span>
                  </button>
                  <button
                    type="button"
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-3"
                  >
                    <Languages className="w-5 h-5 text-blue-500" />
                    <span>Translate</span>
                  </button>
                  <button
                    type="button"
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center space-x-3"
                  >
                    <Code className="w-5 h-5 text-green-500" />
                    <span>Explain Code</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Main Input Area */}
            <div className="flex-1 relative">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value)
                    setIsTyping(e.target.value.length > 0)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything... (Ctrl + / for tools)"
                  className="w-full px-6 py-4 border border-gray-300 dark:border-gray-600 rounded-2xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white pr-32 shadow-sm"
                  rows={1}
                  style={{ minHeight: '64px', maxHeight: '200px' }}
                />

                {/* Input Actions */}
                <div className="absolute right-3 top-3 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Attach files"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    className={`p-2 transition-colors ${
                      isRecording 
                        ? 'text-red-500 animate-pulse' 
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                    title="Voice message"
                  >
                    {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTools(!showTools)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="AI Tools"
                  >
                    <Sparkles className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* File Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.txt,.jpg,.jpeg,.png,.mp3,.wav,.mp4"
              />
            </div>

            {/* Send Button */}
            <motion.button
              type="submit"
              disabled={!message.trim() || isStreaming}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl hover:from-blue-600 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center space-x-2"
            >
              <Send className="w-5 h-5" />
              <span className="font-semibold">Send</span>
            </motion.button>
          </div>

          {/* Quick Actions */}
          <div className="flex justify-center space-x-6 mt-4">
            <button
              type="button"
              onClick={() => streamMessage(currentChat._id, "Can you summarize this conversation?")}
              disabled={isStreaming}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
            >
              Summarize
            </button>
            <button
              type="button"
              onClick={() => streamMessage(currentChat._id, "Can you suggest related topics?")}
              disabled={isStreaming}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
            >
              Suggest Topics
            </button>
            <button
              type="button"
              onClick={() => streamMessage(currentChat._id, "Can you make this more concise?")}
              disabled={isStreaming}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
            >
              Make Concise
            </button>
          </div>
        </form>
      </motion.footer>

      {/* Message Editor Modal */}
      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedMessage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Edit Message</h3>
              {/* Edit form implementation */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
