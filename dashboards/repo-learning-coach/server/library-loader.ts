import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { APP_ROOT } from './paths.js'
import { REPO_LEARNING_CONFIG } from '../repo-learning.config.js'

const slugFromFileName = (fileName: string) =>
    basename(fileName, extname(fileName))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

const walkDirSync = (dir: string): string[] => {
    let results: string[] = []
    try {
        const list = readdirSync(dir)
        for (const file of list) {
            const absolutePath = resolve(dir, file)
            const stat = statSync(absolutePath)
            if (stat && stat.isDirectory()) {
                results = results.concat(walkDirSync(absolutePath))
            } else if (extname(absolutePath) === '.md') {
                results.push(absolutePath)
            }
        }
    } catch (e) {
        // Ignore if directory doesn't exist yet
    }
    return results
}

export const getLibraryCollections = () => {
    return REPO_LEARNING_CONFIG.staticLibrary.map(collection => {
        const directory = resolve(APP_ROOT, ...collection.path)
        const files = walkDirSync(directory).sort()

        const documents = files.map(absolutePath => {
            const fileName = basename(absolutePath)
            const content = readFileSync(absolutePath, 'utf8')
            
            // Extract title from first H1 or use filename
            const titleMatch = content.match(/^#\s+(.+)$/m)
            const title = titleMatch ? titleMatch[1].trim() : fileName.replace(/\.md$/, '')

            // Extract summary from first paragraph (text not starting with #, >, -, etc)
            const paragraphMatch = content.match(/^(?![#>\-\s])(.+)$/m)
            const summary = paragraphMatch ? paragraphMatch[1].trim() : ''

            return {
                slug: slugFromFileName(fileName),
                title,
                summary,
            }
        })

        return {
            slug: collection.slug,
            title: collection.title,
            documents
        }
    })
}

export const getLibraryDocument = (collectionSlug: string, docSlug: string) => {
    const collection = REPO_LEARNING_CONFIG.staticLibrary.find(c => c.slug === collectionSlug)
    if (!collection) throw new Error(`Collection ${collectionSlug} not found`)

    const directory = resolve(APP_ROOT, ...collection.path)
    const files = walkDirSync(directory)
    
    for (const absolutePath of files) {
        const fileName = basename(absolutePath)
        if (slugFromFileName(fileName) === docSlug) {
            const content = readFileSync(absolutePath, 'utf8')
            
            const titleMatch = content.match(/^#\s+(.+)$/m)
            const title = titleMatch ? titleMatch[1].trim() : fileName.replace(/\.md$/, '')

            return {
                slug: docSlug,
                title,
                collection: collection.title,
                content
            }
        }
    }

    throw new Error(`Document ${docSlug} not found in collection ${collectionSlug}`)
}
