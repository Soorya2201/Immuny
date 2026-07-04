import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import type { Schema } from '../../data/resource';

const textract = new TextractClient({});
const MAX_IMAGES_PER_CALL = 5;

export const handler: Schema['extractLabelText']['functionHandler'] = async (event) => {
  try {
    const { images } = event.arguments;
    if (!images) return '';

    let imageList: string[];
    try {
      const parsed = JSON.parse(images);
      imageList = Array.isArray(parsed) ? parsed : [images];
    } catch {
      imageList = [images];
    }
    if (imageList.length === 0) return '';

    const results: string[] = [];
    for (const base64 of imageList.slice(0, MAX_IMAGES_PER_CALL)) {
      try {
        const bytes = Buffer.from(base64, 'base64');
        const res = await textract.send(new DetectDocumentTextCommand({
          Document: { Bytes: bytes },
        }));
        const lines = (res.Blocks ?? [])
          .filter(b => b.BlockType === 'LINE' && b.Text)
          .map(b => b.Text as string);
        if (lines.length > 0) results.push(lines.join('\n'));
      } catch (err) {
        console.warn('extractLabelText: one image failed to process', err);
      }
    }

    return results.join('\n---\n');
  } catch (err) {
    console.error('extractLabelText error:', err);
    return '';
  }
};
