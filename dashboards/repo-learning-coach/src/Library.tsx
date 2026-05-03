import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { fetchLibraryCollections, fetchLibraryDocument } from './lib/api'
import type { LibraryCollection, LibraryDocumentContent } from './lib/types'

export function LibraryIndex({ onSelectDocument }: { onSelectDocument: (collectionSlug: string, docSlug: string) => void }) {
    const [collections, setCollections] = useState<LibraryCollection[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchLibraryCollections()
            .then(setCollections)
            .catch(err => setError(err.message))
    }, [])

    if (error) return <div className="error-banner">{error}</div>
    if (!collections) return <div className="muted">Loading library...</div>

    return (
        <div className="content-grid" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {collections.map(collection => (
                <section key={collection.slug} className="content-card content-card--wide">
                    <h3>{collection.title}</h3>
                    <div className="sidebar__list sidebar__list--compact" style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                        {collection.documents.map(doc => (
                            <button
                                key={doc.slug}
                                className="nav-card nav-card--compact"
                                onClick={() => onSelectDocument(collection.slug, doc.slug)}
                                type="button"
                                style={{ textAlign: 'left', height: '100%' }}
                            >
                                <strong>{doc.title}</strong>
                                <p style={{ fontSize: '0.85em', marginTop: '0.5rem' }}>{doc.summary}</p>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    )
}

export function LibraryDocument({ collectionSlug, docSlug, onBack }: { collectionSlug: string, docSlug: string, onBack: () => void }) {
    const [document, setDocument] = useState<LibraryDocumentContent | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setDocument(null)
        setError(null)
        fetchLibraryDocument(collectionSlug, docSlug)
            .then(setDocument)
            .catch(err => setError(err.message))
    }, [collectionSlug, docSlug])

    if (error) return <div className="error-banner">{error}</div>
    if (!document) return <div className="muted">Loading document...</div>

    return (
        <section className="content-card content-card--wide">
            <div className="lesson-header">
                <div>
                    <p className="eyebrow">Reference Library · {document.collection}</p>
                    <h3>{document.title}</h3>
                </div>
                <button className="secondary-button" onClick={onBack} type="button">
                    Back to Library Index
                </button>
            </div>
            <div className="markdown-body">
                <ReactMarkdown>{document.content}</ReactMarkdown>
            </div>
        </section>
    )
}
