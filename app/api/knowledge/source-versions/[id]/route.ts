import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { knowledgeSources, sourceDocuments, sourceDocumentVersions } from '@/db/schema'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await db.select({ version: sourceDocumentVersions, document: sourceDocuments, source: knowledgeSources })
    .from(sourceDocumentVersions)
    .innerJoin(sourceDocuments, eq(sourceDocumentVersions.documentId, sourceDocuments.id))
    .innerJoin(knowledgeSources, eq(sourceDocuments.sourceId, knowledgeSources.id))
    .where(eq(sourceDocumentVersions.id, id))
  if (!rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const row = rows[0]
  return NextResponse.json({
    id: row.version.id,
    capturedAt: row.version.capturedAt,
    contentHash: row.version.contentHash,
    parserVersion: row.version.parserVersion,
    status: row.version.status,
    rawText: row.version.rawText,
    document: { id: row.document.id, title: row.document.title, canonicalUrl: row.document.canonicalUrl, publishedAt: row.document.publishedAt },
    source: { id: row.source.id, name: row.source.name, authorityLevel: row.source.authorityLevel },
  })
}
