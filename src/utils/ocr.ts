import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { COMMON_ALLERGENS } from './allergens';

const client = generateClient<Schema>();

const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 0.72;

// Downscales + re-encodes a photo before it's sent over the wire — phone
// camera photos can be several MB each, and sending several of those in one
// GraphQL request risks tripping AppSync's payload limit.
export function fileToCompressedBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not decode image file.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve(dataUrl.split(',')[1]);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Sends one or more compressed images to the extractLabelText Lambda (AWS
// Textract) and returns the combined extracted text.
export async function extractTextFromFiles(files: File[]): Promise<string> {
  const images = await Promise.all(files.map(fileToCompressedBase64));
  const result = await client.queries.extractLabelText({ images: JSON.stringify(images) });
  return String(result.data ?? '').trim();
}

// Cross-references OCR'd ingredients/nutrition text against the shared
// allergen vocabulary so a plain-language "this food contains..." summary
// can be shown and stored alongside the raw text.
export function detectAllergensInText(text: string): string[] {
  const lower = text.toLowerCase();
  return COMMON_ALLERGENS.filter(a => lower.includes(a.toLowerCase()));
}

export function buildContainsSummary(text: string): string {
  const found = detectAllergensInText(text);
  if (found.length === 0) return '';
  return `This food contains: ${found.join(', ')}.`;
}
