import * as THREE from "three";
import { type Assets, resourcePath } from "./assets";
import { DEFAULT_GLINT } from "./defaults";
import nativeGeometry from "./native-geometry.json";
import { PACK_LIMITS } from "./pack";
import {
    type Appearance,
    DYE_COLORS,
    type Element,
    type Face,
    type Model,
    type ModelNode,
    type Special,
    type Tint,
    type Transform,
    type Vec3,
} from "./types";

interface NativePart {
    pose: { offset: number[]; rotation: number[]; scale: number };
    cubes: {
        from: number[];
        size: number[];
        uv: number[];
        inflate: number;
        mirror: boolean;
        faces?: string[];
    }[];
    children: Record<string, NativePart>;
}
interface NativeLayer {
    root: NativePart;
    width: number;
    height: number;
}
const layers = nativeGeometry as Record<string, NativeLayer>;
const radians = Math.PI / 180;
function transform(value?: Transform) {
    const matrix = new THREE.Matrix4();
    if (!value) return matrix;
    matrix.makeTranslation(...(value.translation || [0, 0, 0]));
    if (value.left_rotation)
        matrix.multiply(
            new THREE.Matrix4().makeRotationFromQuaternion(
                new THREE.Quaternion(...value.left_rotation),
            ),
        );
    matrix.scale(new THREE.Vector3(...(value.scale || [1, 1, 1])));
    if (value.right_rotation)
        matrix.multiply(
            new THREE.Matrix4().makeRotationFromQuaternion(
                new THREE.Quaternion(...value.right_rotation),
            ),
        );
    return matrix;
}
export function property(
    node: ModelNode,
    appearance: Appearance,
): string | number | boolean {
    switch (node.property?.replace(/^minecraft:/, "")) {
        case "display_context":
            return "gui";
        case "context_dimension":
            return "minecraft:overworld";
        case "trim_material":
            return appearance.trimMaterial || "";
        case "block_state":
            return (
                appearance.blockState?.[node.block_state_property || ""] || ""
            );
        case "custom_model_data": {
            const index = node.index || 0;
            if (node.type.endsWith("select"))
                return appearance.customModelStrings?.[index] ?? "";
            if (node.type.endsWith("condition"))
                return appearance.customModelFlags?.[index] ?? false;
            return (
                appearance.customModelFloats?.[index] ??
                appearance.customModelData ??
                0
            );
        }
        case "has_component":
            return (
                node.component === "minecraft:dyed_color" &&
                appearance.dye !== undefined
            );
        case "local_time":
            return "01-01";
        case "compass":
        case "time":
        case "use_cycle":
            return 0;
        default:
            return false;
    }
}
export function tintColor(tint: Tint, appearance: Appearance) {
    switch (tint.type.replace(/^minecraft:/, "")) {
        case "constant":
            return tint.value ?? 0xffffff;
        case "dye":
            return appearance.dye ?? tint.default ?? 0xa06540;
        case "potion":
            return appearance.potionColor ?? tint.default ?? 0x385dc6;
        case "firework":
            return tint.default ?? 0x8a8a8a;
        case "custom_model_data":
            return (
                appearance.customModelColors?.[tint.index || 0] ??
                tint.default ??
                0xffffff
            );
        case "grass":
            return 0x91bd59;
        default:
            throw new Error(`Unsupported tint: ${tint.type}`);
    }
}

