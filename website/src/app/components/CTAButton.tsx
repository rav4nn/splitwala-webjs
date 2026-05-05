const TG_DEEP_LINK = 'https://t.me/splitwala_bot?startgroup=true';

interface CTAButtonProps {
  size?: 'md' | 'lg';
  className?: string;
}

export default function CTAButton({ size = 'md', className = '' }: CTAButtonProps) {
  const sizeClasses =
    size === 'lg'
      ? 'px-8 py-4 text-lg font-bold'
      : 'px-6 py-3 text-base font-semibold';

  return (
    <a
      href={TG_DEEP_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        inline-flex items-center gap-2.5
        bg-[#2AABEE] hover:bg-[#229ED9]
        text-white rounded-2xl
        transition-all duration-200
        hover:shadow-[0_8px_32px_0_rgba(42,171,238,0.35)]
        hover:-translate-y-0.5
        active:translate-y-0
        ${sizeClasses} ${className}
      `}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/>
      </svg>
      <span className="hidden sm:inline">Add to Telegram Group</span>
      <span className="sm:hidden">Add to group</span>
    </a>
  );
}
