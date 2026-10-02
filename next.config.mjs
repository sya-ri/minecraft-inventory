/** @type {import('next').NextConfig} */
export default {
    async headers() {
        return [
            {
                source: "/items.json",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, max-age=0, must-revalidate",
                    },
                ],
            },
            {
                source: "/items-atlas-:hash.png",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, max-age=31536000, immutable",
                    },
                ],
            },
            {
                source: "/minecraft-assets-:hash.zip",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, max-age=31536000, immutable",
                    },
                ],
            },
        ];
    },
    images: {
        unoptimized: true,
    },
    experimental: {
        webpackBuildWorker: true,
        parallelServerBuildTraces: true,
        parallelServerCompiles: true,
    },
};
