'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChevronLeft, MoreHorizontal, Mic, Plus, Smile, Keyboard, X, Check } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export const WeChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComposing, setIsComposing] = useState(false); // Track CJK composition state
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false); // Review state before sending
  const [recordingText, setRecordingText] = useState(''); // Real-time voice transcript
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Load messages from LocalStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('chat_history');
    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    } else {
      setMessages([
        { id: '1', role: 'assistant', content: '你好，我是树洞先生。如果你有情感上的困惑，或者想聊聊亲密关系中的那些事，我都在这里。' }
      ]);
    }
  }, []);

  // Save messages to LocalStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = true; // Keep listening until stopped manually
        recognition.interimResults = true; // Enable real-time results
        
        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          // Combine existing text with new results if needed, or just show current session
          // For simplicity in this "Hold to Talk" mode, we usually just show what's currently being said.
          // Since we reset recordingText on start, we can just accumulate.
          // However, with continuous=true, we might need to be careful.
          // Let's just trust the latest event results for the current session.
          
          // Actually, standard practice for continuous:
          // event.results contains all results for the session.
          const currentText = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('');

          if (currentText) {
             setRecordingText(currentText);
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, [messages]); // Dependency on messages to keep closure fresh for API call

  const startRecording = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsRecording(true);
    setIsReviewing(false);
    setRecordingText(''); // Reset text on start
    try {
      recognitionRef.current?.start();
    } catch (err) {
      // Ignore if already started
      console.log('Recognition already started');
    }
  };

  const stopRecording = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsRecording(false);
    recognitionRef.current?.stop();
    // Delay slightly to ensure we have the latest text, then show review
    setTimeout(() => {
      setIsReviewing(true);
    }, 200);
  };

  const cancelVoice = () => {
    setIsReviewing(false);
    setRecordingText('');
  };

  const sendVoiceMessage = () => {
    if (!recordingText.trim()) {
      cancelVoice();
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: recordingText,
    };
    setMessages(prev => [...prev, newMessage]);
    
    // Reset states
    setIsReviewing(false);
    setRecordingText('');
    
    // Trigger AI response logic manually
    setIsTyping(true);
    
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, newMessage].map(m => ({ role: m.role, content: m.content }))
      }),
    })
    .then(async (response) => {
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const rawContent = data.content;
      const cleanContent = rawContent.replace(/<\/think_never_used_[a-z0-9]+>|<think>|unittest/g, '');
      const parts = cleanContent.split('[BREAK]').map((s: string) => s.trim()).filter((s: string) => s);
      
      let currentDelay = 0;
      parts.forEach((part: string, index: number) => {
        let delayForThis = 0;
        if (index === 0) {
           delayForThis = 100; 
        } else {
            const typingSpeed = 150 + Math.random() * 100;
            const thinkingPause = 1500 + Math.random() * 2000;
            delayForThis = thinkingPause + (part.length * typingSpeed);
         }
        currentDelay += delayForThis;
        setTimeout(() => {
          const aiReply: Message = {
            id: (Date.now() + index).toString(),
            role: 'assistant',
            content: part,
          };
          setMessages(prev => [...prev, aiReply]);
          if (index === parts.length - 1) setIsTyping(false);
        }, currentDelay);
      });
    })
    .catch(error => {
      console.error('Failed to get AI response:', error);
      setIsTyping(false);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `（系统消息）连接 AI 失败: ${String(error)}`,
      };
      setMessages(prev => [...prev, errorMsg]);
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
    };

    setMessages(prev => [...prev, newMessage]);
    setInputValue('');
    setIsTyping(true); // Show "typing" indicator
    
    // Call API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, newMessage].map(m => ({ role: m.role, content: m.content }))
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data = await response.json();
      
      // Split content by [BREAK] to simulate multiple messages
      // Also filter out any known garbage tags like </think...> or unittest
      const rawContent = data.content;
      const cleanContent = rawContent.replace(/<\/think_never_used_[a-z0-9]+>|<think>|unittest/g, '');
      
      const parts = cleanContent.split('[BREAK]').map((s: string) => s.trim()).filter((s: string) => s);
      
      let currentDelay = 0;

      parts.forEach((part: string, index: number) => {
        // Base delay for "thinking" + "typing"
        // First message: Just wait for network (0 delay on top of API call)
        // Subsequent messages: Add realistic reading + typing time
        
        let delayForThis = 0;

        if (index === 0) {
           // The API call itself already took time (e.g. 2s), so we show the first message almost immediately
           // to prevent "double waiting" (API wait + artificial wait)
           delayForThis = 100; 
        } else {
            // For subsequent messages, simulate:
            // 1. Reading the previous part (short pause)
            // 2. Typing the new part (realistic speed: ~150-250ms per char for thoughtful reply)
            // 3. Random thinking jitter
            const typingSpeed = 150 + Math.random() * 100; // 150-250ms per char (slower)
            const thinkingPause = 1500 + Math.random() * 2000; // 1.5s - 3.5s thinking (longer)
            delayForThis = thinkingPause + (part.length * typingSpeed);
         }

        currentDelay += delayForThis;

        setTimeout(() => {
          const aiReply: Message = {
            id: (Date.now() + index).toString(),
            role: 'assistant',
            content: part, // Emojis like [EMOJI:hug] will be rendered as text for now
          };
          setMessages(prev => [...prev, aiReply]);
          
          // Only stop typing indicator after the LAST message appears
          if (index === parts.length - 1) {
            setIsTyping(false);
          }
        }, currentDelay);
      });

    } catch (error) {
      console.error('Failed to get AI response:', error);
      setIsTyping(false);
      
      let friendlyError = `连接 AI 失败: ${error instanceof Error ? error.message : String(error)}`;
      const errorStr = String(error);
      
      // Handle common Serveo/Tunnel interception errors (returning HTML instead of JSON)
      if (errorStr.includes('Unexpected token') || errorStr.includes('JSON')) {
        friendlyError = '连接被安全页面拦截，请尝试刷新页面，或者检查是否需要点击“继续访问”。';
      } else if (errorStr.includes('Failed to fetch') || errorStr.includes('NetworkError')) {
        friendlyError = '网络连接不通，请检查电脑网络（某些网络可能屏蔽了此链接）。';
      }

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `（系统消息）${friendlyError}`,
      };
      setMessages(prev => [...prev, errorMsg]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#ededed] max-w-md mx-auto shadow-xl overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-12 bg-[#ededed] border-b border-gray-300 z-10 shrink-0">
        <div className="flex items-center text-black cursor-pointer">
          <ChevronLeft className="w-6 h-6" />
          <span className="text-base font-medium ml-1">微信({messages.length > 0 ? messages.length : 1})</span>
        </div>
        <div className="text-base font-semibold text-black">
            {isTyping ? '对方正在输入...' : '树洞先生'}
        </div>
        <div className="flex items-center text-black cursor-pointer">
          <MoreHorizontal className="w-6 h-6" />
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Voice Recording Overlay / Review Modal */}
      {(isRecording || (isReviewing && recordingText)) && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm ${isRecording ? 'pointer-events-none' : 'pointer-events-auto'}`}>
          <div className="bg-white rounded-xl p-6 flex flex-col items-center justify-center w-[80%] max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200 pointer-events-auto">
            
            {/* Icon Status */}
            <div className="mb-4">
               {isRecording ? (
                 <Mic className="w-12 h-12 text-[#07c160] animate-pulse" />
               ) : (
                 <div className="w-12 h-12 rounded-full bg-[#f0f0f0] flex items-center justify-center">
                    <MoreHorizontal className="w-8 h-8 text-gray-500" />
                 </div>
               )}
            </div>

            {/* Text Content */}
            <div className="w-full mb-6">
              <p className="text-center font-medium text-lg leading-relaxed text-gray-800 break-words max-h-[40vh] overflow-y-auto">
                {recordingText || (isRecording ? '正在听...' : '没有检测到语音')}
              </p>
            </div>

            {/* Action Buttons (Only in Review Mode) */}
            {isReviewing && (
              <div className="flex w-full space-x-4">
                <button 
                  onClick={cancelVoice}
                  className="flex-1 flex items-center justify-center space-x-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                >
                  <X className="w-5 h-5" />
                  <span>取消</span>
                </button>
                <button 
                  onClick={sendVoiceMessage}
                  className="flex-1 flex items-center justify-center space-x-2 py-3 bg-[#07c160] hover:bg-[#06ad56] text-white rounded-lg transition-colors font-medium shadow-md"
                >
                  <Check className="w-5 h-5" />
                  <span>发送</span>
                </button>
              </div>
            )}
            
            {/* Recording Hint */}
            {isRecording && (
               <p className="text-gray-400 text-sm">松开结束，确认发送</p>
            )}
          </div>
        </div>
      )}

      {/* Input Area */}
      <footer className="bg-[#f7f7f7] border-t border-gray-300 px-3 py-2 shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end space-x-3 mb-[env(safe-area-inset-bottom)]">
          <button 
            className="p-2 mb-1 rounded-full hover:bg-gray-200 transition-colors shrink-0"
            onClick={() => setIsVoiceMode(!isVoiceMode)}
          >
            {isVoiceMode ? (
              <Keyboard className="w-7 h-7 text-gray-700" />
            ) : (
              <Mic className="w-7 h-7 text-gray-700" />
            )}
          </button>
          
          {isVoiceMode ? (
            <button
              className={`flex-1 rounded-md min-h-[40px] mb-1 font-medium select-none touch-none transition-colors border border-transparent ${
                isRecording ? 'bg-[#c6c6c6] text-gray-800' : 'bg-white text-black hover:bg-gray-50'
              }`}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
            >
              {isRecording ? '松开 发送' : '按住 说话'}
            </button>
          ) : (
            <div className="flex-1 bg-white rounded-md min-h-[40px] px-3 py-2 mb-1">
               <textarea 
                  ref={textareaRef}
                  className="w-full bg-transparent outline-none resize-none text-base max-h-24 block"
                  rows={1}
                  placeholder=""
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={(e) => {
                    setIsComposing(false);
                    // Force update value on composition end for some mobile browsers
                    setInputValue(e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
               />
            </div>
          )}

          <button className="p-2 mb-1 rounded-full hover:bg-gray-200 transition-colors shrink-0">
            <Smile className="w-7 h-7 text-gray-700" />
          </button>
          
          {!isVoiceMode && (inputValue.trim() || isComposing) ? (
            <button 
              onClick={handleSendMessage}
              className="px-4 py-1.5 mb-1.5 bg-[#07c160] text-white text-sm font-medium rounded-md hover:bg-[#06ad56] transition-colors shrink-0"
            >
              发送
            </button>
          ) : (
             <button className="p-2 mb-1 rounded-full hover:bg-gray-200 transition-colors shrink-0">
              <Plus className="w-7 h-7 text-gray-700" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
