import React from 'react';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content }) => {
  const isUser = role === 'user';

  return (
    <div className={cn("flex w-full mb-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex-shrink-0 mr-2">
          <div className="w-10 h-10 rounded-md overflow-hidden border border-gray-200">
             <img src="/ferryman.jpg" alt="情感摆渡人" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      <div className={cn(
        "relative max-w-[70%] px-4 py-2 rounded-md text-base leading-relaxed break-words",
        isUser ? "bg-[#95ec69] text-black" : "bg-white text-black border border-gray-200"
      )}>
        {/* Triangle Tail */}
        <div className={cn(
          "absolute top-3 w-0 h-0 border-[6px] border-transparent",
          isUser 
            ? "right-[-6px] border-l-[#95ec69] border-r-0" 
            : "left-[-6px] border-r-white border-l-0"
        )} style={{ 
          filter: !isUser ? 'drop-shadow(-1px 0px 0px #e5e7eb)' : 'none' // Hack for border on white bubble
        }} />
        
        {content}
      </div>

      {isUser && (
        <div className="flex-shrink-0 ml-2">
          <div className="w-10 h-10 bg-gray-300 rounded-md flex items-center justify-center overflow-hidden">
             <User className="w-6 h-6 text-gray-600" />
          </div>
        </div>
      )}
    </div>
  );
};
