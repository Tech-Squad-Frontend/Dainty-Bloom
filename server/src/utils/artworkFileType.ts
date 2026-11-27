import { XMLValidator } from 'fast-xml-parser';

import { env } from '../config/env';
import { AppError } from './AppError';
import { detectFileType } from './fileType';

export function validateSvg(buffer: Buffer): void {
  if (buffer.byteLength > env.UPLOAD_MAX_BYTES) {
    throw new AppError('File exceeds the allowed size', 413, 'FILE_TOO_LARGE');
  }

  const xml = buffer.toString('utf8');
  const validation = XMLValidator.validate(xml, {
    allowBooleanAttributes: false,
  });
  const unsafe =
    validation !== true ||
    !/<svg(?:\s|>)/i.test(xml) ||
    /<\s*(?:[\w.-]+:)?script\b/i.test(xml) ||
    /<\s*(?:[\w.-]+:)?foreignObject\b/i.test(xml) ||
    /\bon[a-z]+\s*=/i.test(xml) ||
    /\b(?:href|xlink:href)\s*=\s*["'](?!#)[^"']*["']/i.test(xml) ||
    /url\s*\(\s*["']?(?!#)/i.test(xml) ||
    /@import\b/i.test(xml) ||
    /<!ENTITY\b|<!DOCTYPE\b/i.test(xml);
  if (unsafe) throw new AppError('SVG file is not safe', 400, 'FILE_CORRUPT');
}

export function validatePdf(buffer: Buffer): void {
  if (buffer.byteLength > env.UPLOAD_MAX_BYTES) {
    throw new AppError(
      'File exceeds the allowed size',
      413,
      'FILE_TOO_LARGE',
    );
  }
  const text = buffer.toString('latin1');
  if (
    !/^%PDF-\d\.\d/.test(text) ||
    !/%%EOF/.test(text.slice(Math.max(0, text.length - 4096)))
  ) {
    throw new AppError('PDF file is malformed', 400, 'FILE_CORRUPT');
  }
  const unsafe =
    /\/(?:JavaScript|JS|OpenAction|AA|EmbeddedFile|Launch|RichMedia|XFA)\b/i.test(
      text,
    ) ||
    /\/(?:F|D)[\w*]*\s*<<[^>]*\/(?:S)\s*\/(?:GoTo|URI|Launch)/i.test(text);
  if (unsafe) {
    throw new AppError(
      'PDF contains unsafe active or embedded content',
      400,
      'FILE_UNSAFE_PDF',
    );
  }
  const objectCount = (text.match(/\b\d+\s+\d+\s+obj\b/g) ?? []).length;
  const streamCount = (text.match(/\/(?:Length|Filter)\b/g) ?? []).length;
  if (objectCount > 5000 || streamCount > 500) {
    throw new AppError(
      'PDF structure exceeds resource limits',
      413,
      'FILE_TOO_COMPLEX',
    );
  }
}

export async function detectArtworkMime(buffer: Buffer): Promise<string> {
  const text = buffer
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (
    /^(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(text)
  ) {
    validateSvg(buffer);
    return 'image/svg+xml';
  }
  const type = await detectFileType(buffer);
  if (type?.mime === 'application/pdf') {
    validatePdf(buffer);
  }
  if (type?.mime) return type.mime;

  throw new AppError('File type could not be detected', 400, 'FILE_CORRUPT');
}
