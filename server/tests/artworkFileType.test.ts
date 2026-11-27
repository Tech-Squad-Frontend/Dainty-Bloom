import { describe, expect, it } from 'vitest';

import { env } from '../src/config/env';
import { AppError } from '../src/utils/AppError';
import {
  validatePdf,
  validateSvg,
} from '../src/utils/artworkFileType';
import { scanBufferForMalware } from '../src/services/malwareScan.service';

describe('validateSvg', () => {
  it('accepts well-formed SVG without active content', () => {
    expect(() =>
      validateSvg(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
        ),
      ),
    ).not.toThrow();
  });

  it.each([
    '<svg><g></svg>',
    '<svg><g>',
    '<!DOCTYPE svg [<!ENTITY x "unsafe">]><svg>&x;</svg>',
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="https://example.test/image.png"/></svg>',
  ])('rejects malformed or active SVG markup: %s', (xml) => {
    expectRejectedSvg(Buffer.from(xml), 'FILE_CORRUPT');
  });

  it('rejects input larger than the configured upload maximum before XML validation', () => {
    const oversized = Buffer.alloc(env.UPLOAD_MAX_BYTES + 1, 0x20);
    oversized.write('<svg>', 0);

    expectRejectedSvg(oversized, 'FILE_TOO_LARGE');
  });

  it('handles deeply nested SVG markup without recursion failure', () => {
    const depth = 20_000;
    const xml = `<svg>${'<g>'.repeat(depth)}${'</g>'.repeat(depth)}</svg>`;

    expect(() => validateSvg(Buffer.from(xml))).not.toThrow();
  });

  it('rejects a CPU-intensive malformed input within the upload-size limit', () => {
    const xml = `<svg>${'<g>'.repeat(50_000)}</svg>`;

    expectRejectedSvg(Buffer.from(xml), 'FILE_CORRUPT');
  });
});

describe('validatePdf', () => {
  it('accepts a minimal structurally complete PDF', () => {
    const pdf = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
    );
    expect(() => validatePdf(pdf)).not.toThrow();
  });

  it.each([
    '/JavaScript',
    '/OpenAction',
    '/EmbeddedFile',
    '/Launch',
    '/RichMedia',
  ])('rejects PDF active or embedded content: %s', (marker) => {
    const pdf = Buffer.from(
      `%PDF-1.7\n1 0 obj\n<< ${marker} 12 0 R >>\nendobj\n%%EOF`,
    );
    expect(() => validatePdf(pdf)).toThrow();
  });

  it('rejects malformed PDFs and excessive structures', () => {
    expect(() => validatePdf(Buffer.from('not a pdf'))).toThrow();
    const excessive = Buffer.from(
      `%PDF-1.7\n${'1 0 obj\n<< /Length 1 >>\nendobj\n'.repeat(5001)}%%EOF`,
    );
    expect(() => validatePdf(excessive)).toThrow();
  });
});

describe('malware scanning', () => {
  it('uses the configured quarantine-safe test result', async () => {
    await expect(scanBufferForMalware(Buffer.from('safe'))).resolves.toEqual({
      status: 'clean',
    });
  });

  it('fails closed outside test mode when no scanner host is configured', async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalHost = env.CLAMAV_HOST;
    env.NODE_ENV = 'production';
    env.CLAMAV_HOST = undefined;
    try {
      await expect(scanBufferForMalware(Buffer.from('unknown'))).resolves.toEqual({
        status: 'failed',
        code: 'SCANNER_UNAVAILABLE',
      });
    } finally {
      env.NODE_ENV = originalNodeEnv;
      env.CLAMAV_HOST = originalHost;
    }
  });
});

function expectRejectedSvg(buffer: Buffer, code: string): void {
  let error: unknown;
  try {
    validateSvg(buffer);
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code });
}
