'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Message, Memory } from '@/lib/db';
import { MessageBubble } from './MessageBubble';
import { ChevronLeft, MoreHorizontal, Mic, Plus, Smile, Keyboard, X, Check } from 'lucide-react';

export const WeChatInterface = () => {
  const messages = useLiveQuery(() => db.messages.orderBy('createdAt').toArray()) || [];
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

  // Initialize DB and migrate from LocalStorage if needed
  useEffect(() => {
    const initDb = async () => {
      const count = await db.messages.count();
      if (count === 0) {
        // Try migration from LocalStorage
        const savedMessages = localStorage.getItem('chat_history');
        if (savedMessages) {
          try {
            const parsed = JSON.parse(savedMessages);
            // Add createdAt if missing
            const messagesToImport = parsed.map((m: any, i: number) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: Date.now() - (parsed.length - i) * 1000 // Approximate timestamp
            }));
            await db.messages.bulkAdd(messagesToImport);
          } catch (e) {
            console.error('Migration failed:', e);
          }
        } else {
          // Default welcome message
          await db.messages.add({
            id: '1',
            role: 'assistant',
            content: '你好，我是情感摆渡人。世间悲喜皆有渡口，如果你在关系中迷失了方向，不妨坐下来聊聊。',
            createdAt: Date.now()
          });
        }
      }
    };
    initDb();
  }, []);

  // Phase 3: Intelligent Summarization Trigger (Rolling Update)
  useEffect(() => {
    const checkAndSummarize = async () => {
      // Trigger every 50 messages to match the short-term context window
      if (messages.length > 0 && messages.length % 50 === 0) {
        console.log('Triggering rolling summarization...');
        
        // Use the last 50 messages for the summary update
        const recentMessages = messages.slice(-50);
        
        // 1. Get the latest existing memory (if any)
        const latestMemories = await db.memories.orderBy('createdAt').reverse().limit(1).toArray();
        const oldMemory = latestMemories.length > 0 ? latestMemories[0].content : '';

        // Prepare messages with timestamps for the summary
        const messagesWithTime = recentMessages.map(m => {
          const date = new Date(m.createdAt);
          const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
          return {
            role: m.role,
            content: `[${timeStr}] ${m.content}`
          };
        });

        try {
          const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              messages: messagesWithTime,
              oldMemory: oldMemory // Pass old memory for merging
            }),
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.summary) {
              // 2. Save the new consolidated memory
              await db.memories.add({
                content: data.summary,
                type: 'summary', // Consolidated summary
                createdAt: Date.now()
              });

              // Limit memory growth (keep last 10)
              const MAX_MEMORIES = 10;
              const allKeys = await db.memories.orderBy('createdAt').primaryKeys();
              if (allKeys.length > MAX_MEMORIES) {
                await db.memories.bulkDelete(allKeys.slice(0, allKeys.length - MAX_MEMORIES));
              }

              console.log('Memory rolled over successfully');
            }
          }
        } catch (error) {
          console.error('Summarization failed:', error);
        }
      }
    };
    
    checkAndSummarize();
  }, [messages.length]);

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

  const sendVoiceMessage = async () => {
    if (!recordingText.trim()) {
      cancelVoice();
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: recordingText,
      createdAt: Date.now(),
    };
    db.messages.add(newMessage);
    
    // Reset states
    setIsReviewing(false);
    setRecordingText('');
    
    // Trigger AI response logic manually
    setIsTyping(true);
    
    // Get Long-Term Memory (Rolling Update: Only need the single latest consolidated memory)
    const latestMemory = await db.memories.orderBy('createdAt').reverse().limit(1).toArray();
    const memoryContext = latestMemory.length > 0 ? latestMemory[0].content : '';

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, newMessage].map(m => {
          const date = new Date(m.createdAt);
          const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
          return {
            role: m.role,
            content: `[${timeStr}] ${m.content}`
          };
        }),
        memoryContext: memoryContext // Pass memory to API
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
            createdAt: Date.now() + index,
          };
          db.messages.add(aiReply);
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
        createdAt: Date.now() + 1,
      };
      db.messages.add(errorMsg);
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
      createdAt: Date.now(),
    };

    db.messages.add(newMessage);
    setInputValue('');
    setIsTyping(true); // Show "typing" indicator
    
    // Get Long-Term Memory (Rolling Update: Only need the single latest consolidated memory)
    const latestMemory = await db.memories.orderBy('createdAt').reverse().limit(1).toArray();
    const memoryContext = latestMemory.length > 0 ? latestMemory[0].content : '';

    // Call API
    try {
      // Prepare messages with timestamps for time-awareness
      const contextMessages = [...messages, newMessage].map(m => {
        const date = new Date(m.createdAt);
        const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        return {
          role: m.role,
          content: `[${timeStr}] ${m.content}`
        };
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: contextMessages,
          memoryContext: memoryContext // Pass memory to API
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
            createdAt: Date.now() + index,
          };
          db.messages.add(aiReply);
          
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
        createdAt: Date.now() + 1,
      };
      db.messages.add(errorMsg);
    }
  };

  const [showMemory, setShowMemory] = useState(false);
  const [memoryList, setMemoryList] = useState<Memory[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Debug trigger refs
  const lastClickRef = useRef(0);
  const clickCountRef = useRef(0);

  const handleOpenMemory = async () => {
    const allMemories = await db.memories.orderBy('createdAt').reverse().toArray();
    setMemoryList(allMemories);
    setShowMemory(true);
  };

  const handleTitleClick = () => {
    const now = Date.now();
    // Reset if click gap is too long (e.g., > 500ms)
    if (now - lastClickRef.current > 500) {
      clickCountRef.current = 0;
    }
    
    clickCountRef.current += 1;
    lastClickRef.current = now;

    if (clickCountRef.current >= 5) {
      handleOpenMemory();
      clickCountRef.current = 0;
    }
  };

  const handleManualSummarize = async () => {
    setIsSummarizing(true);
    try {
      // Get recent messages (Increased limit to 500 to cover more history for manual trigger)
      const recentMessages = await db.messages.orderBy('createdAt').reverse().limit(500).toArray();
      const chronMessages = recentMessages.reverse();

      // Get latest memory for rolling update
      const latestMemories = await db.memories.orderBy('createdAt').reverse().limit(1).toArray();
      const oldMemory = latestMemories.length > 0 ? latestMemories[0].content : '';
      
      // Prepare messages with timestamps
      const messagesWithTime = chronMessages.map(m => {
        const date = new Date(m.createdAt);
        const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        return {
          role: m.role,
          content: `[${timeStr}] ${m.content}`
        };
      });

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messagesWithTime,
          oldMemory: oldMemory
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.summary) {
          await db.memories.add({
            content: data.summary,
            type: 'summary',
            createdAt: Date.now()
          });

          // Limit memory growth (keep last 10)
          const MAX_MEMORIES = 10;
          const allKeys = await db.memories.orderBy('createdAt').primaryKeys();
          if (allKeys.length > MAX_MEMORIES) {
            await db.memories.bulkDelete(allKeys.slice(0, allKeys.length - MAX_MEMORIES));
          }

          // Refresh list
          const allMemories = await db.memories.orderBy('createdAt').reverse().toArray();
          setMemoryList(allMemories);
        }
      }
    } catch (error) {
      console.error('Manual summarization failed:', error);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#ededed] max-w-md mx-auto shadow-xl overflow-hidden relative">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-12 bg-[#ededed] border-b border-gray-300 z-10 shrink-0 select-none">
        <div className="flex items-center text-black cursor-pointer">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-base font-medium">微信({messages.length > 0 ? messages.length : 1})</span>
        </div>
        <div 
          className="text-base font-semibold text-black cursor-pointer active:opacity-70 transition-opacity"
          onClick={handleTitleClick}
        >
            {isTyping ? '对方正在输入...' : '情感摆渡人'}
        </div>
        <div className="flex items-center text-black cursor-pointer">
          <MoreHorizontal className="w-6 h-6" />
        </div>
      </header>

      {/* Memory Viewer Modal */}
      {showMemory && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h3 className="font-semibold text-lg text-gray-800">🧠 长期记忆库</h3>
              <button onClick={() => setShowMemory(false)} className="p-1 hover:bg-gray-200 rounded-full">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 bg-gray-50/50 flex-1">
              {memoryList.length === 0 ? (
                <div className="text-center text-gray-400 py-10">
                  <p>📭 还没有生成长期记忆</p>
                  <p className="text-xs mt-2">（每聊 50 句会自动总结一次）</p>
                </div>
              ) : (
                // Only show the LATEST memory to avoid confusion, as it contains the consolidated history
                memoryList.slice(0, 1).map((m) => (
                  <div key={m.id} className="bg-white p-3 rounded-lg shadow-sm border-l-4 border-[#07c160] text-sm">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span className="font-bold text-[#07c160] flex items-center">
                        <span className="mr-1">🧠</span> 当前生效记忆
                      </span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                ))
              )}
            </div>
            
            {/* Manual Summarize Button Footer */}
            <div className="p-4 border-t bg-white rounded-b-xl">
               <button 
                 onClick={handleManualSummarize}
                 disabled={isSummarizing}
                 className="w-full py-2.5 bg-[#07c160] hover:bg-[#06ad56] active:bg-[#059b4c] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
               >
                 {isSummarizing ? (
                   <>
                     <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                     <span>正在总结中...</span>
                   </>
                 ) : (
                   <>
                     <span className="text-lg">⚡</span>
                     <span>立即总结 (基于最近500条对话)</span>
                   </>
                 )}
               </button>
            </div>
          </div>
        </div>
      )}

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
                    // Use User Agent to detect real mobile devices
                    // This allows "Enter to Send" on desktop even if the window is narrow (like in Trae/VSCode preview)
                    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    
                    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                      if (!isMobileDevice) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                      // If real mobile, do nothing (allow default newline)
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
