'use client';

import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';

export function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link
      className={clsx('brand', footer && 'footer-wordmark')}
      href="/"
      aria-label="Dainty Bloom home"
    >
      {footer ? (
        <Image
          src="/images/new-logo.png"
          width={64}
          height={48}
          alt=""
        />
      ) : null}
      <span className="brand__wordmark">
        <span className="brand__dainty">Dainty</span>{' '}
        <span className="brand__bloom">Bloom</span>
      </span>
    </Link>
  );
}
