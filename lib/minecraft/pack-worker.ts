import { unzipPack } from "./pack";

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    try {
        const files = unzipPack(new Uint8Array(event.data));
        self.postMessage(
            { files },
            { transfer: Object.values(files).map((bytes) => bytes.buffer) },
        );
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
