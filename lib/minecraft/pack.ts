import { Unzip, UnzipInflate } from "fflate";
import { json } from "./assets";
import type { Files, ResourcePack } from "./types";

export const PACK_LIMITS = {
    input: 128 * 1024 * 1024,
    total: 256 * 1024 * 1024,
    file: 16 * 1024 * 1024,
    entries: 20000,
    pixels: 16 * 1024 * 1024,
};
export function safePath(path: string) {
    if (
        path.includes("\\") ||
        path.startsWith("/") ||
        path.includes("\0") ||
        path.split("/").some((p) => p === ".." || p === ".") ||
        /^[a-z]:/i.test(path)
    )
        throw new Error(`Unsafe archive path: ${path}`);
    return path;
}
function relevant(path: string) {
    return /(?:^|\/)pack\.mcmeta$|\.(?:json|png|png\.mcmeta)$/.test(path);
}
function crc32(bytes: Uint8Array) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function zipDirectory(input: Uint8Array) {
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    let end = input.length - 22;
    while (
        end >= Math.max(0, input.length - 65557) &&
        view.getUint32(end, true) !== 0x06054b50
    )
        end--;
    if (
        end < 0 ||
        end + 22 > input.length ||
        view.getUint32(end, true) !== 0x06054b50 ||
        end + 22 + view.getUint16(end + 20, true) !== input.length
    )
        throw new Error("Invalid or incomplete ZIP directory");
    const count = view.getUint16(end + 10, true),
        start = view.getUint32(end + 16, true);
    if (
        view.getUint16(end + 4, true) ||
        view.getUint16(end + 6, true) ||
        count > PACK_LIMITS.entries ||
        count === 65535
    )
        throw new Error("Unsupported split/ZIP64 archive or too many entries");
    const entries = new Map<string, { size: number; crc: number }>();
    let offset = start,
        total = 0;
    for (let i = 0; i < count; i++) {
        if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
            throw new Error("Invalid ZIP entry");
        const length = view.getUint16(offset + 28, true),
            extra = view.getUint16(offset + 30, true),
            comment = view.getUint16(offset + 32, true);
        if (offset + 46 + length + extra + comment > end)
            throw new Error("Invalid ZIP entry length");
        const name = safePath(
            new TextDecoder().decode(
                input.subarray(offset + 46, offset + 46 + length),
            ),
        );
        const flags = view.getUint16(offset + 8, true),
            compression = view.getUint16(offset + 10, true),
            size = view.getUint32(offset + 24, true),
            compressed = view.getUint32(offset + 20, true),
            local = view.getUint32(offset + 42, true);
        if (
            flags & 1 ||
            ![0, 8].includes(compression) ||
            ((view.getUint32(offset + 38, true) >>> 16) & 0xf000) === 0xa000
        )
            throw new Error(`Unsupported encrypted/linked ZIP entry: ${name}`);
        if (
            local + 30 > start ||
            view.getUint32(local, true) !== 0x04034b50 ||
            local +
                30 +
                view.getUint16(local + 26, true) +
                view.getUint16(local + 28, true) +
                compressed >
                start
        )
            throw new Error(`Invalid ZIP file bounds: ${name}`);
        const localName = new TextDecoder().decode(
            input.subarray(
                local + 30,
                local + 30 + view.getUint16(local + 26, true),
            ),
        );
        if (localName !== name || entries.has(name))
            throw new Error(`Duplicate or mismatched ZIP entry: ${name}`);
        if (relevant(name)) {
            total += size;
            if (size > PACK_LIMITS.file || total > PACK_LIMITS.total)
                throw new Error("Decompressed pack exceeds limits");
        }
        entries.set(name, { size, crc: view.getUint32(offset + 16, true) });
        offset += 46 + length + extra + comment;
    }
    if (offset !== end) throw new Error("ZIP directory size mismatch");
    return entries;
}
export function unzipPack(input: Uint8Array): Files {
    if (input.byteLength > PACK_LIMITS.input)
        throw new Error("ZIP exceeds 128 MiB");
    const directory = zipDirectory(input);
    const files: Files = Object.create(null);
    let total = 0,
        entries = 0;
    const unzip = new Unzip((file) => {
        safePath(file.name);
        if (++entries > PACK_LIMITS.entries)
            throw new Error("Too many ZIP entries");
        if (!relevant(file.name)) return;
        if (file.originalSize && file.originalSize > PACK_LIMITS.file)
            throw new Error(`File exceeds 16 MiB: ${file.name}`);
        if (Object.hasOwn(files, file.name))
            throw new Error(`Duplicate ZIP entry: ${file.name}`);
        files[file.name] = new Uint8Array();
        const chunks: Uint8Array[] = [];
        let size = 0;
        file.ondata = (error, bytes, final) => {
            if (error) throw error;
            size += bytes.length;
            total += bytes.length;
            if (size > PACK_LIMITS.file || total > PACK_LIMITS.total) {
                file.terminate();
                throw new Error("Decompressed pack exceeds limits");
            }
            chunks.push(bytes);
            if (final) {
                const result = new Uint8Array(size);
                let offset = 0;
                for (const chunk of chunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                }
                const expected = directory.get(file.name);
                if (
                    !expected ||
                    expected.size !== size ||
                    expected.crc !== crc32(result)
                )
                    throw new Error(`ZIP CRC/size mismatch: ${file.name}`);
                files[file.name] = result;
            }
        };
        file.start();
    });
    unzip.register(UnzipInflate);
    for (let offset = 0; offset < input.length; offset += 65536)
        unzip.push(
            input.subarray(offset, offset + 65536),
            offset + 65536 >= input.length,
        );
    for (const [name, metadata] of directory)
        if (relevant(name) && files[name]?.length !== metadata.size)
            throw new Error(`Incomplete ZIP entry: ${name}`);
    return files;
}
export function normalizePack(files: Files): Files {
    const roots = Object.keys(files).filter((path) =>
        /(?:^|\/)pack\.mcmeta$/.test(path),
    );
    const root = roots.includes("pack.mcmeta")
        ? "pack.mcmeta"
        : roots.length === 1
          ? roots[0]
          : undefined;
    if (!root)
        throw new Error("Select one resource pack containing pack.mcmeta");
    const prefix = root.slice(0, -"pack.mcmeta".length);
    return Object.fromEntries(
        Object.entries(files)
            .filter(([path]) => path.startsWith(prefix))
            .map(([path, bytes]) => [
                safePath(path.slice(prefix.length)),
                bytes,
            ]),
    );
}
export async function digest(bytes: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
    return [...new Uint8Array(hash)]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
}
export async function makePack(
    name: string,
    original: Files,
): Promise<ResourcePack> {
    const files = normalizePack(original);
    const metadata = json<{
        pack?: {
            pack_format?: number;
            min_format?: number | number[];
            max_format?: number | number[];
        };
        filter?: { block?: { namespace?: string; path?: string }[] };
    }>(files, "pack.mcmeta");
    if (
        !metadata?.pack ||
        (metadata.pack.pack_format === undefined &&
            metadata.pack.min_format === undefined)
    )
        throw new Error("Invalid pack.mcmeta");
    for (const block of metadata.filter?.block || []) {
        if (block.namespace) new RegExp(block.namespace);
        if (block.path) new RegExp(block.path);
    }
    const warnings: string[] = [];
    if ((metadata.pack.pack_format ?? 97) !== 97)
        warnings.push(
            "Legacy pack: item models are adapted; other version differences may need changes.",
        );
    if (Object.keys(files).some((p) => /(?:optifine|mcpatcher)\//.test(p)))
        warnings.push("OptiFine / MOD extensions are not rendered.");
    for (const [path, bytes] of Object.entries(files)) {
        if (/\.(?:json|mcmeta)$/.test(path)) {
            try {
                JSON.parse(new TextDecoder().decode(bytes));
            } catch {
                throw new Error(`Invalid JSON: ${path}`);
            }
        }
        if (path.endsWith(".png")) {
            if (
                bytes.length < 33 ||
                [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)
            )
                throw new Error(`Invalid PNG: ${path}`);
            const view = new DataView(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength,
            );
            if (
                !view.getUint32(16) ||
                !view.getUint32(20) ||
                view.getUint32(16) * view.getUint32(20) > PACK_LIMITS.pixels
            )
                throw new Error(`PNG dimensions exceed limits: ${path}`);
            if (typeof createImageBitmap !== "undefined") {
                try {
                    const bitmap = await createImageBitmap(
                        new Blob([bytes.slice().buffer], { type: "image/png" }),
                    );
                    bitmap.close();
                } catch {
                    throw new Error(`PNG cannot be decoded: ${path}`);
                }
            }
        }
    }
    const identities = await Promise.all(
        Object.keys(files)
            .sort()
            .map(async (p) => `${p}:${await digest(files[p])}`),
    );
    return {
        id: await digest(new TextEncoder().encode(identities.join("\n"))),
        name,
        enabled: true,
        files,
        warnings,
    };
}
