import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'

export async function extractTextFromFile(fileName: string, mimeType: string, buffer: Buffer): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase()

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    // getDocumentProxy parses the PDF buffer safely in serverless environments
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
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
