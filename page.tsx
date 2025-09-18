'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { io } from 'socket.io-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Send, Bot, User, MoreVertical, Search, Plus, LogOut } from 'lucide-react'

interface Message {
  id: string
  content: string
  sender: 'user' | 'ai' | 'system'
  timestamp: Date
  isTyping?: boolean
  senderId?: string
  senderName?: string
  isPrivate?: boolean
}

interface ChatRoom {
  id: string
  name: string
  lastMessage: string
  timestamp: Date
  unread: number
  isAI: boolean
}

export default function Home() {
  const { data: session, status } = useSession()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hello! I\'m your AI assistant. How can I help you today?',
      sender: 'ai',
      timestamp: new Date(Date.now() - 300000)
    },
    {
      id: '2',
      content: 'Hi! I\'d like to learn more about this chat application.',
      sender: 'user',
      timestamp: new Date(Date.now() - 240000)
    },
    {
      id: '3',
      content: 'This is a modern chat interface built with Next.js, TypeScript, and shadcn/ui components. It features real-time messaging, AI integration, and a clean, responsive design.',
      sender: 'ai',
      timestamp: new Date(Date.now() - 180000)
    }
  ])
  
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [socket, setSocket] = useState<any>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [currentRoom, setCurrentRoom] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([
    {
      id: 'ai',
      name: 'AI Assistant',
      lastMessage: 'Hello! I\'m your AI assistant. How can I help you today?',
      timestamp: new Date(Date.now() - 180000),
      unread: 0,
      isAI: true
    },
    {
      id: 'general',
      name: 'General Chat',
      lastMessage: 'Welcome to the general chat room!',
      timestamp: new Date(Date.now() - 86400000),
      unread: 3,
      isAI: false
    },
    {
      id: 'tech',
      name: 'Tech Support',
      lastMessage: 'How can I help with your technical issues?',
      timestamp: new Date(Date.now() - 172800000),
      unread: 0,
      isAI: false
    },
    {
      id: 'random',
      name: 'Random Talk',
      lastMessage: 'Anyone up for a conversation?',
      timestamp: new Date(Date.now() - 259200000),
      unread: 1,
      isAI: false
    }
  ])
  
  const [activeRoom, setActiveRoom] = useState('ai')

  // Initialize socket connection
  useEffect(() => {
    if (!session) return

    const socketInstance = io({
      path: '/api/socketio',
    })

    setSocket(socketInstance)

    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to socket server')
      
      // Join the default room
      socketInstance.emit('join-room', {
        roomId: activeRoom,
        userName: session.user?.name || 'Anonymous'
      })
      setCurrentRoom(activeRoom)
    })

    socketInstance.on('disconnect', () => {
      setIsConnected(false)
      setCurrentRoom(null)
      console.log('Disconnected from socket server')
    })

    socketInstance.on('message', (msg: any) => {
      const newMessage: Message = {
        id: Date.now().toString(),
        content: msg.text,
        sender: msg.senderId === 'system' ? 'system' : (msg.senderId === socketInstance.id ? 'user' : 'other'),
        timestamp: new Date(msg.timestamp),
        senderId: msg.senderId,
        senderName: msg.senderName,
        isPrivate: msg.isPrivate
      }
      
      setMessages(prev => [...prev, newMessage])
    })

    socketInstance.on('room-joined', (data: { roomId: string; success: boolean }) => {
      if (data.success) {
        setCurrentRoom(data.roomId)
        console.log(`Successfully joined room: ${data.roomId}`)
      }
    })

    socketInstance.on('user-typing', (data: { userId: string; userName: string; isTyping: boolean }) => {
      if (data.userId !== socketInstance.id) {
        setIsTyping(data.isTyping)
      }
    })

    return () => {
      socketInstance.disconnect()
    }
  }, [activeRoom, session])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Handle room change
  const handleRoomChange = (roomId: string) => {
    setActiveRoom(roomId)
    setMessages([]) // Clear messages when switching rooms
    
    if (socket && isConnected && session) {
      socket.emit('join-room', {
        roomId: roomId,
        userName: session.user?.name || 'Anonymous'
      })
    }
  }

  const handleSendMessage = async () => {
    if (inputMessage.trim() === '' || !socket || !isConnected || !session) return

    const newMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, newMessage])
    
    // Send message through socket
    socket.emit('message', {
      text: inputMessage,
      senderId: socket.id,
      timestamp: new Date().toISOString()
    })
    
    const userMessage = inputMessage
    setInputMessage('')

    // If this is an AI room, get real AI response
    if (activeRoom === 'ai') {
      setIsTyping(true)
      
      try {
        // Prepare conversation history for AI context
        const conversationHistory = messages
          .filter(msg => msg.sender === 'user' || msg.sender === 'ai')
          .slice(-10) // Last 10 messages for context

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage,
            conversationHistory: conversationHistory
          })
        })

        const data = await response.json()

        if (response.ok) {
          const aiResponse: Message = {
            id: (Date.now() + 1).toString(),
            content: data.response,
            sender: 'ai',
            timestamp: new Date(data.timestamp)
          }
          
          setMessages(prev => [...prev, aiResponse])
        } else {
          // Handle API error
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: data.response || "I'm sorry, I'm having trouble responding right now.",
            sender: 'ai',
            timestamp: new Date()
          }
          
          setMessages(prev => [...prev, errorMessage])
        }
      } catch (error) {
        console.error('Error calling AI API:', error)
        
        // Fallback response
        const fallbackResponse: Message = {
          id: (Date.now() + 1).toString(),
          content: "I'm sorry, I'm experiencing technical difficulties. Please try again later.",
          sender: 'ai',
          timestamp: new Date()
        }
        
        setMessages(prev => [...prev, fallbackResponse])
      } finally {
        setIsTyping(false)
      }
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (date: Date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString()
    }
  }

  // Handle typing indicator
  const handleTyping = (isTyping: boolean) => {
    if (socket && isConnected && currentRoom && session) {
      socket.emit('typing', {
        isTyping: isTyping,
        roomId: currentRoom
      })
    }
  }

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to sign in if not authenticated
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-primary">
                <Bot className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Welcome to Chat App</CardTitle>
            <p className="text-muted-foreground">Please sign in to continue</p>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => signIn()} 
              className="w-full"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Hidden on mobile, shown on desktop */}
      <div className="hidden md:flex md:w-80 lg:w-96 border-r bg-card flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg md:text-xl font-semibold">Chat App</h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {isConnected ? 'Online' : 'Offline'}
              </span>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* User Info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {session.user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session.user?.name || 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user?.email || 'No email'}
              </p>
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={() => signOut()}
              className="h-8 w-8"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
              placeholder="Search conversations..." 
              className="pl-10"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2">
            {chatRooms.map((room) => (
              <div
                key={room.id}
                className={`p-3 rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                  activeRoom === room.id ? 'bg-accent' : ''
                }`}
                onClick={() => handleRoomChange(room.id)}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={room.isAI ? 'bg-primary text-primary-foreground' : ''}>
                      {room.isAI ? <Bot className="h-5 w-5" /> : room.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium truncate text-sm">{room.name}</h3>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(room.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {room.lastMessage}
                    </p>
                  </div>
                  {room.unread > 0 && (
                    <Badge variant="destructive" className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                      {room.unread}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header - Responsive */}
        <div className="p-3 md:p-4 border-b bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-8 w-8 md:h-10 md:w-10">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {activeRoom === 'ai' ? <Bot className="h-4 w-4 md:h-5 md:w-5" /> : activeRoom.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="font-semibold text-sm md:text-base truncate">
                  {chatRooms.find(r => r.id === activeRoom)?.name || 'Unknown Room'}
                </h2>
                <p className="text-xs md:text-sm text-muted-foreground truncate">
                  {isConnected ? `Online • Room: ${currentRoom}` : 'Offline'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile user menu */}
              <div className="md:hidden flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {session.user?.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Messages Area - Responsive */}
        <ScrollArea className="flex-1 p-2 md:p-4">
          <div className="space-y-3 md:space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 md:gap-3 ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.sender !== 'user' && (
                  <Avatar className="h-6 w-6 md:h-8 md:w-8">
                    <AvatarFallback className={
                      message.sender === 'ai' ? 'bg-primary text-primary-foreground' :
                      message.sender === 'system' ? 'bg-muted-foreground' : ''
                    }>
                      {message.sender === 'ai' ? <Bot className="h-3 w-3 md:h-4 md:w-4" /> : 
                       message.sender === 'system' ? '📢' :
                       message.senderName?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[85%] md:max-w-[70%] rounded-lg p-2 md:p-3 ${
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : message.sender === 'system'
                      ? 'bg-muted border'
                      : message.isPrivate
                      ? 'bg-accent'
                      : 'bg-muted'
                  }`}
                >
                  {message.senderName && message.sender !== 'user' && message.sender !== 'system' && (
                    <p className="text-xs font-medium mb-1 opacity-70">
                      {message.senderName}
                      {message.isPrivate && ' (Private)'}
                    </p>
                  )}
                  <p className="text-xs md:text-sm leading-relaxed">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    message.sender === 'user' 
                      ? 'text-primary-foreground/70' 
                      : 'text-muted-foreground'
                  }`}>
                    {formatTime(message.timestamp)}
                  </p>
                </div>
                {message.sender === 'user' && (
                  <Avatar className="h-6 w-6 md:h-8 md:w-8">
                    <AvatarFallback>
                      <User className="h-3 w-3 md:h-4 md:w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            
            {isTyping && (
              <div className="flex gap-2 md:gap-3 justify-start">
                <Avatar className="h-6 w-6 md:h-8 md:w-8">
                  <AvatarFallback className="bg-muted-foreground">
                    ?
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg p-2 md:p-3">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area - Responsive */}
        <div className="p-3 md:p-4 border-t bg-card">
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              onFocus={() => handleTyping(true)}
              onBlur={() => handleTyping(false)}
              disabled={!isConnected}
              className="flex-1"
            />
            <Button 
              onClick={handleSendMessage} 
              disabled={inputMessage.trim() === '' || !isConnected}
              className="h-10 w-10 md:h-auto md:w-auto px-3"
            >
              <Send className="h-4 w-4" />
              <span className="hidden md:inline ml-2">Send</span>
            </Button>
          </div>
          {!isConnected && (
            <p className="text-xs text-muted-foreground mt-2">
              Connecting to chat server...
            </p>
          )}
          {isConnected && currentRoom && (
            <p className="text-xs text-muted-foreground mt-2 hidden md:block">
              Connected to room: {currentRoom} as {session.user?.name || 'Anonymous'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}