import Image from 'next/image';
import { BookOpen, Scale, GraduationCap, User } from 'lucide-react';
import { LinkifiedText } from './LinkifiedText';
import { SourcesSection } from './SourcesSection';

interface Citation {
  type: string;
  reference: string;
  content?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

interface ChatMessageProps {
  message: Message;
}

function getCitationIcon(type: string) {
  switch (type) {
    case 'article':
      return <BookOpen className="w-3.5 h-3.5" />;
    case 'jurisprudence':
      return <Scale className="w-3.5 h-3.5" />;
    case 'doctrine':
      return <GraduationCap className="w-3.5 h-3.5" />;
    default:
      return <BookOpen className="w-3.5 h-3.5" />;
  }
}

function getCitationLabel(type: string) {
  switch (type) {
    case 'article':
      return 'Article de loi';
    case 'jurisprudence':
      return 'Jurisprudence';
    case 'doctrine':
      return 'Doctrine';
    default:
      return 'Source';
  }
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
      <div
        className={`flex gap-4 max-w-[80%] ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Avatar */}
        <div className="flex-shrink-0 mt-1">
          {isUser ? (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md ring-2 ring-blue-100">
              <User className="w-5 h-5 text-white" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-white shadow-md ring-2 ring-slate-200 p-1.5 transition-transform hover:scale-105">
              <Image
                src="/logo-mouse.svg"
                alt="Mouse"
                width={40}
                height={40}
                className="w-full h-full"
              />
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Message Bubble */}
          <div
            className={`rounded-2xl px-6 py-4 shadow-sm ${
              isUser
                ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white'
                : 'bg-white border border-slate-200 text-slate-900'
            }`}
          >
            <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {isUser ? (
                message.content
              ) : (
                <LinkifiedText text={message.content} />
              )}
            </div>
          </div>

          {/* Sources Section - Automatically parsed from message content */}
          {!isUser && <SourcesSection text={message.content} />}

          {/* Legacy Citations Support (if provided explicitly) */}
          {!isUser && message.citations && message.citations.length > 0 && (
            <div className="bg-gradient-to-br from-blue-50/50 to-slate-50/50 border border-blue-100/50 rounded-xl p-4 space-y-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span>Citations supplémentaires</span>
                <span className="ml-auto text-xs font-normal text-slate-500">
                  {message.citations.length}{' '}
                  {message.citations.length === 1 ? 'référence' : 'références'}
                </span>
              </div>

              <div className="space-y-2">
                {message.citations.map((citation, index) => (
                  <div
                    key={index}
                    className="group bg-white rounded-lg p-3.5 border border-slate-200/80 hover:border-blue-200 hover:shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 text-blue-600 flex-shrink-0">
                        {getCitationIcon(citation.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-slate-900 mb-1">
                          {citation.reference}
                        </div>
                        {citation.content && (
                          <div className="text-xs text-slate-600 italic leading-relaxed mt-2 pl-3 border-l-2 border-slate-200">
                            "{citation.content}"
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 font-medium">
                          {getCitationIcon(citation.type)}
                          <span>{getCitationLabel(citation.type)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
