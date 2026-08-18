import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

export async function extractTextFromFile(fileName: string, mimeType: string, buffer: Buffer): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase()

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    return result.text
  }

  if (extension === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // Handle text-based formats
  const textExtensions = ['txt', 'md', 'csv', 'json', 'xml', 'tsv']
  if (
    textExtensions.includes(extension || '') ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json'
  ) {
    return buffer.toString('utf-8')
  }

  throw new Error(`Unsupported file type: .${extension || mimeType}. We support PDF, DOCX, TXT, MD, and CSV.`)
}
