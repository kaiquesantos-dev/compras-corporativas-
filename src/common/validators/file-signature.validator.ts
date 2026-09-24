import { FileValidator } from '@nestjs/common';

// Confere os bytes iniciais do arquivo (a "assinatura"/"magic bytes") em vez
// de confiar no Content-Type que o cliente declarou no multipart. O
// FileTypeValidator embutido do Nest (usado via ParseFilePipeBuilder) só
// olha file.mimetype, que é inteiramente controlado pelo cliente — um
// `curl -F "file=@payload.html;type=application/pdf"` passava por ele
// tranquilamente. Usar este validador JUNTO com o FileTypeValidator fecha
// essa brecha: mesmo que o cliente minta no Content-Type, o conteúdo
// precisa realmente começar com a assinatura de um PDF, PNG ou JPEG.
const SIGNATURES: ((buffer: Buffer) => boolean)[] = [
  // PDF: "%PDF"
  (b) => b.subarray(0, 4).toString('ascii') === '%PDF',
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  (b) =>
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a,
  // JPEG: FF D8 FF
  (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
];

export class FileSignatureValidator extends FileValidator<Record<string, never>> {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file?.buffer) return false;
    return SIGNATURES.some((matches) => matches(file.buffer));
  }

  buildErrorMessage(): string {
    return 'O conteúdo do arquivo não corresponde a um PDF, PNG ou JPEG válido.';
  }
}
