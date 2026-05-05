interface Message {
  sender: 'user' | 'bot';
  name?: string;
  text: string;
  isCommand?: boolean;
}

interface ChatBubbleProps {
  messages: Message[];
  className?: string;
}

export default function ChatBubble({ messages, className = '' }: ChatBubbleProps) {
  return (
    <div
      className={`
        bg-[#212D3B] rounded-2xl p-4 space-y-3
        font-mono text-sm
        shadow-[0_20px_60px_0_rgba(0,0,0,0.3)]
        ${className}
      `}
    >
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-full bg-[#2AABEE] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          SW
        </div>
        <div>
          <div className="text-white text-sm font-semibold">SplitWala Bot</div>
          <div className="text-[#8BA5C3] text-xs">online</div>
        </div>
      </div>
      <div className="space-y-2.5">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`
                max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line
                ${msg.sender === 'user'
                  ? 'bg-[#2AABEE] text-white rounded-br-sm'
                  : 'bg-[#2A3A4E] text-[#E0EAF5] rounded-bl-sm'
                }
              `}
            >
              {msg.name && (
                <div className="text-[#7DD3FC] text-xs font-semibold mb-0.5">{msg.name}</div>
              )}
              <span className={msg.isCommand ? 'text-[#7DD3FC]' : ''}>{msg.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
