import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 });

    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const plain = Array.isArray(text) ? text.join('\n\n') : text;

    return NextResponse.json({
      text: (plain ?? '').trim(),
      pages: pdf.numPages,
      name: file.name,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'extract failed' }, { status: 500 });
  }
}
