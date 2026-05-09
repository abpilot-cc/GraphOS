const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"; // Base32 (RFC)

function uuidToBytes(uuid: string): Uint8Array {
    const hex = uuid.replace(/-/g, "");
    const bytes = new Uint8Array(16);

    for (let i = 0; i < 16; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, 2), 16);
    }

    return bytes;
}

function base32Encode(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let output = "";

    for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i] as number;
        bits += 8;

        while (bits >= 5) {
            output += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
}

// UUID v4（兼容 Cocos / 小游戏）
export function uuidv4(): string {
    // 优先使用系统能力
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // fallback
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// 最终：UUID → Base32
export function uuidBase32(prefix?: string): string {
    const uuid = uuidv4();
    const bytes = uuidToBytes(uuid);
    const id = base32Encode(bytes);
    return prefix ? `${prefix}_${id}` : id;
}