/** Uses 26.3 cuboid JSON and native mesh data extracted from the official client. */
export class ItemRenderer {
    private renderer: THREE.WebGLRenderer;
    private textures = new Map<string, Promise<THREE.CanvasTexture>>();
    private scene = new THREE.Scene();
    // GuiItemAtlas scales one model unit to the full GUI item cell.
    private camera = new THREE.OrthographicCamera(
        -0.5,
        0.5,
        0.5,
        -0.5,
        0.01,
        100,
    );
    private queue: Promise<unknown> = Promise.resolve();
    private stopped = false;
    private resources = new Set<
        THREE.Material | THREE.BufferGeometry | THREE.Texture
    >();
    constructor(
        readonly assets: Assets,
        readonly size = 128,
    ) {
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: false,
            preserveDrawingBuffer: true,
        });
        this.renderer.setSize(size, size);
        this.renderer.setPixelRatio(1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setClearColor(0, 0);
        this.camera.position.set(0, 0, 10);
        this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
        const light = new THREE.DirectionalLight(0xffffff, 2.1);
        light.position.set(-0.5, 1, 0.75);
        this.scene.add(light);
    }
    render(itemId: string, appearance: Appearance = {}): Promise<Blob> {
        const result = this.queue.then(() => {
            if (this.stopped)
                throw new Error(
                    "Rendering session ended after pack settings changed",
                );
            return this.renderOne(itemId, appearance);
        });
        this.queue = result.catch(() => {});
        return result;
    }
    private async bitmap(path: string) {
        const bitmap = await createImageBitmap(
            new Blob([this.assets.read(path).slice().buffer], {
                type: "image/png",
            }),
        );
        if (bitmap.width * bitmap.height > PACK_LIMITS.pixels) {
            bitmap.close();
            throw new Error(`Texture exceeds pixel limit: ${path}`);
        }
        return bitmap;
    }
    private async rawCanvas(id: string): Promise<HTMLCanvasElement> {
        const path = id.startsWith("data:")
            ? id
            : resourcePath(
                  id.replace(/:textures\//, ":").replace(/\.png$/, ""),
                  "textures",
                  "png",
              );
        const bitmap = path.startsWith("data:")
            ? await createImageBitmap(await (await fetch(path)).blob())
            : await this.bitmap(path);
        const metadata = path.startsWith("data:")
            ? undefined
            : this.assets.optional<{
                  animation?: {
                      width?: number;
                      height?: number;
                      frames?: (number | { index: number })[];
                  };
              }>(`${path}.mcmeta`);
        const animation = metadata?.animation;
        const width =
            animation?.width ||
            (animation ? Math.min(bitmap.width, bitmap.height) : bitmap.width);
        const height = animation?.height || (animation ? width : bitmap.height);
        const first = animation?.frames?.[0] ?? 0;
        const index = typeof first === "number" ? first : first.index;
        if (
            width <= 0 ||
            height <= 0 ||
            width > bitmap.width ||
            height > bitmap.height ||
            !Number.isInteger(index) ||
            index < 0 ||
            index >=
                Math.floor(bitmap.width / width) *
                    Math.floor(bitmap.height / height)
        ) {
            bitmap.close();
            throw new Error(`Invalid animation metadata: ${path}`);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas
            .getContext("2d")
            ?.drawImage(
                bitmap,
                (index % Math.floor(bitmap.width / width)) * width,
                Math.floor(index / Math.floor(bitmap.width / width)) * height,
                width,
                height,
                0,
                0,
                width,
                height,
            );
        bitmap.close();
        return canvas;
    }
    private async canvas(id: string): Promise<HTMLCanvasElement> {
        if (id.startsWith("data:")) return this.rawCanvas(id);
        const sprite = this.assets.sprite(id);
        if (sprite === null)
            throw new Error(`Sprite removed by atlas filter: ${id}`);
        let canvas = await this.rawCanvas(sprite?.resource || id);
        if (sprite?.region) {
            const region = sprite.region;
            const x = Math.floor((region.x * canvas.width) / region.divisorX),
                y = Math.floor((region.y * canvas.height) / region.divisorY);
            const width = Math.floor(
                    (region.width * canvas.width) / region.divisorX,
                ),
                height = Math.floor(
                    (region.height * canvas.height) / region.divisorY,
                );
            if (
                ![x, y, width, height].every(Number.isFinite) ||
                x < 0 ||
                y < 0 ||
                width <= 0 ||
                height <= 0 ||
                x + width > canvas.width ||
                y + height > canvas.height
            )
                throw new Error(`Invalid atlas region: ${id}`);
            const cropped = document.createElement("canvas");
            cropped.width = width;
            cropped.height = height;
            cropped
                .getContext("2d")
                ?.drawImage(canvas, x, y, width, height, 0, 0, width, height);
            canvas = cropped;
        }
        if (sprite?.palette && sprite.paletteKey) {
            const from = await this.rawCanvas(
                    this.paletteId(sprite.paletteKey),
                ),
                to = await this.rawCanvas(this.paletteId(sprite.palette));
            const sourcePixels = from
                .getContext("2d")
                ?.getImageData(0, 0, from.width, from.height).data;
            const targetPixels = to
                .getContext("2d")
                ?.getImageData(0, 0, to.width, to.height).data;
            const context = canvas.getContext("2d");
            if (
                !context ||
                !sourcePixels ||
                !targetPixels ||
                sourcePixels.length !== targetPixels.length
            )
                throw new Error(`Invalid palette: ${id}`);
            const colors = new Map<number, number[]>();
            for (let i = 0; i < sourcePixels.length; i += 4)
                colors.set(
                    (sourcePixels[i] << 16) |
                        (sourcePixels[i + 1] << 8) |
                        sourcePixels[i + 2],
                    [...targetPixels.slice(i, i + 4)],
                );
            const pixels = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            );
            for (let i = 0; i < pixels.data.length; i += 4) {
                const color = colors.get(
                    (pixels.data[i] << 16) |
                        (pixels.data[i + 1] << 8) |
                        pixels.data[i + 2],
                );
                if (color) {
                    pixels.data[i] = color[0];
                    pixels.data[i + 1] = color[1];
                    pixels.data[i + 2] = color[2];
                    pixels.data[i + 3] = Math.round(
                        (pixels.data[i + 3] * color[3]) / 255,
                    );
                }
            }
            context.putImageData(pixels, 0, 0);
        }
        return canvas;
    }
    private paletteId(id: string) {
        if (this.assets.files[resourcePath(id, "textures", "png")]) return id;
        return id.includes(":")
            ? id.replace(":", ":palettes/")
            : `minecraft:palettes/${id}`;
    }
    private texture(id: string) {
        id = id.replace(/:textures\//, ":").replace(/\.png$/, "");
        let promise = this.textures.get(id);
        if (promise) this.textures.delete(id);
        if (!promise) {
            promise = this.canvas(id).then((canvas) =>
                this.canvasTexture(canvas),
            );
        }
        this.textures.set(id, promise);
        return promise;
    }
    private canvasTexture(canvas: HTMLCanvasElement) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        return texture;
    }
    private material(map: THREE.Texture, color = 0xffffff, unlit = false) {
        const config = {
            map,
            color: color & 0xffffff,
            side: THREE.DoubleSide,
            alphaTest: 0.01,
            transparent: true,
            depthWrite: true,
        };
        const material = unlit
            ? new THREE.MeshBasicMaterial(config)
            : new THREE.MeshLambertMaterial(config);
        this.resources.add(material);
        return material;
    }
    private quad(
        points: Vec3[],
        uv: number[],
        material: THREE.Material,
        group: THREE.Group,
        rotation = 0,
    ) {
        const geometry = new THREE.BufferGeometry();
        this.resources.add(geometry);
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
                points.flat().map((v) => v / 16),
                3,
            ),
        );
        const coordinates = [
            [uv[0], uv[3]],
            [uv[2], uv[3]],
            [uv[2], uv[1]],
            [uv[0], uv[1]],
        ];
        const steps = (((rotation / 90) % 4) + 4) % 4;
        geometry.setAttribute(
            "uv",
            new THREE.Float32BufferAttribute(
                points.flatMap((_, i) => [
                    coordinates[(i + steps) % 4][0],
                    1 - coordinates[(i + steps) % 4][1],
                ]),
                2,
            ),
        );
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.computeVertexNormals();
        group.add(new THREE.Mesh(geometry, material));
    }
    private async element(
        element: Element,
        model: Model,
        group: THREE.Group,
        tints: number[],
        unlit = false,
    ) {
        const [x, y, z] = element.from,
            [X, Y, Z] = element.to;
        const points: Record<string, Vec3[]> = {
            south: [
                [x, y, Z],
                [X, y, Z],
                [X, Y, Z],
                [x, Y, Z],
            ],
            north: [
                [X, y, z],
                [x, y, z],
                [x, Y, z],
                [X, Y, z],
            ],
            east: [
                [X, y, Z],
                [X, y, z],
                [X, Y, z],
                [X, Y, Z],
            ],
            west: [
                [x, y, z],
                [x, y, Z],
                [x, Y, Z],
                [x, Y, z],
            ],
            up: [
                [x, Y, Z],
                [X, Y, Z],
                [X, Y, z],
                [x, Y, z],
            ],
            down: [
                [x, y, z],
                [X, y, z],
                [X, y, Z],
                [x, y, Z],
            ],
        };
        const defaults: Record<string, number[]> = {
            north: [16 - X, 16 - Y, 16 - x, 16 - y],
            south: [x, 16 - Y, X, 16 - y],
            west: [z, 16 - Y, Z, 16 - y],
            east: [16 - Z, 16 - Y, 16 - z, 16 - y],
            up: [x, z, X, Z],
            down: [x, 16 - Z, X, 16 - z],
        };
        const part = new THREE.Group();
        for (const [direction, face] of Object.entries(element.faces) as [
            string,
            Face,
        ][]) {
            const texture = await this.texture(
                this.assets.textureReference(model, face.texture),
            );
            const uv = (face.uv || defaults[direction]).map((v) => v / 16);
            this.quad(
                points[direction],
                uv,
                this.material(
                    texture,
                    tints[face.tintindex ?? -1] ?? 0xffffff,
                    unlit,
                ),
                part,
                face.rotation,
            );
        }
        if (element.rotation) {
            const { origin, axis, angle, rescale } = element.rotation;
            const pivot = new THREE.Group();
            pivot.position.set(...(origin.map((v) => v / 16) as Vec3));
            part.position.copy(pivot.position).multiplyScalar(-1);
            pivot.rotation[axis] = angle * radians;
            if (rescale) {
                const scale = 1 / Math.cos(angle * radians);
                pivot.scale.set(
                    axis === "x" ? 1 : scale,
                    axis === "y" ? 1 : scale,
                    axis === "z" ? 1 : scale,
                );
            }
            pivot.add(part);
            group.add(pivot);
        } else group.add(part);
    }
    private gui(model: Model, content: THREE.Group) {
        const pose = model.display?.gui || {};
        const group = new THREE.Group();
        group.position.set(
            ...((pose.translation || [0, 0, 0]).map((v) => v / 16) as Vec3),
        );
        group.rotation.set(
            ...((pose.rotation || [0, 0, 0]).map((v) => v * radians) as Vec3),
            "XYZ",
        );
        group.scale.set(...(pose.scale || [1, 1, 1]));
        const centered = new THREE.Group();
        centered.position.set(-0.5, -0.5, -0.5);
        centered.add(content);
        group.add(centered);
        return group;
    }
    private async model(
        id: string,
        matrix: THREE.Matrix4,
        appearance: Appearance,
        tints: Tint[] = [],
    ) {
        const model = this.assets.model(id),
            group = new THREE.Group();
        const colors = await Promise.all(
            tints.map(async (tint) => {
                if (!tint.type.endsWith("grass"))
                    return tintColor(tint, appearance);
                const canvas = await this.canvas("minecraft:colormap/grass");
                const temperature = Math.max(
                    0,
                    Math.min(1, tint.temperature ?? 0.5),
                );
                const rainfall =
                    Math.max(0, Math.min(1, tint.downfall ?? 1)) * temperature;
                const pixel = canvas
                    .getContext("2d")
                    ?.getImageData(
                        Math.floor((1 - temperature) * 255),
                        Math.floor((1 - rainfall) * 255),
                        1,
                        1,
                    ).data;
                if (!pixel) throw new Error("Grass colormap unavailable");
                return (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
            }),
        );
        if (model.generated) {
            const textures = Object.entries(model.textures || {})
                .filter(([name]) => /^layer\d+$/.test(name))
                .sort(([a], [b]) => a.localeCompare(b));
            for (const [index, [, reference]] of textures.entries()) {
                const texture = await this.texture(
                    this.assets.textureReference(model, reference),
                );
                group.add(
                    this.generated(texture, colors[index] ?? 0xffffff, index),
                );
            }
        } else
            for (const element of model.elements || [])
                await this.element(
                    element,
                    model,
                    group,
                    colors,
                    model.gui_light === "front",
                );
        if (appearance.map && id.endsWith("filled_map"))
            this.quad(
                [
                    [1, 1, 8.6],
                    [15, 1, 8.6],
                    [15, 15, 8.6],
                    [1, 15, 8.6],
                ],
                [0, 0, 1, 1],
                this.material(
                    await this.texture(appearance.map),
                    0xffffff,
                    true,
                ),
                group,
            );
        group.applyMatrix4(matrix);
        return this.gui(model, group);
    }
    private generated(
        texture: THREE.CanvasTexture,
        color: number,
        layer: number,
    ) {
        const canvas = texture.image as HTMLCanvasElement;
        const { width, height } = canvas;
        if (width * height > 262144)
            throw new Error("Generated item texture exceeds 512×512 pixels");
        const pixels = canvas
            .getContext("2d")
            ?.getImageData(0, 0, width, height).data;
        if (!pixels) throw new Error("Generated item canvas unavailable");
        const positions: number[] = [],
            coordinates: number[] = [];
        const face = (points: Vec3[], uv: number[]) => {
            const corners = [
                [uv[0], uv[3]],
                [uv[2], uv[3]],
                [uv[2], uv[1]],
                [uv[0], uv[1]],
            ];
            for (const index of [0, 1, 2, 0, 2, 3]) {
                positions.push(...points[index].map((value) => value / 16));
                coordinates.push(corners[index][0], 1 - corners[index][1]);
            }
        };
        const z = 7.5 + layer * 0.001,
            Z = 8.5 + layer * 0.001;
        face(
            [
                [0, 0, Z],
                [16, 0, Z],
                [16, 16, Z],
                [0, 16, Z],
            ],
            [0, 0, 1, 1],
        );
        face(
            [
                [16, 0, z],
                [0, 0, z],
                [0, 16, z],
                [16, 16, z],
            ],
            [1, 0, 0, 1],
        );
        const opaque = (x: number, y: number) =>
            x >= 0 &&
            y >= 0 &&
            x < width &&
            y < height &&
            pixels[(y * width + x) * 4 + 3] > 0;
        // ItemModelGenerator: 7.5..8.5 depth and a side face at each opaque/transparent edge.
        for (let py = 0; py < height; py++)
            for (let px = 0; px < width; px++) {
                if (!opaque(px, py)) continue;
                const x = (px * 16) / width,
                    X = ((px + 1) * 16) / width;
                const Y = 16 - (py * 16) / height,
                    y = 16 - ((py + 1) * 16) / height;
                const uv = [
                    (px + 0.1) / width,
                    (py + 0.1) / height,
                    (px + 0.9) / width,
                    (py + 0.9) / height,
                ];
                if (!opaque(px, py - 1))
                    face(
                        [
                            [x, Y, Z],
                            [X, Y, Z],
                            [X, Y, z],
                            [x, Y, z],
                        ],
                        uv,
                    );
                if (!opaque(px, py + 1))
                    face(
                        [
                            [x, y, z],
                            [X, y, z],
                            [X, y, Z],
                            [x, y, Z],
                        ],
                        uv,
                    );
                if (!opaque(px - 1, py))
                    face(
                        [
                            [x, y, z],
                            [x, y, Z],
                            [x, Y, Z],
                            [x, Y, z],
                        ],
                        uv,
                    );
                if (!opaque(px + 1, py))
                    face(
                        [
                            [X, y, Z],
                            [X, y, z],
                            [X, Y, z],
                            [X, Y, Z],
                        ],
                        uv,
                    );
            }
        const geometry = new THREE.BufferGeometry();
        this.resources.add(geometry);
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute(
            "uv",
            new THREE.Float32BufferAttribute(coordinates, 2),
        );
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, this.material(texture, color, true));
    }
    private async nativePart(
        part: NativePart,
        layer: NativeLayer,
        texture: THREE.Texture,
        name = "",
        alternate?: (name: string) => Promise<THREE.Texture>,
    ) {
        const group = new THREE.Group();
        group.name = name;
        group.position.set(...(part.pose.offset.map((v) => v / 16) as Vec3));
        group.rotation.set(...(part.pose.rotation as Vec3), "ZYX");
        group.scale.setScalar(part.pose.scale);
        const material = this.material(
            alternate ? await alternate(name) : texture,
        );
        for (const cube of part.cubes) {
            const [x, y, z] = cube.from,
                [w, h, d] = cube.size,
                [u, v] = cube.uv,
                f = cube.inflate;
            const from: Vec3 = [x - f, y - f, z - f],
                to: Vec3 = [x + w + f, y + h + f, z + d + f];
            const [a, b, c] = from,
                [A, B, C] = to;
            const faces: Record<string, { points: Vec3[]; uv: number[] }> = {
                west: {
                    points: [
                        [a, b, c],
                        [a, b, C],
                        [a, B, C],
                        [a, B, c],
                    ],
                    uv: [u, v + d, u + d, v + d + h],
                },
                north: {
                    points: [
                        [A, b, c],
                        [a, b, c],
                        [a, B, c],
                        [A, B, c],
                    ],
                    uv: [u + d, v + d, u + d + w, v + d + h],
                },
                east: {
                    points: [
                        [A, b, C],
                        [A, b, c],
                        [A, B, c],
                        [A, B, C],
                    ],
                    uv: [u + d + w, v + d, u + 2 * d + w, v + d + h],
                },
                south: {
                    points: [
                        [a, b, C],
                        [A, b, C],
                        [A, B, C],
                        [a, B, C],
                    ],
                    uv: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
                },
                up: {
                    points: [
                        [a, B, C],
                        [A, B, C],
                        [A, B, c],
                        [a, B, c],
                    ],
                    uv: [u + d, v, u + d + w, v + d],
                },
                down: {
                    points: [
                        [a, b, c],
                        [A, b, c],
                        [A, b, C],
                        [a, b, C],
                    ],
                    uv: [u + d + w, v + d, u + d + 2 * w, v],
                },
            };
            for (const [direction, face] of Object.entries(faces)) {
                if (cube.faces && !cube.faces.includes(direction.toUpperCase()))
                    continue;
                const uv = face.uv.map(
                    (n, i) => n / (i % 2 ? layer.height : layer.width),
                );
                if (cube.mirror) [uv[0], uv[2]] = [uv[2], uv[0]];
                // Native model UVs use top-down Y, unlike block model coordinates.
                this.quad(
                    face.points,
                    [uv[0], uv[3], uv[2], uv[1]],
                    material,
                    group,
                );
            }
        }
        for (const [childName, child] of Object.entries(part.children))
            group.add(
                await this.nativePart(
                    child,
                    layer,
                    texture,
                    childName,
                    alternate,
                ),
            );
        return group;
    }
    private async patterns(
        kind: "banner" | "shield",
        appearance: Appearance,
        base: string,
    ) {
        const canvas = await this.rawCanvas(
            `minecraft:entity/${kind}/${kind}_base`,
        );
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Pattern canvas unavailable");
        const overlay = async (pattern: string, color: string) => {
            const [namespace, name] = pattern.includes(":")
                ? pattern.split(":")
                : ["minecraft", pattern];
            const image = await this.rawCanvas(
                `${namespace}:entity/${kind}/${name}`,
            );
            const ctx = image.getContext("2d");
            if (!ctx) return;
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = `#${(DYE_COLORS[color] ?? 0xffffff).toString(16).padStart(6, "0")}`;
            ctx.fillRect(0, 0, image.width, image.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
        };
        await overlay("base", base);
        for (const pattern of appearance.patterns || [])
            await overlay(pattern.pattern, pattern.color);
        const texture = this.canvasTexture(canvas);
        this.resources.add(texture);
        return texture;
    }
    private async special(descriptor: Special, appearance: Appearance) {
        const kind = descriptor.type.replace(/^minecraft:/, ""),
            group = new THREE.Group();
        let key: string, texture: THREE.Texture;
        switch (kind) {
            case "chest":
                key = "chest";
                texture = await this.texture(
                    (descriptor.texture || "minecraft:normal").replace(
                        ":",
                        ":entity/chest/",
                    ),
                );
                break;
            case "shulker_box":
                key = "shulker";
                texture = await this.texture(
                    (descriptor.texture || "minecraft:shulker").replace(
                        ":",
                        ":entity/shulker/",
                    ),
                );
                break;
            case "conduit":
                key = "conduit";
                texture = await this.texture("minecraft:entity/conduit/base");
                break;
            case "trident":
                key = "trident";
                texture = await this.texture(
                    "minecraft:entity/trident/trident",
                );
                break;
            case "shield":
                key = "shield";
                texture =
                    appearance.baseColor || appearance.patterns?.length
                        ? await this.patterns(
                              "shield",
                              appearance,
                              appearance.baseColor || "white",
                          )
                        : await this.texture(
                              "minecraft:entity/shield/shield_base_nopattern",
                          );
                break;
            case "banner": {
                const base = await this.texture(
                    "minecraft:entity/banner/banner_base",
                );
                group.add(
                    await this.nativePart(
                        layers.banner.root,
                        layers.banner,
                        base,
                    ),
                );
                const flag = await this.nativePart(
                    layers.flag.root,
                    layers.flag,
                    await this.patterns(
                        "banner",
                        appearance,
                        appearance.baseColor || descriptor.color || "white",
                    ),
                );
                flag.getObjectByName("flag")?.rotateX(-0.0025 * Math.PI);
                group.add(flag);
                return group;
            }
            case "copper_golem_statue":
                key = descriptor.pose || "standing";
                texture = await this.texture(
                    descriptor.texture ||
                        "minecraft:entity/copper_golem/copper_golem",
                );
                break;
            case "head": {
                const head = descriptor.kind || "skeleton";
                key =
                    head === "dragon"
                        ? "dragon"
                        : head === "piglin"
                          ? "piglin"
                          : ["zombie", "player"].includes(head)
                            ? "humanoid"
                            : "skull";
                const paths: Record<string, string> = {
                    skeleton: "skeleton/skeleton",
                    wither_skeleton: "skeleton/wither_skeleton",
                    zombie: "zombie/zombie",
                    creeper: "creeper/creeper",
                    dragon: "enderdragon/dragon",
                    piglin: "piglin/piglin",
                    player: "player/wide/steve",
                };
                texture = await this.texture(
                    head === "player" && appearance.skin
                        ? appearance.skin
                        : descriptor.texture
                          ? descriptor.texture.replace(":", ":entity/")
                          : `minecraft:entity/${paths[head]}`,
                );
                break;
            }
            case "player_head":
                key = "humanoid";
                texture = await this.texture(
                    appearance.skin || "minecraft:entity/player/wide/steve",
                );
                break;
            case "decorated_pot": {
                const base = await this.texture(
                    "minecraft:entity/decorated_pot/decorated_pot_base",
                );
                group.add(
                    await this.nativePart(
                        layers.potBase.root,
                        layers.potBase,
                        base,
                    ),
                );
                const names = ["back", "left", "right", "front"];
                group.add(
                    await this.nativePart(
                        layers.potSides.root,
                        layers.potSides,
                        base,
                        "",
                        async (name) => {
                            const decoration =
                                appearance.potDecorations?.[
                                    names.indexOf(name)
                                ];
                            return this.texture(
                                `minecraft:entity/decorated_pot/${decoration?.replace(/^minecraft:/, "").replace(/_pottery_sherd$/, "_pottery_pattern") || "decorated_pot_side"}`,
                            );
                        },
                    ),
                );
                return group;
            }
            default:
                throw new Error(
                    `Unsupported special model: ${descriptor.type}`,
                );
        }
        const layer = layers[key];
        if (!layer) throw new Error(`Missing native geometry: ${key}`);
        const object = await this.nativePart(layer.root, layer, texture);
        if (kind === "copper_golem_statue") {
            object.position.y = 0;
            object.rotation.z = Math.PI;
        }
        if (kind === "head" && descriptor.kind === "dragon")
            object.getObjectByName("jaw")?.rotateX(0.2);
        if (kind === "head" && descriptor.kind === "piglin") {
            const left = object.getObjectByName("left_ear"),
                right = object.getObjectByName("right_ear");
            if (left) left.rotation.z = -0.7;
            if (right) right.rotation.z = 0.7;
        }
        if (kind === "chest" && descriptor.openness) {
            object
                .getObjectByName("lid")
                ?.rotateX((-descriptor.openness * Math.PI) / 2);
            object
                .getObjectByName("lock")
                ?.rotateX((-descriptor.openness * Math.PI) / 2);
        }
        group.add(object);
        return group;
    }
    private async node(
        node: ModelNode,
        appearance: Appearance,
        inherited = new THREE.Matrix4(),
        depth = 0,
    ): Promise<THREE.Group> {
        if (depth > 64) throw new Error("Item model exceeds recursion limit");
        const matrix = inherited
            .clone()
            .multiply(transform(node.transformation));
        const group = new THREE.Group();
        const visit = (child: ModelNode | undefined) => {
            if (!child) throw new Error(`Missing branch in ${node.type}`);
            return this.node(child, appearance, matrix, depth + 1);
        };
        switch (node.type.replace(/^minecraft:/, "")) {
            case "model":
                if (typeof node.model !== "string")
                    throw new Error("Invalid model reference");
                return this.model(node.model, matrix, appearance, node.tints);
            case "special": {
                if (!node.model || typeof node.model === "string" || !node.base)
                    throw new Error("Invalid special model");
                const object = await this.special(node.model, appearance);
                object.applyMatrix4(matrix);
                return this.gui(this.assets.model(node.base), object);
            }
            case "composite":
                for (const child of node.models || [])
                    group.add(await visit(child));
                return group;
            case "select": {
                const value = String(property(node, appearance));
                const match = node.cases?.find((c) =>
                    (Array.isArray(c.when) ? c.when : [c.when]).includes(value),
                );
                return visit(match?.model || node.fallback);
            }
            case "condition":
                return visit(
                    property(node, appearance) ? node.on_true : node.on_false,
                );
            case "range_dispatch": {
                const value =
                    Number(property(node, appearance)) * (node.scale ?? 1);
                const match = [...(node.entries || [])]
                    .sort((a, b) => b.threshold - a.threshold)
                    .find((entry) => value >= entry.threshold);
                return visit(match?.model || node.fallback);
            }
            case "empty":
            case "bundle/selected_item":
                return group;
            default:
                throw new Error(`Unsupported item node: ${node.type}`);
        }
    }
    private async renderOne(itemId: string, appearance: Appearance) {
        let group: THREE.Group | undefined;
        try {
            group = await this.node(
                this.assets.definition(itemId, appearance),
                appearance,
            );
            this.scene.add(group);
            this.renderer.render(this.scene, this.camera);
            const canvas = document.createElement("canvas");
            canvas.width = this.size;
            canvas.height = this.size;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas unavailable");
            ctx.drawImage(this.renderer.domElement, 0, 0);
            if (appearance.enchanted ?? DEFAULT_GLINT.has(itemId)) {
                const mask = document.createElement("canvas");
                mask.width = this.size;
                mask.height = this.size;
                const context = mask.getContext("2d");
                if (context) {
                    context.drawImage(canvas, 0, 0);
                    context.globalCompositeOperation = "source-in";
                    context.globalAlpha = 0.45;
                    context.drawImage(
                        await this.rawCanvas(
                            "minecraft:misc/enchanted_glint_item",
                        ),
                        0,
                        0,
                        this.size,
                        this.size,
                    );
                    ctx.drawImage(mask, 0, 0);
                }
            }
            return await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob(
                    (blob) =>
                        blob
                            ? resolve(blob)
                            : reject(new Error("PNG encoding failed")),
                    "image/png",
                ),
            );
        } finally {
            if (group) this.scene.remove(group);
            for (const resource of this.resources) resource.dispose();
            this.resources.clear();
            while (this.textures.size > 128) {
                const oldest = this.textures.entries().next().value;
                if (!oldest) break;
                this.textures.delete(oldest[0]);
                try {
                    (await oldest[1]).dispose();
                } catch {}
            }
        }
    }
    async dispose() {
        this.stopped = true;
        await this.queue;
        for (const promise of this.textures.values()) {
            try {
                (await promise).dispose();
            } catch {}
        }
        this.textures.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }
}
