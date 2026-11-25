/// <reference lib="webworker" />
import { renderFile, type OutputFormat } from './render.ts'
import type { Dev } from './develop.ts'

interface Job { id: number; file: Blob; dev: Dev; format: OutputFormat; quality: number }

self.onmessage = async (event: MessageEvent<Job>) => {
  const { id, file, dev, format, quality } = event.data
  try {
    const blob = await renderFile(file, dev, format, quality)
    self.postMessage({ id, blob })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'export-failed' })
  }
}
