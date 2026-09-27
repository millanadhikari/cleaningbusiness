import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  href?: string;
  priority?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const sizes = {
  sm: {
    mark: 'size-9',
    wordmark: 'text-[19px]',
    descriptor: 'mt-1 text-[5px] tracking-[0.17em]',
  },
  md: {
    mark: 'size-12',
    wordmark: 'text-[24px]',
    descriptor: 'mt-1.5 text-[6px] tracking-[0.18em]',
  },
  lg: {
    mark: 'size-14',
    wordmark: 'text-[28px]',
    descriptor: 'mt-1.5 text-[7px] tracking-[0.18em]',
  },
} as const;

export function BrandLogo({
  className,
  compact = false,
  href,
  priority = false,
  size = 'md',
}: BrandLogoProps) {
  const dimensions = sizes[size];
  const content = (
    <>
      <Image
        src="/wedo-mark.png"
        alt=""
        width={544}
        height={544}
        className={cn('shrink-0 object-contain', dimensions.mark)}
        priority={priority}
      />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-extrabold tracking-[-0.055em] text-[#16363b] [font-family:Manrope,sans-serif]',
              dimensions.wordmark,
            )}
          >
            We<span className="text-[#008575]">Do</span>
          </span>
          <span
            className={cn(
              'whitespace-nowrap font-bold text-[#455e61] [font-family:DM_Sans,sans-serif]',
              dimensions.descriptor,
            )}
          >
            CLEANING SERVICES
          </span>
        </span>
      ) : null}
    </>
  );

  const sharedClassName = cn('inline-flex min-w-0 items-center gap-2', className);

  if (href) {
    return (
      <Link
        href={href}
        className={sharedClassName}
        aria-label="WeDo Cleaning Services home"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={sharedClassName} role="img" aria-label="WeDo Cleaning Services">
      {content}
    </div>
  );
}
