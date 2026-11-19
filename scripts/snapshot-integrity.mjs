import {inventory, POLICY, POLICY_HASH} from './publish-policy.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PUBLISHED_LIBRARIES = POLICY.libraries;

export function buildDirectoryInventory(root, library = '', {published=false}={}) {
    if(!existsSync(root)) throw Error('快照目錄不存在：'+root);
    const entries=inventory(root,{library,filtered:!published});
    entries.sort((left, right) => left.path.localeCompare(right.path));
    const digest = createHash('sha256');
    for (const entry of entries) {
        digest.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
    }

    return {
        algorithm: 'sha256',
        fileCount: entries.length,
        totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
        digest: digest.digest('hex'),
        entries,
    };
}

export function buildLibraryContentManifest(browserRoot) {
    const libraries = {};
    const combined = createHash('sha256');
    for (const library of PUBLISHED_LIBRARIES) {
        const inventory = buildDirectoryInventory(path.join(browserRoot, library), library);
        libraries[library] = {
            fileCount: inventory.fileCount,
            totalBytes: inventory.totalBytes,
            digest: inventory.digest,
        };
        combined.update(`${library}\0${inventory.digest}\n`);
    }

    return {
        algorithm: 'sha256',
        policyHash: POLICY_HASH,
        combinedDigest: combined.digest('hex'),
        libraries,
    };
}

export function compareInventories(source, published) {
    const sourceByPath = new Map(source.entries.map((entry) => [entry.path, entry]));
    const publishedByPath = new Map(published.entries.map((entry) => [entry.path, entry]));
    const missing = [];
    const extra = [];
    const changed = [];

    for (const [file, sourceEntry] of sourceByPath) {
        const publishedEntry = publishedByPath.get(file);
        if (!publishedEntry) missing.push(file);
        else if (sourceEntry.sha256 !== publishedEntry.sha256) changed.push(file);
    }
    for (const file of publishedByPath.keys()) {
        if (!sourceByPath.has(file)) extra.push(file);
    }

    return {
        equal: missing.length === 0 && extra.length === 0 && changed.length === 0,
        missing,
        extra,
        changed,
    };
}

function resolveLibRoot(consumerRoot) {
    const root = path.resolve(consumerRoot);
    const candidates = [path.join(root, 'lib'), path.join(root, 'wwwroot', 'lib'), root];
    const libRoot = candidates.find((candidate) =>
        existsSync(path.join(candidate, 'ui_components')) &&
        existsSync(path.join(candidate, 'SNAPSHOT.json')),
    );
    if (!libRoot) {
        throw new Error(`Cannot locate lib/SNAPSHOT.json and lib/ui_components under ${root}`);
    }
    return libRoot;
}

export function verifyConsumerSnapshot({ browserRoot, consumerRoot, expectedTree }) {
    const libRoot = resolveLibRoot(consumerRoot);
    const snapshotPath = path.join(libRoot, 'SNAPSHOT.json');
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const errors = [];
    const details = {};

    const recordedTree = snapshot?.bricks4agent?.tree ?? '';
    if (snapshot?.bricks4agent?.dirty !== false) {
        errors.push('snapshot provenance is dirty or does not explicitly declare dirty=false');
    }
    if (!recordedTree || recordedTree !== expectedTree) {
        errors.push(`snapshot tree ${recordedTree || '(missing)'} does not match expected tree ${expectedTree}`);
    }

    const actualContent = buildLibraryContentManifest(libRoot);
    if (!snapshot.content || snapshot.content.policyHash !== POLICY_HASH || snapshot.content.combinedDigest !== actualContent.combinedDigest) {
        errors.push('SNAPSHOT.json content digest is missing or does not match the published files');
    }

    for (const library of PUBLISHED_LIBRARIES) {
        const source = buildDirectoryInventory(path.join(browserRoot, library), library);
        const published = buildDirectoryInventory(path.join(libRoot, library), library, {published:true});
        const comparison = compareInventories(source, published);
        details[library] = comparison;
        if (!comparison.equal) {
            errors.push(`${library} differs: missing=${comparison.missing.length}, extra=${comparison.extra.length}, changed=${comparison.changed.length}`);
        }
    }

    return {
        valid: errors.length === 0,
        consumerRoot: path.resolve(consumerRoot),
        snapshotPath,
        recordedTree,
        expectedTree,
        errors,
        details,
    };
}
