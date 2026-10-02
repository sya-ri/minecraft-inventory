const DB_NAME = "minecraft-inventory-assets";
export async function storage<T>(
    key: string,
    value?: T,
): Promise<T | undefined> {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () =>
            request.result.createObjectStore("assets");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(
                new Error(
                    request.error?.message ||
                        "Asset storage could not be opened",
                    { cause: request.error },
                ),
            );
    });
    try {
        return await new Promise<T | undefined>((resolve, reject) => {
            const transaction = database.transaction(
                "assets",
                value === undefined ? "readonly" : "readwrite",
            );
            const store = transaction.objectStore("assets");
            const request =
                value === undefined ? store.get(key) : store.put(value, key);
            transaction.oncomplete = () =>
                resolve(
                    value === undefined
                        ? (request.result as T | undefined)
                        : value,
                );
            transaction.onerror = () =>
                reject(
                    new Error(
                        transaction.error?.message ||
                            "Storage transaction failed",
                        { cause: transaction.error },
                    ),
                );
            transaction.onabort = () =>
                reject(
                    new Error(
                        transaction.error?.message ||
                            "Storage transaction aborted",
                        { cause: transaction.error },
                    ),
                );
        });
    } finally {
        database.close();
    }
}
