import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Minimize2, Maximize2, X, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

interface ChatInterfaceProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedAgent?: string;
}

export function ChatInterface({ isOpen, onToggle, selectedAgent }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsStreaming(true);

    // Simulate AI response (replace with actual API call later)
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };

    setMessages(prev => [...prev, assistantMessage]);

    // Simulate streaming response
    const response = `I understand you want to work on: "${userMessage.content}". I'm using the ${selectedAgent || 'default'} agent to help you with this task. Here's what I can assist you with...`;
    
    for (let i = 0; i <= response.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: response.slice(0, i), streaming: i < response.length }
            : msg
        )
      );
    }

    setIsStreaming(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <Button
          onClick={onToggle}
          className="rounded-full w-12 h-12 shadow-lg hover:shadow-xl transition-shadow"
          size="icon"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border shadow-2xl">
      <div 
        className={`transition-all duration-300 ease-in-out ${
          isMinimized ? 'h-12' : 'h-80 md:h-96'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                <Bot className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">AI Assistant</span>
              {selectedAgent && (
                <span className="text-xs text-muted-foreground">
                  Using {selectedAgent}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-8 w-8"
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chat content */}
        {!isMinimized && (
          <>
            {/* Messages */}
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4 h-64 md:h-80">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Bot className="h-8 w-8 mb-2" />
                    <p className="text-sm">Start a conversation with your AI assistant</p>
                    {selectedAgent && (
                      <p className="text-xs">Connected to {selectedAgent}</p>
                    )}
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.type === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.type === 'assistant' && (
                        <Avatar className="h-8 w-8 mt-1">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          message.type === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {message.content}
                        {message.streaming && (
                          <span className="inline-block w-2 h-4 bg-current opacity-75 animate-pulse ml-1" />
                        )}
                      </div>
                      
                      {message.type === 'user' && (
                        <Avatar className="h-8 w-8 mt-1">
                          <AvatarFallback className="bg-secondary">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Ask ${selectedAgent || 'AI assistant'} anything about your project...`}
                  disabled={isStreaming}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isStreaming}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              {messages.length > 0 && (
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-muted-foreground">
                    {messages.length} messages
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearChat}
                    className="text-xs h-6"
                  >
                    Clear chat
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}